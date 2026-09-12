// Live proof: follow-up send-window hardening (audit-2026-09-12).
// Requires, BEFORE running:
//   1) migration 20260912000000_followup_sendwindow_hardening.sql applied
//   2) send-worker deployed with the PASS 1 changes (dry-run + pacing + ceiling
//      + pre-send emitted-state re-check)
// Proves, against the real deployment:
//   A) trigger tolerance: a reply landing while followup_status='sending' now
//      cancels the lead (old code only cancelled 'active')
//   B) dry-run decision pipeline (scoped via x-followup-only):
//        - 3 clean due leads  => would_send (step 2), paced >= 2x DELAY_MS
//        - 1 replied lead     => cancel (already_replied)
//        - 1 suppressed lead  => cancel (suppression_list)
//   C) dry-run is truly read-only: no sequence-2 emails_sent rows, lead rows
//      untouched, daily-slot counter untouched
import { getEnv } from "./_db.mjs";

const REF = getEnv("SUPABASE_PROJECT_REF");
const SITE = getEnv("SUPABASE_URL") ?? `https://${REF}.supabase.co`;
const bearer = getEnv("SUPABASE_ACCESS_TOKEN");
const b = (query) =>
  fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json", Accept: "application/json", "Connection": "close" },
    body: JSON.stringify({ query }),
  }).then(async (r) => (r.ok ? r.json() : await Promise.reject(new Error(`query (${r.status}): ${(await r.text()).slice(0, 300)}`))));

const svc = (await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys`, {
  headers: { Authorization: `Bearer ${bearer}`, "Connection": "close" } })
  .then((r) => r.json())).find((k) => k.name === "service_role").api_key;

const DELAY_MS = 8000;
let fails = 0;
let created = [];
let fixtureUid = null;
const check = (name, ok, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`);
  if (!ok) fails++;
};
const q1 = (sql) => b(sql).then((r) => (Array.isArray(r) ? r[0] ?? null : null));
const qc = (sql) => b(sql).then((r) => (Array.isArray(r) ? r.length : r));

