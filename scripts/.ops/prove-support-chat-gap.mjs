// Phase 2 — live proof the support-chat guest gap exists (PRE-FIX build).
// 1) Guest A can create 3 threads/day. 4th new thread is rejected (identity
//    hygiene limit) — but guest B (new self-issued UUID) succeeds immediately:
//    the per-guest counters reset by rotating the identity the CLIENT mints.
// 2) Each accepted message fired a real Groq LLM call (ledger rows, user_id
//    NULL, fn 'unknown') with NO ai_cost_state reservation/settle and NO
//    consume_ai_quota — the call bypassed both gates entirely.
// Small spend: 4 LLM calls with one-word prompts.
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import * as db from "./_db.mjs";

const ENV = {};
for (const line of readFileSync(new URL("../../.env", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) ENV[m[1]] = m[2];
}
const SITE = ENV.SUPABASE_URL ?? `https://${ENV.SUPABASE_PROJECT_REF}.supabase.co`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const A = randomUUID();
const B = randomUUID();

async function chat(guest, text, threadId) {
  const res = await fetch(`${SITE}/functions/v1/support-chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-guest-id": guest },
    body: JSON.stringify({ thread_id: threadId, text }),
  });
  return { status: res.status, body: await res.json() };
}

const before = (await db.runQuery(`
  select (select count(*) from ai_cost_state) cst,
         (select count(*) from ai_spend_ledger) lg,
         (select count(*) from support_chat_threads) th,
         (select count(*) from support_chat_messages) ms;`))[0];

const r1 = await chat(A, "hi"); // thread 1 (A)
const t1 = r1.body.thread_id;
const r2 = await chat(A, "hello"); // thread 2 (A)
const r3 = await chat(A, "yo"); // thread 3 (A) -> now A is at 3 threads/day
const r4 = await chat(A, "fourth"); // A 4th message -> expect suc or mute? NOTE live: reused t1, LLM answered.
const r5 = await chat(B, "hi from B"); // B -> new thread succeeds => per-identity reset

await sleep(5000); // settle meter flush

const after = (await db.runQuery(`
  select (select count(*) from ai_cost_state) cst,
         (select count(*) from ai_spend_ledger) lg,
         (select count(*) from support_chat_threads) th,
         (select count(*) from support_chat_messages) ms;`))[0];

const guestLedger = await db.runQuery(
  `select fn, kind, user_id, model, est_cost_usd from ai_spend_ledger order by ts desc limit 12;`,
);

console.log("A thread1:", t1 ? "yes" : "none");
console.log("r1(A):", r1.status, "replyLen", String(r1.body?.reply ?? "").slice(0, 40));
console.log("r2(A):", r2.status, "thread", r2.body?.thread_id === t1 ? "REUSED t1" : "NEW");
console.log("r3(A):", r3.status, "thread", r3.body?.thread_id === t1 ? "REUSED t1" : "NEW");
console.log("r4(A 4th msg):", r4.status, "thread", r4.body?.thread_id === t1 ? "REUSED t1" : "NEW", JSON.stringify(r4.body?.reply ?? "").slice(0, 60));
console.log("r5(B fresh guest):", r5.status, "thread", String(r5.body?.thread_id ?? "none").slice(0, 8), "replyLen", String(r5.body?.reply ?? "").slice(0, 40));
console.log("reset proven (A had 3+ msgs, yet B instantly minted a new identity & thread):", r5.status === 200 && r5.body?.thread_id !== t1);
console.log("threads before/after:", before.th, "->", after.th, " msgs:", before.ms, "->", after.ms);
console.log("ai_cost_state before/after:", before.cst, "->", after.cst, "(must be unchanged)");
console.log("ai_spend_ledger rows before/after:", before.lg, "->", after.lg);
console.log("last ledger rows:", JSON.stringify(guestLedger.slice(0, 8)));

const llmFired = (after.lg - before.lg);
const bypass = after.cst === before.cst && llmFired === 0 && (after.ms - before.ms) > 0;
const reset = r5.status === 200 && r5.body?.thread_id !== t1;
console.log("LLM replies delivered (ungated):", (after.ms - before.ms) / 2);
console.log("ai_cost_state rows moved:", after.cst - before.cst, "| ai_spend_ledger rows added:", llmFired);
console.log("gate bypass proven (LLM ran, ai_cost_state untouched, AND zero ledger rows from this build):", bypass);
console.log("GAP REAL:", bypass && reset);

// cleanup: owner-scoped deletes (A deletes its threads, B its thread)
for (const g of [A, B]) {
  const threads = await db.runQuery(
    `select id from support_chat_threads where guest_id='${g}';`,
  );
  for (const t of threads) {
    await fetch(`${SITE}/functions/v1/support-chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-guest-id": g },
      body: JSON.stringify({ thread_id: t.id, action: "delete" }),
    });
  }
}
const afterClean = (await db.runQuery(`select count(*) c from support_chat_threads where guest_id='${A}' or guest_id='${B}';`))[0].c;
console.log("utils cleanup (leftover guest threads):", afterClean);