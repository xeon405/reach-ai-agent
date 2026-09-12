// SIM proof: calendly-webhook pure-logic invariants (attribution + HMAC).
// Offline, seconds-fast, no network. Covers the normalization and signature
// mechanics the live proof can't easily parametrize. The scheduling-normalization
// here mirrors the deployed function's ownerKey() exactly.
import { createHmac } from "node:crypto";

let passed = 0;
let failed = 0;
const failures = [];
function assert(cond, label, extra = "") {
  if (cond) { passed++; console.log(`  PASS ${label}`); }
  else { failed++; failures.push(label); console.log(`  FAIL ${label}${extra ? "  " + extra : ""}`); }
}

// ---- MIRROR of supabase/functions/calendly-webhook/index.ts ownerKey() ----
function ownerKey(raw) {
  let s = String(raw ?? "").trim();
  try {
    const u = new URL(s);
    s = u.hostname.replace(/^www\./, "").toLowerCase() + u.pathname.toLowerCase();
  } catch {
    s = s.replace(/^https?:\/\//i, "").replace(/^www\./i, "").toLowerCase();
  }
  const [host, seg] = s.split("/");
  return seg ? `${host}/${seg}` : host;
}

// ---- MIRROR of the function's signature check (Calendly-Webhook-Signature) ----
function sig(secret, ts, rawBody) {
  return createHmac("sha256", secret).update(`${ts}.${rawBody}`).digest("hex");
}
const V1_RE = /^[0-9a-f]{64}$/;
function hexEqual(expected, v1) {
  if (!V1_RE.test(v1)) return false;
  if (expected.length !== v1.length) return false;
  let diff = 0;
  for (let i = 0; i < v1.length; i++) {
    diff |= expected.charCodeAt(i) ^ v1.charCodeAt(i);
  }
  return diff === 0;
}
function verify(secret, rawBody, header) {
  try {
    const parts = Object.fromEntries(header.split(",").map((p) => p.split("=").map((x) => x.trim())));
    const ts = Number(parts["t"]);
    const v1 = String(parts["v1"] ?? "");
    if (!Number.isFinite(ts) || v1.length === 0 || Math.abs(Date.now() / 1000 - ts) > 300) return false;
    return hexEqual(sig(secret, ts, rawBody), v1);
  } catch {
    return false;
  }
}

const SECRET = "test-secret";
const body = JSON.stringify({ event: "invitee.created", payload: { n: 1 } });
const nowTs = Math.floor(Date.now() / 1000);
const good = `t=${nowTs},v1=${sig(SECRET, nowTs, body)}`;

console.log("ownerKey normalization:");
assert(ownerKey("https://calendly.com/jane/15min") === ownerKey("https://www.calendly.com/JANE/15min"), "https + www + case + depth fold to one key");
assert(ownerKey("calendly.com/jane") === ownerKey("https://calendly.com/jane/"), "no-protocol and trailing slash fold");
assert(ownerKey("https://calendly.com/acme/intro") === ownerKey("https://calendly.com/acme"), "org-page booking link matches its event pages");
assert(ownerKey("https://calendly.com/jane") === "calendly.com/jane", "shape stays host/accountKey");
assert(ownerKey("https://calendly.com/JANE/15min") === "calendly.com/jane", "case-folded key returned");
assert(ownerKey("https://calendly.com/jane/") === ownerKey("https://calendly.com/jane"), "trailing slash ignored");
assert(ownerKey("https://calendly.com/jane") !== ownerKey("https://calendly.com/john"), "different accounts stay different");
assert(ownerKey("https://cal.com/jane") !== ownerKey("https://calendly.com/jane"), "different host never collides");
assert(ownerKey("") === "", "empty input yields empty key (no crash)");
assert(ownerKey("not a url") !== "", "garbage input yields a key without throwing");

console.log("HMAC signature (Calendly-Webhook-Signature):");
assert(sig("x", nowTs, "a") !== sig("y", nowTs, "a"), "secret changes digest");
assert(sig("x", nowTs, "a") !== sig("x", nowTs, "b"), "body change changes digest");
assert(verify(SECRET, body, good), "well-formed t/v1 header verifies");
const tamperedV1 = sig(SECRET, nowTs, body).slice(0, -1) + (sig(SECRET, nowTs, body).endsWith("0") ? "1" : "0");
assert(!verify(SECRET, body, `t=${nowTs},v1=${tamperedV1}`), "tampered signature rejects");
assert(!verify(SECRET, body, ""), "empty header rejects");
assert(!verify(SECRET, body, "t=abc,v1=zz!"), "malformed t / non-hex v1 rejects without throwing");
assert(!verify("other", body, good), "wrong secret rejects");
assert(!verify(SECRET, body, `t=${nowTs - 400},v1=${sig(SECRET, nowTs - 400, body)}`), "stale timestamp (>300s) rejects");
assert(verify(SECRET, body, `t=${nowTs + 1},v1=${sig(SECRET, nowTs + 1, body)}`), "fresh timestamp verifies");
assert(!verify(SECRET, body, `t=${nowTs},v1=${sig(SECRET, nowTs, body).toUpperCase()}`), "uppercase v1 rejected by format gate");
assert(!verify(SECRET, body, `t=${nowTs},v1=${sig(SECRET, nowTs, body).slice(0, 63)}`), "63-char v1 rejected (length/format gate)");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) { console.log("failures:", failures.join("; ")); process.exit(1); }