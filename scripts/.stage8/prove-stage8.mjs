// ============================================================
// Stage 8 erasure proof — forget_lead / delete_lead.
//   PASS 1 (SIMULATION): one rolled-back mgmt SQL call builds the
//     full fixture, invokes forget_lead(false), forget_lead(true),
//     delete_lead, and the ownership guard (expect disabled message),
//     then ROLLBACK — validates the RPC bodies end-to-end with zero
//     persistence.
//   PASS 2 (LIVE): throwaway auth users U (=3 leads) and U2 (witness
//     lead), fixture across every erasure-scope store, RPCs invoked
//     over PostgREST with the service_role key (the real path),
//     assertions per phase incl. cross-user leak checks, then full
//     cleanup (finally). Zero real sends.
//   Exit 0 = all PASS. Any FAIL or residual row => nonzero.
// ============================================================
import fs from "node:fs";
import crypto from "node:crypto";
const uuid = () => crypto.randomUUID();
const env = fs.readFileSync(".env", "utf8").split("\n").filter(Boolean);
const envV = (k) => env.find((l) => l.startsWith(`${k}=`))?.slice(k.length + 1).trim();
const TOKEN = envV("SUPABASE_ACCESS_TOKEN");
const REF = envV("SUPABASE_PROJECT_REF") || "zvohdvopmvzsujktrdmu";
const PROJECT = `https://${REF}.supabase.co`;
const OWNER_U = "39b65a0f-2c1d-48e2-9ee7-a358ba8d0570";
const guests = ["playground-lead-owner@vsu.org", "orion902@example.com"]; // prior-stage test users (untouched)

const out = [];
function a(label, ok, note = "") {
  out.push({ label, ok: !!ok, note });
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${note ? ` — ${note}` : ""}`);
}
async function mgmt(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text().catch(() => "");
  if (res.status >= 300) throw new Error(`mgmt ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : [];
}
const apiRes = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys`, { headers: { Authorization: `Bearer ${TOKEN}` } })).json();
const svc = apiRes.find((k) => k.name === "service_role").api_key;
async function rpc(fn, body) {
  const res = await fetch(`${PROJECT}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: svc, Authorization: `Bearer ${svc}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json, text };
}
function unwrap(resJson, key) {
  const arr = Array.isArray(resJson) ? resJson : [resJson];
  for (const row of arr) {
    if (row && typeof row === "object") {
      if (key in row) return row[key];
      for (const v of Object.values(row)) {
        if (v && typeof v === "object" && "row_counts" in v) return v;
      }
    }
  }
  return resJson;
}

// ---------------------------------------------------------------------------
// PASS 1 — SIMULATION (rolled back, zero persistence)
// ---------------------------------------------------------------------------
console.log("\n== PASS 1: SIMULATION (rolled-back, no persistence) ==");
{
  const c = uuid(), l1 = uuid(), l2 = uuid(), l3 = uuid();
  const t1 = uuid(), t2 = uuid(), t3 = uuid();
  const m1 = uuid(), m2 = uuid(), m3 = uuid();
  const e1 = uuid(), e2 = uuid(), e3 = uuid();
  const sim = `
begin;
insert into public.campaigns (id, user_id, name, status) values ('${c}','${OWNER_U}','stage8-sim','paused'), ('${uuid()}','${OWNER_U}','stage8-sim-w','paused');
insert into public.leads (id, user_id, campaign_id, name, email, status, place_id) values
 ('${l1}','${OWNER_U}','${c}','s1','sim-${l1}@e.com','new','sim-p1'),
 ('${l2}','${OWNER_U}','${c}','s2','sim-${l2}@e.com','new','sim-p2'),
 ('${l3}','${OWNER_U}','${c}','s3','sim-${l3}@e.com','new','sim-p3');
insert into public.email_threads (id, user_id, lead_id, turn_count, high_priority) values
 ('${t1}','${OWNER_U}','${l1}',5,true), ('${t2}','${OWNER_U}','${l2}',2,false), ('${t3}','${OWNER_U}','${l3}',3,true);
