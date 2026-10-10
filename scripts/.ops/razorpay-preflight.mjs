// ============================================================
// RAZORPAY PREFLIGHT — what state is checkout actually in?
//
// Why this does NOT log into Razorpay: the Supabase Management API
// returns a SHA-256 HASH of a secret when you read it back, never the
// value. So a script outside the edge function can never see the real
// key secret, and must never try to authenticate with the hash (that
// is the mistake this script used to make — it reported a false FAIL).
//
// What it CAN do reliably:
//   * tell whether the checkout gate is on, by comparing the stored
//     gate secret against sha256("true") (the hashing is plain SHA-256),
//   * report which Razorpay secrets are present (names only),
//   * read the live database for real evidence: orders created, any
//     settled payment, and webhook/billing events.
//
// The Key ID / Key Secret themselves are validated where they are typed
// in — by scripts/.ops/set-razorpay-live.ps1, which tests them against
// Razorpay BEFORE storing them.
//
//   node scripts/.ops/razorpay-preflight.mjs
// ============================================================

import { createHash } from "node:crypto";
import { getEnv, runQuery } from "./_db.mjs";

const sha256 = (s) => createHash("sha256").update(s).digest("hex");
const ref = getEnv("SUPABASE_PROJECT_REF") ?? "zvohdvopmvzsujktrdmu";
const token = getEnv("SUPABASE_ACCESS_TOKEN");
if (!token) {
  console.error("SUPABASE_ACCESS_TOKEN missing from .env");
  process.exit(2);
}

const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/secrets`, {
  headers: { Authorization: `Bearer ${token}` },
});
if (!res.ok) {
  console.error(`secrets fetch failed: HTTP ${res.status}`);
  process.exit(2);
}
const secrets = Object.fromEntries((await res.json()).map((s) => [s.name, s.value]));

const set = (name) => Boolean(secrets[name] && secrets[name].length > 0);
const gateOn = secrets.RAZORPAY_CHECKOUT_ENABLED === sha256("true");

console.log("Razorpay preflight (read-only) for", ref);
console.log("");
console.log("Secrets present (values are write-only; read-back is a hash):");
for (const n of ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET"]) {
  console.log(`  ${set(n) ? "yes" : "NO "}  ${n}`);
}
console.log(`  ${gateOn ? "ON " : "OFF"}  RAZORPAY_CHECKOUT_ENABLED (== sha256("true")? ${gateOn})`);

console.log("");
console.log("Live database evidence:");
try {
  const byStatus = await runQuery("select status, count(*)::int n from payments group by status order by status");
  if (byStatus.length === 0) console.log("  payments: none yet");
  for (const r of byStatus) console.log(`  payments ${r.status}: ${r.n}`);

  const latest = await runQuery(
    "select max(created_at) latest_order, max(paid_at) latest_paid from payments",
  );
  console.log(`  latest order: ${latest[0]?.latest_order ?? "—"}`);
  console.log(`  latest paid : ${latest[0]?.latest_paid ?? "—"}`);

  const be = await runQuery("select count(*)::int n from billing_events");
  console.log(`  billing_events (webhook wrote a plan change): ${be[0]?.n ?? 0}`);
} catch (e) {
  console.log("  (could not read db:", e instanceof Error ? e.message.slice(0, 120) : e, ")");
}

console.log("");
const ready = set("RAZORPAY_KEY_ID") && set("RAZORPAY_KEY_SECRET") && gateOn;
if (ready) {
  console.log("VERDICT: checkout is configured and the gate is ON.");
  console.log("         Domestic cards can pay now. International cards use the SAME");
  console.log("         checkout and light up as soon as Razorpay approves them.");
  console.log("         To prove the full loop, complete one payment and re-run this:");
  console.log("         a new 'paid' row + a billing_events row means the webhook granted the plan.");
} else {
  console.log("VERDICT: checkout is not ready. Run set-razorpay-live.ps1 and enable the gate.");
}