try {
  // ---------- fixture ----------
  const email = `fu-live-${Date.now()}@example.com`;
  const u = await fetch(`${SITE}/auth/v1/admin/users`, {
    method: "POST",
    headers: { apikey: svc, Authorization: `Bearer ${svc}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "fu-live-pass-123", email_confirm: true }),
  }).then(async (r) => { const j = await r.json(); if (!r.ok || !j?.id) throw new Error(`mkUser: ${r.status} ${JSON.stringify(j).slice(0, 200)}`); return j; });
  const uid = u.id;
  created.push(uid);
  fixtureUid = uid;
  const cid = (await b(`insert into campaigns (user_id, name, status) values ('${uid}', 'fu-live', 'active') returning id::text;`))[0].id;

  const mkLead = async (name, addr) => {
    const lid = (await b(`insert into leads (user_id, campaign_id, name, email, country, status) values ('${uid}', '${cid}', '${name}', '${addr}', 'US', 'new') returning id::text;`))[0].id;
    await b(`insert into emails_sent (user_id, lead_id, campaign_id, subject, body, sequence, sent_at) values ('${uid}', '${lid}', '${cid}', 'intro ${name}', 'body', 1, now() - interval '2 days');`);
    await b(`update leads set followup_step = 1, followup_status = 'active', next_followup_at = now() - interval '1 hour' where id = '${lid}';`);
    return lid;
  };
  const A = await mkLead("Live A", `live-a-${Date.now()}@proof.test`);
  const B = await mkLead("Live B", `live-b-${Date.now()}@proof.test`);
  const C = await mkLead("Live C", `live-c-${Date.now()}@proof.test`);
  const D = await mkLead("Live D", `live-d-${Date.now()}@proof.test`);
  const eAddr = `live-e-${Date.now()}@proof.test`;
  const E = await mkLead("Live E", eAddr);

  // D: replied flag present but lead still 'active' (scan-lag snapshot) — must cancel
  await b(`insert into emails_sent (user_id, lead_id, campaign_id, subject, body, sequence, replied, sent_at) values ('${uid}', '${D}', '${cid}', 'replied D', 'b', 2, true, now());`);
  // E: suppressions row — must cancel
  await b(`insert into suppressions (user_id, email, reason) values ('${uid}', '${eAddr}', 'manual');`);

  // ---------- A) trigger tolerance: reply while 'sending' ----------
  const T = await mkLead("Live T", `live-t-${Date.now()}@proof.test`);
  await b(`update leads set followup_status = 'sending' where id = '${T}';`);
  await b(`update emails_sent set replied = true where lead_id = '${T}' and campaign_id = '${cid}' and sequence = 1;`);
  const tState = await q1(`select followup_status, next_followup_at from leads where id='${T}';`);
  check("A) reply during 'sending' cancels the lead (migration live)", tState?.followup_status === "cancelled" && tState?.next_followup_at === null, JSON.stringify(tState));
  const tFired = await qc(`select 1 from audit_events where event='followup.cancelled' and lead_id='${T}';`);
  check("A) no worker cancel audit for T (trigger-only, worker never saw it)", tFired === 0);

  // ---------- B) dry-run decision pipeline (scoped) ----------
  const slotBefore = (await q1(`select coalesce(emails_sent_today,0) c from profiles where id='${uid}';`))?.c ?? null;
  const t0 = Date.now();
  // Credential: send-worker runs verify_jwt=false and its service key is not
  // recoverable from the platform, so the dry-run is credential-gated on the
  // cron secret (read-only by design — see AUDIT-FOLLOWUP.md).
  const r = await fetch(`${SITE}/functions/v1/send-worker`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-cron-secret": getEnv("CRON_SECRET"),
      "x-followup-dry-run": "1",
      "x-followup-only": [A, B, C, D, E].join(","),
      "Connection": "close",
    },
    body: JSON.stringify({}),
  });
  const elapsed = Date.now() - t0;
  const j = await r.json().catch(() => null);
  check("B) dry-run responds 200 + dry:true", r.status === 200 && j?.dry === true, `(${r.status} ${JSON.stringify(j)?.slice(0, 120)})`);
  const decisions = Array.isArray(j?.dryDecisions) ? j.dryDecisions : [];
  const byId = Object.fromEntries(decisions.map((d) => [d.lead_id, d]));
  check("B) 3 clean leads => would_send step 2", [A, B, C].every((id) => byId[id]?.decision === "would_send" && byId[id]?.step === 2),
    JSON.stringify([A, B, C].map((id) => `${id.slice(0, 6)}=${byId[id]?.decision}`)));
  check("B) replied lead => cancel already_replied", byId[D]?.decision === "cancel" && String(byId[D]?.reason ?? "").includes("already_replied"), String(byId[D]?.reason));
  check("B) suppressed lead => cancel suppression_list", byId[E]?.decision === "cancel" && String(byId[E]?.reason ?? "").includes("suppression_list"), String(byId[E]?.reason));
  check("B) counters: 0 sent, 2 cancelled", j?.followupsSent === 0 && j?.followupsCancelled === 2, `sent=${j?.followupsSent} cancelled=${j?.followupsCancelled}`);
  check("B) pacing: 3 would_send spaced >= 2x DELAY_MS", elapsed >= 2 * DELAY_MS, `${elapsed}ms elapsed`);
  check("B) ceiling sanity: under invocation budget", elapsed < 55_000, `${elapsed}ms`);

  // ---------- C) dry-run is read-only ----------
  check("C) no sequence-2 rows recorded for A/B/C", (await qc(`select 1 from emails_sent where lead_id in ('${A}','${B}','${C}') and sequence >= 2;`)) === 0);
  const aRow = await q1(`select followup_status, next_followup_at is not null as has_next from leads where id='${A}';`);
  check("C) lead A untouched (still active, still due)", aRow?.followup_status === "active" && aRow?.has_next === true, JSON.stringify(aRow));
  const slotAfter = (await q1(`select coalesce(emails_sent_today,0) c from profiles where id='${uid}';`))?.c ?? null;
  check("C) daily-slot counter untouched", slotBefore === slotAfter, `before=${slotBefore} after=${slotAfter}`);
} catch (err) {
  console.log("ERROR during live proof:", err.message);
  fails++;
} finally {
  // ---------- teardown ----------
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

console.log(`\n${fails === 0 ? "all live checks passed" : fails + " live check(s) failed"}`);
process.exitCode = fails ? 1 : 0;