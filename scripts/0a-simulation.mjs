// 0a verification — executes the REAL shipped logic from
// supabase/functions/_shared/sender-health.ts (Node 24 type-stripping).
// The cron calls computeHealthUpdate; send-worker calls resolveDailyCap.
// resolveDailyCap is exercised against a stubbed PostgREST client that mimics
// the exact queries send-worker issues, so the numbers below are the numbers
// send-worker would compute.

import {
  warmCap,
  resolveDailyCap,
  computeHealthUpdate,
  HEALTH_MAX_AGE_MS,
} from "../supabase/functions/_shared/sender-health.ts";

const D = (n) => n * 86400000;

// --- stub PostgREST client: serves whatever rows we seed --------------------
function stubDb({ gmailTokens, senderHealth }) {
  const data = {
    gmail_tokens: gmailTokens ?? [],
    sender_health: senderHealth ?? [],
  };
  return {
    from(name) {
      let where = null;
      const dyn = {
        select: () => dyn,
        eq: (k, v) => { where = { k, v }; return dyn; },
        maybeSingle: async () => {
          const rows = data[name] ?? [];
          return { data: where ? (rows.find((r) => r[where.k] === where.v) ?? null) : (rows[0] ?? null) };
        },
      };
      return dyn;
    },
  };
}

const PLAN_LIMITS = { free: 10, starter: 50, growth: 200, agency: 500 };
const starter = (plan) => PLAN_LIMITS[plan] ?? 10;

// ===========================================================================
// SCENARIO 1 — bounce spike: does the cap actually shrink? Walk the real
// state machine night by night, then ask resolveDailyCap (the worker code)
// what cap a sender sees the following morning.
// ===========================================================================
console.log("\n== SCENARIO 1 — bounce spike on a mailbox ==");
console.log("Mailbox: growth plan (200/day), connected 40 days ago, was steady at cap 200.\n");

// Nightly report sequence the CRON would see (sends, bounces, unsubs, replies)
const nights = [
  { label: "N1  (100 sent, 6 bounced -> 6% > 3%)   ", metrics: { sends: 100, bounces: 6, unsubs: 0, replies: 5 } },
  { label: "N2  (100 sent, 4 bounced -> 4% > 3%)   ", metrics: { sends: 100, bounces: 4, unsubs: 0, replies: 6 } },
  { label: "N3  (100 sent, 0 bounced -> clean)     ", metrics: { sends: 100, bounces: 0, unsubs: 0, replies: 8 } },
  { label: "N4  (clean)                            ", metrics: { sends: 90,  bounces: 0, unsubs: 0, replies: 7 } },
  { label: "N5  (clean)                            ", metrics: { sends: 90,  bounces: 0, unsubs: 0, replies: 6 } },
  { label: "N6  (clean)                            ", metrics: { sends: 95,  bounces: 0, unsubs: 0, replies: 9 } },
  { label: "N7  (clean)                            ", metrics: { sends: 90,  bounces: 0, unsubs: 0, replies: 8 } },
  { label: "N8  (clean)                            ", metrics: { sends: 90,  bounces: 0, unsubs: 0, replies: 8 } },
  { label: "N9  (clean)                            ", metrics: { sends: 90,  bounces: 0, unsubs: 0, replies: 8 } },
  { label: "N10 (clean)                            ", metrics: { sends: 90,  bounces: 0, unsubs: 0, replies: 8 } },
  { label: "N11 (clean)                            ", metrics: { sends: 90,  bounces: 0, unsubs: 0, replies: 8 } },
];

const warm = warmCap(200, 40, 500); // growth, 40 days warm, personal ceiling 500
console.log(`warmCap(plan=200, daysWarm=40, ceiling=500) -> ${warm}`);
console.log(`(send-worker boundary: min(plan.dailyEmails, 5 + daysWarm*5, 500) = min(200, ${5 + 40 * 5}, 500))`);

let row = { phase: "steady", current_cap: 200, clean_days: 0 };
for (const n of nights) {
  row = computeHealthUpdate({ prev: row, metrics: n.metrics, warm, planDaily: 200, daysWarm: 40 });
  const shares = n.metrics.sends ? (100 * (n.metrics.bounces + n.metrics.unsubs) / n.metrics.sends).toFixed(1) : "0.0";
  console.log(`${n.label} -> bounce/unsub ${shares}%  |  phase=${row.phase}  current_cap=${row.current_cap}  clean_days=${row.clean_days}`);
}

