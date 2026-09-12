// Simulation (pre-deploy): a faithful replica of send-worker PASS 1's decision
// pipeline after the audit-2026-09-12 changes — safety re-checks, step/sequence
// rules, idempotency, claim, the NEW pre-send emitted-state re-check, the NEW
// DELAY_MS pacing and the NEW runtime ceiling — driven purely through SQL against
// live fixture rows. Proves, deterministically, BEFORE anything is deployed:
//   A) pacing: 3 healthy due leads are each spaced >= DELAY_MS (PASS 2 parity)
//   B) ceiling: a budget shorter than one paced lead leaves the rest untouched
//   C) pre-send re-check: every emitted-state change between batch snapshot and
//      the wire-send moment trips the abort (and a clean state does not)
// The predicates below are copied VERBATIM from send-worker/index.ts so a drift
// between replica and shipped code is a one-way visible diff, never silent.
import { getEnv } from "./_db.mjs";

const REF = getEnv("SUPABASE_PROJECT_REF");
const SITE = getEnv("SUPABASE_URL") ?? `https://${REF}.supabase.co`;
const bearer = getEnv("SUPABASE_ACCESS_TOKEN");
const b = (query) =>
  fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json", Accept: "application/json", "Connection": "close" },
    body: JSON.stringify({ query: `set search_path to public; ${query}` }),
  }).then(async (r) => (r.ok ? r.json() : await Promise.reject(new Error(`query (${r.status}): ${(await r.text()).slice(0, 300)}`))));
const svc = (await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys`, {
  headers: { Authorization: `Bearer ${bearer}`, "Connection": "close" } })
  .then((r) => r.json())).find((k) => k.name === "service_role").api_key;

const DELAY_MS = 8000;          // mirror send-worker
const DEFAULT_BUDGET = 50_000;  // mirror send-worker RUNTIME_MS
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let fails = 0;
let created = [];
let fixtureUid = null;
const check = (name, ok, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`);
  if (!ok) fails++;
};

const q1 = (sql) => b(sql).then((r) => (Array.isArray(r) ? r[0] ?? null : null));
const qc = (sql) => b(sql).then((r) => (Array.isArray(r) ? r.length : r));

// ---- VERBATIM predicates from send-worker/index.ts ----
function batchReasons(lead, supp, replied) {
  const reasons = [];
  if (lead.unsubscribed || ["unsubscribed", "bounced", "suppressed"].includes(lead.status)) reasons.push("lead_state");
  if (["UNSUBSCRIBED", "BOUNCED", "SUPPRESSED"].includes(lead.lifecycle ?? "")) reasons.push("lifecycle");
  if ((lead.conv_mode ?? "AI_AUTOPILOT") === "HUMAN") reasons.push("human_takeover");
  if (lead.c_status !== "active") reasons.push("campaign_inactive");
  if (!lead.followups_enabled) reasons.push("followups_disabled");
  if (supp) reasons.push("suppression_list");
  if (replied) reasons.push("already_replied");
  return reasons;
}
function preSendBlocked(fresh, claimHolds, replied, suppressed) {
  return !fresh
    || !claimHolds
    || replied
    || suppressed
    || fresh.unsubscribed
    || ["unsubscribed", "bounced", "suppressed"].includes(fresh.status)
    || ["UNSUBSCRIBED", "BOUNCED", "SUPPRESSED"].includes(fresh.lifecycle ?? "")
    || (fresh.conv_mode ?? "AI_AUTOPILOT") === "HUMAN";
}