insert into public.thread_memory (id, thread_id, lead_id, fact_kind, value, source_ts) values
 ('${m1}','${t1}','${l1}','interest_level','high',now()), ('${m2}','${t1}','${l1}','timing_window','q3',now()),
 ('${m3}','${t2}','${l2}','availability','next week',now());
insert into public.ai_classifications (user_id, lead_id, intent, confidence) values
 ('${OWNER_U}','${l1}','interested',0.9), ('${OWNER_U}','${l2}','handoff',0.7), ('${OWNER_U}','${l3}','booking',0.8);
insert into public.owner_alerts (user_id, lead_id, kind, title, priority) values
 ('${OWNER_U}','${l1}','first_reply','s','normal'), ('${OWNER_U}','${l2}','booking','s','high'), ('${OWNER_U}','${l3}','handoff','s','normal');
insert into public.audit_events (user_id, lead_id, event, payload) values
 ('${OWNER_U}','${l1}','ai.classified','{}'), ('${OWNER_U}','${l2}','ai.classified','{}'), ('${OWNER_U}','${l3}','ai.classified','{}');
insert into public.emails_sent (id, user_id, lead_id, campaign_id, subject, replied) values
 ('${e1}','${OWNER_U}','${l1}','${c}','s',true), ('${e2}','${OWNER_U}','${l2}','${c}','s',false), ('${e3}','${OWNER_U}','${l3}','${c}','s',false);
insert into public.tracking_events (email_id, user_id, lead_id, campaign_id, event) values
 ('${e1}','${OWNER_U}','${l1}','${c}','open'), ('${e2}','${OWNER_U}','${l2}','${c}','open'), ('${e3}','${OWNER_U}','${l3}','${c}','click');
insert into public.meetings (user_id, lead_id, campaign_id) values ('${OWNER_U}','${l1}','${c}'), ('${OWNER_U}','${l2}','${c}'), ('${OWNER_U}','${l3}','${c}');
insert into public.ai_spend_ledger (user_id, campaign_id, lead_id, fn, kind, model) values
 ('${OWNER_U}','${c}','${l1}','gen_email','gen_email','gpt'), ('${OWNER_U}','${c}','${l2}','classify','classify','gpt'), ('${OWNER_U}','${c}','${l3}','classify','classify','gpt');
insert into public.lead_score (lead_id, score, features) values ('${l1}',0.8,'{"r":1}'), ('${l2}',0.5,'{"r":0}'), ('${l3}',0.6,'{"r":1}');
insert into public.send_queue (user_id, campaign_id, lead_id, status) values
 ('${OWNER_U}','${c}','${l1}','pending'), ('${OWNER_U}','${c}','${l2}','pending'), ('${OWNER_U}','${c}','${l3}','pending');
insert into public.saved_businesses (place_id, email, name, company, niche, country, discovered_by) values
 ('sim-p1','sim-${l1}@e.com','S1','S1','x','GB','{${OWNER_U}}'::uuid[]),
 ('sim-p2','sim-${l2}@e.com','S2','S2','x','GB','{${OWNER_U}}'::uuid[]),
 ('sim-p3','sim-${l3}@e.com','S3','S3','x','GB','{${OWNER_U}}'::uuid[]),
 ('sim-pw','w@example.com','W','W','x','GB','{${OWNER_U}}'::uuid[]);
insert into public.campaign_learning (campaign_id, state) values ('${c}','{"v":{"a":{"sent":1}}}');
select public.forget_lead('${OWNER_U}','${l1}',false);
select public.forget_lead('${OWNER_U}','${l2}',true);
select public.delete_lead('${OWNER_U}','${l3}');
do $$ declare msg text; begin
  perform public.forget_lead('${OWNER_U}','00000000-0000-0000-0000-000000000000',false);
  raise exception 'SIM_GUARD_NOT_FIRED';
exception when others then
  msg := sqlerrm;
  if msg like '%LEAD_NOT_FOUND_OR_NOT_OWNED%' then null; elsif msg like '%SIM_GUARD_NOT_FIRED%' then raise; else raise; end if;