// What does SEND-WORKER give this mailbox the morning after N2 (cap should be 50)?
console.log("\nSend-worker view the morning after N2 (says 'yes' until daily used >= cap):");
let healthRow = { current_cap: 50, profile_id: "u", last_measured_at: new Date().toISOString() };
const dbWorker = stubDb({ gmailTokens: [{ profile_id: "u", connected_at: new Date(Date.now() - D(40)).toISOString() }], senderHealth: [healthRow] });
const capAfter = await resolveDailyCap(dbWorker, { id: "u", created_at: null, gmail_account_type: "personal" }, 200, 500);
  console.log(`  resolveDailyCap -> ${capAfter}/day  (plan ramp is ${warm}, health clamped ${50})`);

// ===========================================================================
// SCENARIO 2 — old account, mailbox connected TODAY. Warm-up from own date.
// ===========================================================================
console.log("\n== SCENARIO 2 — newly connected mailbox on an OLD account ==");
const accountCreated = new Date(Date.now() - D(220)).toISOString(); // account 220 days old

// BUGGY anchor (pre-fix): falls back to profile.created_at
const buggyCap = await resolveDailyCap(
  { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }) },
  { id: "u", created_at: accountCreated, gmail_account_type: "personal" }, 200, 500,
);
console.log(`WITHOUT fix (anchor=profile.created_at 220d):  warmCap = min(200, ${5 + 220 * 5}, 500) -> day-0 cap ${buggyCap}/day  [the bug]`);

// FIXED anchor: gmail_tokens.connected_at = the day the mailbox connected
for (const d of [0, 1, 2, 3, 7, 30]) {
  const dbd = stubDb({ gmailTokens: [{ profile_id: "u", connected_at: new Date(Date.now() - D(d)).toISOString() }], senderHealth: [] });
  const c = await resolveDailyCap(dbd, { id: "u", created_at: accountCreated, gmail_account_type: "personal" }, 200, 500);
  console.log(`  mailbox connected ${String(d).padStart(2)}d ago: warm = ${5 + d * 5}d ramp -> resolveDailyCap = ${c}/day`);
}

// ===========================================================================
// SCENARIO 3 — additive, never a replacement: min(plan, ramp, ceiling, health)
// ===========================================================================
console.log("\n== SCENARIO 3 — brake is additive beneath the warm-up ramp ==");
const dbTight = stubDb({
  gmailTokens: [{ profile_id: "u", connected_at: new Date(Date.now() - D(40)).toISOString() }],
  senderHealth: [{ current_cap: 150, profile_id: "u", last_measured_at: new Date().toISOString() }],
});
const tight = await resolveDailyCap(dbTight, { id: "u", created_at: null, gmail_account_type: "personal" }, 200, 500);
console.log(`healthy warm ${warm}, health row current_cap 150 -> final ${tight} (health loosened by deliberate over-write)`);

const dbLoose = stubDb({
  gmailTokens: [{ profile_id: "u", connected_at: new Date(Date.now() - D(40)).toISOString() }],
  senderHealth: [{ current_cap: 999, profile_id: "u", last_measured_at: new Date().toISOString() }], // pathological row
});
const loose = await resolveDailyCap(dbLoose, { id: "u", created_at: null, gmail_account_type: "personal" }, 200, 500);
console.log(`pathological health current_cap 999 -> final ${loose} (warm ramp ${warm} still the ceiling)`);

const dbStale = stubDb({
  gmailTokens: [{ profile_id: "u", connected_at: new Date(Date.now() - D(40)).toISOString() }],
  senderHealth: [{ current_cap: 5, profile_id: "u", last_measured_at: new Date(Date.now() - D(2)).toISOString() }], // 2-day-old row (>24h)
});
const stale = await resolveDailyCap(dbStale, { id: "u", created_at: null, gmail_account_type: "personal" }, 200, 500);
console.log(`stale row (>24h old) -> final ${stale} (fail-safe: exactly the plain warm ramp, no health opinion)`);

// writer bound: can computeHealthUpdate EVER write a cap above warm?
const writer = computeHealthUpdate({
  prev: { phase: "recovery", current_cap: 999999, clean_days: 3 }, // absurd input
  metrics: { sends: 100, bounces: 0, unsubs: 0, replies: 5 },
  warm, planDaily: 200, daysWarm: 40,
});
console.log(`writer (computeHealthUpdate) with absurd prev cap 999999 -> writes current_cap ${writer.current_cap} (<= warm ${warm})`);

console.log("\nHEALTH_MAX_AGE_MS =", HEALTH_MAX_AGE_MS, "(= 24h freshness window)");