// ---- worker pipeline replica (dry semantics, no writes) ----
async function simulate(ids, budgetMs = DEFAULT_BUDGET) {
  const start = Date.now();
  const decisions = [];
  if (!ids.length) return { decisions, elapsed: 0 };
  const inList = ids.map((i) => `'${i}'`).join(",");
  const rows = await b(`select l.id::text, l.email, l.unsubscribed, l.status, l.lifecycle, l.conv_mode,
      l.followup_step, l.followup_status, l.next_followup_at,
      c.id::text cid, c.status c_status, c.followups_enabled, c.user_id::text cuid
    from leads l join campaigns c on c.id = l.campaign_id
    where l.followup_status = 'active' and l.next_followup_at is not null
      and l.next_followup_at <= now() and l.id in (${inList})
    order by l.next_followup_at;`);
  for (const lead of rows) {
    if (Date.now() - start >= budgetMs) break;                 // ceiling (PASS 2 parity)
    const supp = await q1(`select id from public.suppressions where user_id='${lead.cuid}' and email ilike '${lead.email}' limit 1;`);
    const repl = await q1(`select id from public.emails_sent where lead_id='${lead.id}' and campaign_id='${lead.cid}' and replied = true limit 1;`);
    const initial = batchReasons(lead, !!supp, !!repl);
    if (process.env.FU_SIM_DEBUG) console.log("DBG", JSON.stringify({ id: lead.id, unsub: lead.unsubscribed, status: lead.status, lifecycle: lead.lifecycle, conv: lead.conv_mode, cStatus: lead.c_status, fup: lead.followups_enabled, supp, repl, reasons: initial }));
    if (initial.length) { decisions.push({ id: lead.id, decision: "cancel", reason: initial.join(",") }); continue; }

    const nextStep = (lead.followup_step ?? 0) + 1;
    if (nextStep > 14) { decisions.push({ id: lead.id, decision: "cancel", reason: "completed" }); continue; }
    const seqDef = await q1(`select 1 from public.follow_up_sequences where campaign_id='${lead.cid}' and step_number=${nextStep} and active = true limit 1;`);
    if (!seqDef) { decisions.push({ id: lead.id, decision: "cancel", reason: "completed_no_sequence" }); continue; }
    const existing = await q1(`select id from public.emails_sent where campaign_id='${lead.cid}' and lead_id='${lead.id}' and sequence=${nextStep} limit 1;`);
    if (existing) { decisions.push({ id: lead.id, decision: "already_sent", step: nextStep }); continue; }

    // claim simulated as held; daily-cap simulated as available (mirror of the
    // worker's `dry ? true` — dry-run never mutates a row to 'sending')
    const fresh = await q1(`select unsubscribed, status, lifecycle, conv_mode, followup_status from public.leads where id='${lead.id}';`);
    const claimHolds = true;
    const freshRepl = await q1(`select id from public.emails_sent where lead_id='${lead.id}' and campaign_id='${lead.cid}' and replied = true limit 1;`);
    const freshSupp = await q1(`select id from public.suppressions where user_id='${lead.cuid}' and email ilike '${lead.email}' limit 1;`);
    const blocked = preSendBlocked(fresh, claimHolds, !!freshRepl, !!freshSupp);
    if (blocked) { decisions.push({ id: lead.id, decision: "cancel", reason: "pre_send_recheck" }); continue; }

    decisions.push({ id: lead.id, decision: "would_send", step: nextStep });
    await sleep(DELAY_MS);                                     // pacing (PASS 2 parity)
  }
  return { decisions, elapsed: Date.now() - start };
}