end $$;
select 1 as ok;
rollback;`;
  let simOk = false;
  try { const rows = await mgmt(sim); simOk = rows[0]?.ok === 1 || rows.length === 0; } catch (e) { simOk = false; console.log("  sim call error:", e.message); }
  a("simulation: fixture + 3 RPCs + guard ran inside BEGIN…ROLLBACK", simOk);
  const leftover = await mgmt(`select (select count(*) from public.thread_memory) tm, (select count(*) from public.campaign_learning where campaign_id='${c}') cl, (select count(*) from public.leads where id in ('${l1}','${l2}','${l3}')) lds;`).catch(() => [{ tm: -1, cl: -1, lds: -1 }]);
  a("simulation: no residue (lead/campaign-learning/thread-memory rows rolled back)", Number(leftover[0].tm) === 0 && Number(leftover[0].cl) === 0 && Number(leftover[0].lds) === 0);
}

// ---------------------------------------------------------------------------
// PASS 2 — LIVE (throwaway users, persisted, asserted, cleaned up)
// ---------------------------------------------------------------------------
console.log("\n== PASS 2: LIVE ==");
const U = uuid(), U2 = uuid();
const CID = uuid(), CID2 = uuid();
const L1 = uuid(), L2 = uuid(), L3 = uuid(), L4 = uuid();
const T1 = uuid(), T2 = uuid(), T3 = uuid(), T4 = uuid();
const M1 = uuid(), M2 = uuid(), M3 = uuid();
const E1 = uuid(), E2 = uuid(), E3 = uuid();
const places = { p1: "stage8-p1", p2: "stage8-p2", p3: "stage8-p3", pw: "stage8-pw", p4: "stage8-p4" };
const guardLead = uuid();

async function createUser(id, email) {
  const r = await fetch(`${PROJECT}/auth/v1/admin/users`, {
    method: "POST",
    headers: { apikey: svc, Authorization: `Bearer ${svc}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "Stg8!" + uuid().replace(/-/g, ""), email_confirm: true, id }),
  });
  if (r.status >= 300) throw new Error(`createUser ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const prof = await mgmt(`select count(*) as n from public.profiles where id='${id}';`);
  if (Number(prof[0].n) === 0) { // trigger did not fire (test env) — create minimal row
    await mgmt(`insert into public.profiles (id) values ('${id}') on conflict (id) do nothing;`).catch((e) => console.log("  (profile insert skipped:", e.message.slice(0, 120), ")"));
  }
  console.log(`  .. created user ${id.slice(0, 8)} <${email}>`);
}
async function seed() {
  await mgmt(`
insert into public.campaigns (id, user_id, name, status) values
 ('${CID}','${U}','stage8-c','paused'), ('${CID2}','${U2}','stage8-c2','paused');
insert into public.leads (id, user_id, campaign_id, name, email, status, place_id) values
 ('${L1}','${U}','${CID}','f1','f1@e.com','new','${places.p1}'),
 ('${L2}','${U}','${CID}','f2','f2@e.com','new','${places.p2}'),
 ('${L3}','${U}','${CID}','f3','f3@e.com','new','${places.p3}'),
 ('${L4}','${U2}','${CID2}','f4','f4@e.com','new','${places.p4}');
insert into public.email_threads (id, user_id, lead_id, turn_count, high_priority) values
 ('${T1}','${U}','${L1}',7,true), ('${T2}','${U}','${L2}',2,false), ('${T3}','${U}','${L3}',4,true), ('${T4}','${U2}','${L4}',1,false);
insert into public.thread_memory (id, thread_id, lead_id, fact_kind, value, source_ts) values
 ('${M1}','${T1}','${L1}','interest_level','high',now()-interval '2 days'),
 ('${M2}','${T1}','${L1}','timing_window','Q3',now()-interval '1 day'),
 ('${M3}','${T2}','${L2}','availability','next week',now());
insert into public.ai_classifications (user_id, lead_id, intent, confidence) values
 ('${U}','${L1}','interested',0.9), ('${U}','${L2}','handoff',0.7), ('${U}','${L3}','booking',0.8);
insert into public.owner_alerts (user_id, lead_id, kind, title, priority) values
 ('${U}','${L1}','first_reply','s','normal'), ('${U}','${L2}','booking','s','high'), ('${U}','${L3}','handoff','s','normal');
insert into public.audit_events (user_id, lead_id, event, payload) values
 ('${U}','${L1}','ai.classified','{}'), ('${U}','${L2}','ai.classified','{}'), ('${U}','${L3}','ai.classified','{}');
insert into public.emails_sent (id, user_id, lead_id, campaign_id, subject, replied) values
 ('${E1}','${U}','${L1}','${CID}','s',true), ('${E2}','${U}','${L2}','${CID}','s',false), ('${E3}','${U}','${L3}','${CID}','s',false);
insert into public.tracking_events (email_id, user_id, lead_id, campaign_id, event) values
 ('${E1}','${U}','${L1}','${CID}','open'), ('${E2}','${U}','${L2}','${CID}','open'), ('${E3}','${U}','${L3}','${CID}','click');
insert into public.meetings (user_id, lead_id, campaign_id) values
 ('${U}','${L1}','${CID}'), ('${U}','${L2}','${CID}'), ('${U}','${L3}','${CID}');
insert into public.ai_spend_ledger (user_id, campaign_id, lead_id, fn, kind, model) values
 ('${U}','${CID}','${L1}','gen_email','gen_email','gpt'), ('${U}','${CID}','${L2}','classify','classify','gpt'), ('${U}','${CID}','${L3}','classify','classify','gpt');
insert into public.lead_score (lead_id, score, features) values
 ('${L1}',0.8,'{"r":1}'), ('${L2}',0.5,'{"r":0}'), ('${L3}',0.6,'{"r":1}');
insert into public.send_queue (user_id, campaign_id, lead_id, status) values
 ('${U}','${CID}','${L1}','pending'), ('${U}','${CID}','${L2}','pending'), ('${U}','${CID}','${L3}','pending'), ('${U2}','${CID2}','${L4}','pending');
insert into public.saved_businesses (place_id, email, name, niche, country, discovered_by) values
 ('${places.p1}','f1@e.com','S1','x','GB','{${U}}'::uuid[]),
 ('${places.p2}','f2@e.com','S2','x','GB','{${U}}'::uuid[]),
 ('${places.p3}','f3@e.com','S3','x','GB','{${U}}'::uuid[]),
 ('${places.pw}','witness@e.com','W','x','GB','{${U}}'::uuid[]),
 ('${places.p4}','f4@e.com','S4','x','GB','{${U},${U2}}'::uuid[]);
insert into public.campaign_learning (campaign_id, state) values
 ('${CID}','{"v":{"a":{"sent":3}}}'), ('${CID2}','{"v":{"a":{"sent":1}}}');`);
  console.log("  .. seeded fixture (user U: 3 leads, witness business, camp.learning; user U2: witness lead + camp.learning)");
}

(async () => {
  try {
    console.log("  pass 2: provisioning throwaway users…");
    await createUser(U, `s8-${U.slice(0, 8)}@stage8.test`);
    await createUser(U2, `s8-${U2.slice(0, 8)}@stage8.test`);
    await seed();

    // -------- PHASE A: forget_lead(L1, suppress=false) --------
    console.log("\n  -- PHASE A: forget_lead(L1, suppress=false)");
    const rA = await rpc("forget_lead", { p_user_id: U, p_lead_id: L1, p_suppress: false });
    a("A: RPC 200", rA.status === 200, `status=${rA.status}`);
    const rcA = unwrap(rA.json, "forget_lead")?.row_counts;
    if (rcA) {
      a("A: row_counts match seeded (thread_memory=2, emails=1, meetings=1, tracking=1, ledger=1, score=1, queue_cancelled=1)",
        rcA.thread_memory === 2 && rcA.emails_sent === 1 && rcA.meetings === 1 && rcA.tracking_events === 1 &&
        rcA.ai_spend_ledger === 1 && rcA.lead_score === 1 && rcA.send_queue_cancelled === 1, JSON.stringify(rcA));
    } else { a("A: row_counts returned", false, rA.text.slice(0, 200)); }
    const rowsA = await mgmt(`
select 'A stores erased' as label, (
 (select count(*) from public.thread_memory where lead_id='${L1}')=0 and
 (select count(*) from public.ai_classifications where lead_id='${L1}')=0 and
 (select count(*) from public.owner_alerts where lead_id='${L1}')=0 and
 (select count(*) from public.audit_events where lead_id='${L1}')=0 and
 (select count(*) from public.emails_sent where lead_id='${L1}')=0 and
 (select count(*) from public.meetings where lead_id='${L1}')=0 and
 (select count(*) from public.tracking_events where lead_id='${L1}')=0 and
 (select count(*) from public.ai_spend_ledger where lead_id='${L1}')=0 and
 (select count(*) from public.lead_score where lead_id='${L1}')=0) as pass
union all select 'A queue cancelled', (select count(*) from public.send_queue where lead_id='${L1}' and status='cancelled')=1
union all select 'A thread tombstoned', (select count(*) from public.email_threads where lead_id='${L1}' and forget_at is not null and turn_count=0 and high_priority=false)=1
union all select 'A lead kept (data stays)', (select count(*) from public.leads where id='${L1}')=1
union all select 'A business email purged', (select count(*) from public.saved_businesses where place_id='${places.p1}' and email is null and discovered_by='{}'::uuid[] and '${U}'::uuid=any(forgotten_by))=1
union all select 'A witness business untouched', (select count(*) from public.saved_businesses where place_id='${places.pw}' and email='witness@e.com' and '${U}'::uuid=any(discovered_by))=1
union all select 'A campaign_learning dropped', (select count(*) from public.campaign_learning where campaign_id='${CID}')=0
union all select 'A no suppression written', (select count(*) from public.suppressions where user_id='${U}')=0
union all select 'A audit lead.forgot (suppressed=false)', (select count(*) from public.audit_events where user_id='${U}' and lead_id is null and event='lead.forgot' and (payload->>'suppressed')::boolean=false)=1;`);
    for (const r of rowsA) a(`A: ${r.label}`, r.pass === true || r.pass === 1);

    // -------- PHASE B: forget_lead(L2, suppress=true) --------
    console.log("\n  -- PHASE B: forget_lead(L2, suppress=true)");
    const rB = await rpc("forget_lead", { p_user_id: U, p_lead_id: L2, p_suppress: true });
    a("B: RPC 200", rB.status === 200, `status=${rB.status}`);
    const rcB = unwrap(rB.json, "forget_lead")?.row_counts;
    if (rcB) a("B: row_counts (suppressed=true)", rcB.thread_memory === 1 && rcB.send_queue_cancelled === 1, JSON.stringify(rcB));
    const rowsB = await mgmt(`
select 'B stores erased' as label, (
 (select count(*) from public.thread_memory where lead_id='${L2}')=0 and
 (select count(*) from public.ai_classifications where lead_id='${L2}')=0 and
 (select count(*) from public.owner_alerts where lead_id='${L2}')=0 and
 (select count(*) from public.audit_events where lead_id='${L2}')=0 and
 (select count(*) from public.emails_sent where lead_id='${L2}')=0 and
 (select count(*) from public.meetings where lead_id='${L2}')=0 and
 (select count(*) from public.tracking_events where lead_id='${L2}')=0 and
 (select count(*) from public.ai_spend_ledger where lead_id='${L2}')=0 and
 (select count(*) from public.lead_score where lead_id='${L2}')=0) as pass
union all select 'B thread tombstoned', (select count(*) from public.email_threads where lead_id='${L2}' and forget_at is not null)=1
union all select 'B lead kept + suppressed', (select count(*) from public.leads where id='${L2}' and unsubscribed=true and status='suppressed')=1
union all select 'B suppression row (manual)', (select count(*) from public.suppressions where user_id='${U}' and lower(email)='f2@e.com' and reason='manual')=1
union all select 'B business email purged', (select count(*) from public.saved_businesses where place_id='${places.p2}' and email is null and '${U}'::uuid=any(forgotten_by))=1
union all select 'B audit lead.forgot (suppressed=true)', (select count(*) from public.audit_events where user_id='${U}' and lead_id is null and event='lead.forgot' and (payload->>'suppressed')::boolean=true)=1;`);
    for (const r of rowsB) a(`B: ${r.label}`, r.pass === true || r.pass === 1);

    // -------- PHASE C: delete_lead(L3) --------
    console.log("\n  -- PHASE C: delete_lead(L3)");
    const rC = await rpc("delete_lead", { p_user_id: U, p_lead_id: L3 });
    a("C: RPC 200", rC.status === 200, `status=${rC.status}`);
    const rcC = unwrap(rC.json, "delete_lead")?.row_counts;
    if (rcC) a("C: row_counts (deleted=true)", unwrap(rC.json, "delete_lead")?.deleted === true && rcC.emails_sent === 1, JSON.stringify(unwrap(rC.json, "delete_lead")));
    const rowsC = await mgmt(`
select 'C lead gone' as label, (select count(*) from public.leads where id='${L3}')=0 as pass
union all select 'C threads gone', (select count(*) from public.email_threads where lead_id='${L3}')=0
union all select 'C all stores gone', (
 (select count(*) from public.thread_memory where lead_id='${L3}')=0 and
 (select count(*) from public.ai_classifications where lead_id='${L3}')=0 and
 (select count(*) from public.owner_alerts where lead_id='${L3}')=0 and
 (select count(*) from public.audit_events where lead_id='${L3}')=0 and
 (select count(*) from public.emails_sent where lead_id='${L3}')=0 and
 (select count(*) from public.meetings where lead_id='${L3}')=0 and
 (select count(*) from public.tracking_events where lead_id='${L3}')=0 and
 (select count(*) from public.ai_spend_ledger where lead_id='${L3}')=0 and
 (select count(*) from public.lead_score where lead_id='${L3}')=0 and
 (select count(*) from public.send_queue where lead_id='${L3}')=0) as pass
union all select 'C business attribution purged', (select count(*) from public.saved_businesses where place_id='${places.p3}' and email is null and '${U}'::uuid=any(forgotten_by))=1
union all select 'C audit lead.deleted', (select count(*) from public.audit_events where user_id='${U}' and lead_id is null and event='lead.deleted')=1
union all select 'C siblings kept (L1,L2)', (select count(*) from public.leads where id in ('${L1}','${L2}'))=2
union all select 'C campaign kept', (select count(*) from public.campaigns where id='${CID}')=1
union all select 'C campaign_learning CID still dropped', (select count(*) from public.campaign_learning where campaign_id='${CID}')=0;`);
    for (const r of rowsC) a(`C: ${r.label}`, r.pass === true || r.pass === 1);
    if (rowsC.some((r) => !(r.pass === true || r.pass === 1))) console.log("  [debug rowsC]", JSON.stringify(rowsC));
    if (rowsC.some((r) => !(r.pass === true || r.pass === 1))) console.log("  [debug state]",
      JSON.stringify((await mgmt(`select (select count(*) from public.leads where user_id='${U}') ul, (select count(*) from public.leads where user_id='${U2}') u2l, (select count(*) from public.campaigns where user_id='${U}') uc, (select count(*) from public.campaigns where user_id='${U2}') u2c, (select count(*) from public.campaign_learning where campaign_id in ('${CID}','${CID2}')) cl, (select count(*) from public.saved_businesses where place_id in ('${places.p1}','${places.p2}','${places.p3}','${places.pw}','${places.p4}')) sb;`).catch(() => [{ e: 1 }]))[0]));

    // -------- PHASE D: cross-user leak + witness integrity --------
    console.log("\n  -- PHASE D: cross-user leak + witness integrity");
    const rowsD = await mgmt(`
select 'D witness user lead kept' as label, (select count(*) from public.leads where id='${L4}')=1 as pass
union all select 'D witness thread kept', (select count(*) from public.email_threads where id='${T4}' and forget_at is null)=1
union all select 'D witness business email kept (2 contributors, 1 remaining)', (select count(*) from public.saved_businesses where place_id='${places.p4}' and email='f4@e.com' and '${U2}'::uuid=any(discovered_by) and not '${U}'::uuid=any(forgotten_by))=1
union all select 'D witness camp.learning kept', (select count(*) from public.campaign_learning where campaign_id='${CID2}')=1
union all select 'D witness queue kept (pending)', (select count(*) from public.send_queue where lead_id='${L4}' and status='pending')=1;`);
    for (const r of rowsD) a(`D: ${r.label}`, r.pass === true || r.pass === 1);

    // -------- PHASE E: ownership guard --------
    console.log("\n  -- PHASE E: ownership guard");
    const rE = await rpc("forget_lead", { p_user_id: U, p_lead_id: guardLead, p_suppress: false });
    a("E: unknown lead rejected", rE.status >= 400 && rE.text.includes("LEAD_NOT_FOUND_OR_NOT_OWNED"), `status=${rE.status} body=${rE.text.slice(0, 120)}`);
    const rE2 = await rpc("forget_lead", { p_user_id: U, p_lead_id: L4, p_suppress: false });
    a("E: someone else's lead rejected", rE2.status >= 400 && rE2.text.includes("LEAD_NOT_FOUND_OR_NOT_OWNED"), `status=${rE2.status}`);
    const rE3 = await rpc("delete_lead", { p_user_id: U2, p_lead_id: L1, });
    a("E: cross-user delete_lead rejected", rE3.status >= 400 && rE3.text.includes("LEAD_NOT_FOUND_OR_NOT_OWNED"), `status=${rE3.status}`);

    // -------- RESULT --------
    const fails = out.filter((x) => !x.ok);
    console.log(`\nRESULT: ${fails.length === 0 ? "PASS" : "FAIL"} (${out.length - fails.length}/${out.length} assertions)`);
  } finally {
    console.log("\n  cleanup…");
    try { await mgmt(`
delete from public.saved_businesses where place_id in ('${places.p1}','${places.p2}','${places.p3}','${places.pw}','${places.p4}');
delete from public.audit_events where user_id in ('${U}','${U2}') or lead_id in ('${L1}','${L2}','${L3}','${L4}');
delete from public.ai_spend_ledger where user_id in ('${U}','${U2}') or lead_id in ('${L1}','${L2}','${L3}','${L4}');
delete from public.campaign_learning where campaign_id in ('${CID}','${CID2}');
delete from public.send_queue where user_id in ('${U}','${U2}') or lead_id in ('${L1}','${L2}','${L3}','${L4}');
delete from public.suppressions where user_id in ('${U}','${U2}');
delete from public.leads where user_id in ('${U}','${U2}');
delete from public.campaigns where user_id in ('${U}','${U2}');
delete from public.profiles where id in ('${U}','${U2}');
delete from auth.users where id in ('${U}','${U2}');`); } catch (e) { console.log("  cleanup warn:", e.message.slice(0, 160)); }
    const res = await mgmt(`select
  (select count(*) from public.leads where id='${L1}') l1_present,
  (select count(*) from public.saved_businesses where place_id in ('${places.p1}','${places.p2}','${places.p3}','${places.pw}','${places.p4}')) sb,
  (select count(*) from public.campaign_learning where campaign_id in ('${CID}','${CID2}')) cl,
  (select count(*) from public.audit_events where user_id in ('${U}','${U2}')) aud,
  (select count(*) from auth.users where id in ('${U}','${U2}')) usr;`).catch(() => [{ l1_present: -1, sb: -1, cl: -1, aud: -1, usr: -1 }]);
    console.log("  residue:", JSON.stringify(res[0]));
    const ok = Number(res[0].l1_present) === 0 && Number(res[0].sb) === 0 && Number(res[0].cl) === 0 && Number(res[0].aud) === 0 && Number(res[0].usr) === 0;
    out.push({ label: "cleanup: zero residue", ok, note: JSON.stringify(res[0]) });
    console.log(`RESULT(final): ${ok ? "PASS" : "FAIL"}`);
    process.exit(ok && out.every((x) => x.ok) ? 0 : 1);
  }
})().catch((e) => { console.error("HARNESS ERROR:", e); process.exit(1); });