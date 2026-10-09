// ============================================================
// RAZORPAY PREFLIGHT — can this account actually take money, in USD?
//
// Answers the one question that decides whether checkout can be
// switched on: does the live Razorpay account accept a USD order
// (the international-card path), and is the webhook secret set?
//
// It creates ONE abandoned order of $1 in USD. Creating an order
// never charges anyone — it is the same first step the real checkout
// takes. No card, no payment, no customer. The order simply expires.
//
// The key id and key secret are read from Supabase project secrets at
// runtime and are never printed. Only the verdict is.
//
//   node scripts/.ops/razorpay-preflight.mjs
// ============================================================

import { getEnv } from "./_db.mjs";

const ref = getEnv("SUPABASE_PROJECT_REF") ?? "zvohdvopmvzsujktrdmu";
const token = getEnv("SUPABASE_ACCESS_TOKEN");
if (!token) {
  console.error("SUPABASE_ACCESS_TOKEN missing from .env");
  process.exit(2);
}

async function secrets() {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/secrets`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`secrets fetch failed: HTTP ${res.status}`);
  return Object.fromEntries((await res.json()).map((s) => [s.name, s.value]));
}

const s = await secrets();
const keyId = s.RAZORPAY_KEY_ID ?? "";
const keySecret = s.RAZORPAY_KEY_SECRET ?? "";
const gateOn = s.RAZORPAY_CHECKOUT_ENABLED === "true";
const webhookSecretSet = Boolean(s.RAZORPAY_WEBHOOK_SECRET);

const say = (label, ok, detail) =>
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? "  — " + detail : ""}`);

console.log("Razorpay preflight for project", ref);
console.log(`key id: ${keyId ? keyId.slice(0, 8) + "…" : "(missing)"}`);
console.log(`checkout gate: ${gateOn ? "ON" : "OFF"}`);
console.log(`webhook secret: ${webhookSecretSet ? "set" : "MISSING"}`);
console.log("");

if (!keyId || !keySecret) {
  say("credentials present", false, "RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET not set");
  process.exit(1);
}

const auth = "Basic " + Buffer.from(`${keyId}:${keySecret}`).toString("base64");

// 1) Auth works at all.
let authOk = false;
try {
  const res = await fetch("https://api.razorpay.com/v1/orders?count=1", {
    headers: { Authorization: auth },
  });
  authOk = res.ok;
  const body = await res.text();
  say("Razorpay auth", res.ok, res.ok ? "ok" : `HTTP ${res.status} ${body.slice(0, 200)}`);
} catch (e) {
  say("Razorpay auth", false, e instanceof Error ? e.message : String(e));
}

// 2) USD (international) order accepted.
let intlOk = false;
let intlDetail = "";
try {
  const res = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: JSON.stringify({
      amount: 100, // $1.00 in cents
      currency: "USD",
      receipt: `preflight_${Date.now()}`,
      notes: { preflight: "true", purpose: "international-card-readiness" },
    }),
  });
  const text = await res.text();
  if (res.ok) {
    const order = JSON.parse(text);
    intlOk = true;
    intlDetail = `order ${order.id} ${order.currency} ${order.amount}`;
  } else {
    let desc = text.slice(0, 240);
    try {
      const j = JSON.parse(text);
      desc = j.error?.description ?? j.error?.reason ?? desc;
    } catch { /* keep raw */ }
    intlDetail = `HTTP ${res.status}: ${desc}`;
  }
  say("USD (international card) order", intlOk, intlDetail);
} catch (e) {
  say("USD (international card) order", false, e instanceof Error ? e.message : String(e));
}

console.log("");
const readyToGoLive = authOk && intlOk && webhookSecretSet;
if (readyToGoLive) {
  console.log("VERDICT: account accepts USD orders and the webhook secret is set.");
  console.log("         International cards can be enabled by setting RAZORPAY_CHECKOUT_ENABLED=true");
  console.log("         AFTER the webhook is registered in the Razorpay dashboard.");
} else {
  console.log("VERDICT: not ready for international cards yet. Fix the FAIL line(s) above.");
  if (!intlOk) {
    console.log("         If the USD order was rejected, International Payments / USD is not");
    console.log("         enabled on the Razorpay account (dashboard -> Account & Settings ->");
    console.log("         Payment Methods / International). This needs KYC approval.");
  }
}
process.exit(readyToGoLive ? 0 : 1);