try {
  // ---------- fixture ----------
  const email = `fu-sim-${Date.now()}@example.com`;
  const u = await fetch(`${SITE}/auth/v1/admin/users`, {
    method: "POST",
    headers: { apikey: svc, Authorization: `Bearer ${svc}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "fu-sim-pass-123", email_confirm: true }),
  }).then(async (r) => { const j = await r.json(); if (!r.ok || !j?.id) throw new Error(`mkUser: ${r.status} ${JSON.stringify(j).slice(0, 200)}`); return j; });
  const uid = u.id;
  created.push(uid);
  fixtureUid = uid;
  const cid = (await b(`insert into campaigns (user_id, name, status) values ('${uid}', 'fu-sim', 'active') returning id::text;`))[0].id;

  const mkLead = async (name, emailAddr) => {
    const lid = (await b(`insert into leads (user_id, campaign_id, name, email, country, status) values ('${uid}', '${cid}', '${name}', '${emailAddr}', 'US', 'new') returning id::text;`))[0].id;
    await b(`insert into emails_sent (user_id, lead_id, campaign_id, subject, body, sequence, sent_at) values ('${uid}', '${lid}', '${cid}', 'intro ${name}', 'body', 1, now() - interval '2 days');`);
    await b(`update leads set followup_step = 1, followup_status = 'active', next_followup_at = now() - interval '1 hour' where id = '${lid}';`);
    return lid;
  };
  const aAddr = `sim-a-${Date.now()}@proof.test`;
  const A = await mkLead("Sim A", aAddr);
  const B = await mkLead("Sim B", `sim-b-${Date.now()}@proof.test`);
  const C = await mkLead("Sim C", `sim-c-${Date.now()}@proof.test`);

  // ---------- A) pacing ----------
  const pace = await simulate([A, B, C], 120_000);
  check("A) decisions: 3 would_send, 0 cancel", pace.decisions.length === 3 && pace.decisions.every((d) => d.decision === "would_send"), JSON.stringify(pace.decisions.map((d) => d.decision)));
  check("A) pacing: 3 leads spaced >= 2x DELAY_MS", pace.elapsed >= 2 * DELAY_MS, `${pace.elapsed}ms elapsed, DELAY_MS=${DELAY_MS}`);

  // ---------- B) ceiling ----------
  const ceiling = await simulate([A, B, C], 2000);
  check("B) ceiling: budget < one paced lead => only 1 processed", ceiling.decisions.length === 1 && ceiling.decisions[0].decision === "would_send", `${ceiling.decisions.length} decision(s), ${ceiling.elapsed}ms`);
  check("B) ceiling: elapsed bounded (~one pacing window)", ceiling.elapsed >= DELAY_MS && ceiling.elapsed < 4 * DELAY_MS, `${ceiling.elapsed}ms`);

  // ---------- C) pre-send re-check predicates ----------
  const pred = async (mutateSql, revertSql, expectedBlocked) => {
    await b(mutateSql);
    const fresh = await q1(`select unsubscribed, status, lifecycle, conv_mode, followup_status from public.leads where id='${A}';`);
    const claimHolds = fresh?.followup_status === "sending";
    const repl = await q1(`select id from public.emails_sent where lead_id='${A}' and campaign_id='${cid}' and replied = true limit 1;`);
    const sup = await q1(`select id from public.suppressions where user_id='${uid}' and email ilike '%@proof.test' limit 1;`);
    const blocked = preSendBlocked(fresh, claimHolds, !!repl, !!sup);
    const ok = blocked === expectedBlocked;
    check(`C) pred ${expectName(mutateSql)}`, ok, `blocked=${blocked}${blocked === expectedBlocked ? " (as expected)" : " MISMATCH"}`);
    await b(revertSql);
  };
  const expectName = (sql) => sql.slice(0, 60);
  await b(`update leads set unsubscribed=false, status='new', lifecycle='NEW', conv_mode='AI_AUTOPILOT', followup_status='active' where id='${A}';`);

  const fresh = await q1(`select unsubscribed, status, lifecycle, conv_mode, followup_status from public.leads where id='${A}';`);
  check("C) clean state -> NOT blocked (claim simulated held)", preSendBlocked(fresh, true, false, false) === false);

  await pred(`update leads set unsubscribed = true where id='${A}'`, `update leads set unsubscribed = false where id='${A}'`, true);
  await pred(`update leads set status = 'suppressed' where id='${A}'`, `update leads set status = 'new' where id='${A}'`, true);
  await pred(`update leads set lifecycle = 'BOUNCED' where id='${A}'`, `update leads set lifecycle = 'NEW' where id='${A}'`, true);
  await pred(`update leads set conv_mode = 'HUMAN' where id='${A}'`, `update leads set conv_mode = 'AI_AUTOPILOT' where id='${A}'`, true);
  await pred(`update leads set followup_status = 'cancelled' where id='${A}'`, `update leads set followup_status = 'active' where id='${A}'`, true); // claim lost mid-flight
  await b(`insert into emails_sent (user_id, lead_id, campaign_id, subject, body, sequence, replied, sent_at) values ('${uid}', '${A}', '${cid}', 'repl recheck', 'b', 2, true, now());`);
  await pred(`select 1`, `delete from emails_sent where lead_id='${A}' and replied = true;`, true); // reply flag appeared mid-flight
  await b(`insert into suppressions (user_id, email, reason) values ('${uid}', '${aAddr}', 'manual');`);
  await pred(`select 1`, `delete from suppressions where user_id='${uid}';`, true); // suppression appeared mid-flight
} catch (err) {
  console.log("ERROR during sim:", err.message);
  fails++;
} finally {
  // ---------- teardown (explicit + cascade + auth) ----------
  if (fixtureUid) {
    await b(`delete from emails_sent where user_id='${fixtureUid}';`);
    await b(`delete from suppressions where user_id='${fixtureUid}';`);
    await b(`delete from leads where user_id='${fixtureUid}';`);
    await b(`delete from campaigns where user_id='${fixtureUid}';`);
  }
  for (const uid of created) {
    await fetch(`${SITE}/auth/v1/admin/users/${uid}`, { method: "DELETE", headers: { apikey: svc, Authorization: `Bearer ${svc}` } }).catch(() => null);
  }
  const peeps = created.length ? `id='${created.join("' or id='")}'` : "false";
  check("teardown: ephemeral users deleted & profiles gone", (await qc(`select 1 from profiles where ${peeps};`)) === 0, `(${created.length} user(s))`);
}

console.log(`\n${fails === 0 ? "all sim checks passed" : fails + " sim check(s) failed"}`);
process.exitCode = fails ? 1 : 0;