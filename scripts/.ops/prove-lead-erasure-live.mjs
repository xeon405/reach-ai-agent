// Live proof: lead-erasure function (auth-first wrapper over forget_lead / delete_lead).
// - no Authorization => 401, zero side effects (rejection BEFORE any RPC fires)
// - server validation: bad action / bad leadId => 400
// - unknown lead => 404; ownership-negative (other user's lead) => 404 + untouched
// - forget vs delete exact row_counts against seeded fixture stores
// - delete really removes the lead (cascade) + its fingerprint rows
// Teardown: ephemeral users deleted even on failure; profiles verified gone.
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

let fails = 0;
let created = [];
const check = (name, ok, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`);
  if (!ok) fails++;
};

const mkUser = async (tag) => {
  const email = `eras-${tag}-${Date.now()}@example.com`;
  const r = await fetch(`${SITE}/auth/v1/admin/users`, {
    method: "POST",
    headers: { apikey: svc, Authorization: `Bearer ${svc}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "eras-proof-pass-123", email_confirm: true }),
  });
  const j = await r.json();
  if (!r.ok || !j?.id) throw new Error(`mkUser ${tag}: ${r.status} ${JSON.stringify(j).slice(0, 200)}`);
  created.push(j.id);
  const tok = await fetch(`${SITE}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: svc, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "eras-proof-pass-123" }),
  }).then((r) => r.json());
  return { uid: j.id, token: tok?.access_token, email };
};

const q1 = (table, cond) => b(`select count(*)::int c from ${table} where ${cond};`).then((r) => r[0]?.c ?? -1);

const call = async (token, body) => {
  const r = await fetch(`${SITE}/functions/v1/lead-erasure`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: r.status, json: await r.json().catch(() => null) };
};

try {
  // ---------- setup: users ----------
  const A = await mkUser("fixture");
  const B = await mkUser("other");
  check("ephemeral users created", !!A.uid && !!B.uid, `A=${A.uid.slice(0, 8)}`);

  // ---------- setup: fixtures ----------
  const cA = (await b(`insert into campaigns (user_id, name, status) values ('${A.uid}', 'eras-proof-a', 'draft') returning id;`))[0].id;
  const cB = (await b(`insert into campaigns (user_id, name, status) values ('${A.uid}', 'eras-proof-b', 'draft') returning id;`))[0].id;
  await b(`insert into campaign_learning (campaign_id, state, version, triggered_by) values ('${cB}', '{}', 1, 'fixture');`);
  await b(`insert into campaign_learning (campaign_id, state, version, triggered_by) values ('${cA}', '{}', 1, 'fixture');`);

  const mkLead = async (uid, name, placeId, email, camId) =>
    (await b(`insert into leads (user_id, campaign_id, name, email, country, status, place_id)
       values ('${uid}', '${camId}', '${name}', '${email}', 'US', 'new', ${placeId ? `'${placeId}'` : "NULL"}) returning id;`))[0].id;

  const leadA = await mkLead(A.uid, "Forget Fixture A", "ch_fixture_forget_a", "forget-a@proof.test", cA);
  const leadB = await mkLead(A.uid, "Delete Fixture B", null, "delete-b@proof.test", cB);
  const leadC = await mkLead(B.uid, "Ownership Fixture C", "ch_fixture_c", "owners-c@proof.test", cB);
  check("fixture leads created", !!leadA && !!leadB && !!leadC);

  const seed = async (L, uid, camId, tag) => {
    await b(`insert into email_threads (user_id, lead_id, turn_count, high_priority) values ('${uid}', '${L}', 3, true);`);
    const thr = (await b(`select id from email_threads where lead_id='${L}' limit 1;`))[0].id;
    await b(`insert into thread_memory (thread_id, lead_id, fact_kind, value) values ('${thr}', '${L}', 'interest_level', '${tag}-fact');`);
    await b(`insert into ai_classifications (user_id, lead_id, intent) values ('${uid}', '${L}', 'meeting');`);
    await b(`insert into owner_alerts (user_id, lead_id, kind, title, body, priority, read) values ('${uid}', '${L}', 'system', '${tag}', '${tag} body', 'high', false);`);
    await b(`insert into emails_sent (user_id, lead_id, campaign_id, subject, body) values ('${uid}', '${L}', '${camId}', '${tag} subj', '${tag} body');`);
    await b(`insert into meetings (user_id, lead_id, campaign_id, booked_at) values ('${uid}', '${L}', '${camId}', now());`);
    await b(`insert into tracking_events (user_id, lead_id, campaign_id, event, occurred_at) values ('${uid}', '${L}', '${camId}', 'open', now());`);
    await b(`insert into audit_events (user_id, lead_id, event) values ('${uid}', '${L}', 'lead.saved');`);
    await b(`insert into ai_spend_ledger (fn, kind, model, input_tokens, output_tokens, est_cost_usd, user_id, lead_id) values ('fixture', 'fixture', 'proof', 10, 5, 0.001, '${uid}', '${L}');`);
    await b(`insert into lead_score (lead_id, score, tier, features, score_version, computed_at, expires_at) values ('${L}', 0.5, 'C', '{}', 1, now(), now() + interval '1 day');`);
    await b(`insert into send_queue (user_id, campaign_id, lead_id, variant, status, attempts, priority, created_at) values ('${uid}', '${camId}', '${L}', 'a', 'pending', 0, 0, now());`);
  };
  await seed(leadA, A.uid, cA, "A");
  await seed(leadB, A.uid, cB, "B");
  await seed(leadC, B.uid, cB, "C");

  // Every leads insert fires trg_audit_lead_created (lead.created) in addition
  // to the manual seed row => 2 audit rows per lead. Measure, don't assume.
  const auditA = await q1("audit_events", `lead_id='${leadA}'`);
  const auditB = await q1("audit_events", `lead_id='${leadB}'`);
  const auditC = await q1("audit_events", `lead_id='${leadC}'`);

  // saved_businesses: A matches via place_id; B matches via email (place_id NULL).
  // Shared map with no user FK — pre-clean any leaked rows from earlier crashed
  // runs (idempotent; 'Fix %' matches only this proof's fixtures).
  await b(`delete from saved_businesses where name like 'Fix %';`);
  await b(`insert into saved_businesses (place_id, email, name, niche, country, first_seen, last_seen, discovered_by, forgotten_by)
    values ('ch_fixture_forget_a', 'forget-a@proof.test', 'Fix A', 'x', 'US', now(), now(), array['${A.uid}']::uuid[], '{}');`);
  await b(`insert into saved_businesses (place_id, email, name, niche, country, first_seen, last_seen, discovered_by, forgotten_by)
    values (NULL, 'delete-b@proof.test', 'Fix B', 'x', 'US', now(), now(), array['${A.uid}']::uuid[], '{}');`);

  // ---------- 1) no Authorization => 401, zero side effects ----------
  const ghostUuid = "00000000-0000-4000-8000-00000000dead";
  const noAuth = await fetch(`${SITE}/functions/v1/lead-erasure`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "forget", leadId: ghostUuid }),
  });
  const noAuthJson = await noAuth.json().catch(() => null);
  // verify_jwt=ON means the platform itself 401s the missing token before any
  // code runs; the function's own guard is a redundant second layer. Asserting
  // just "401 + zero side effects" is the contract.
  check("no Authorization rejected 401", noAuth.status === 401, `(${noAuth.status} ${JSON.stringify(noAuthJson)?.slice(0, 80)})`);
  check("zero side effects (no audit row for ghost lead)", (await q1("audit_events", `lead_id='${ghostUuid}'`)) === 0);

  // ---------- 2) server validation 400s ----------
  const badAction = await call(A.token, { action: "sweep", leadId: ghostUuid });
  check("invalid action => 400", badAction.status === 400);
  const badId = await call(A.token, { action: "forget", leadId: "not-a-uuid" });
  check("invalid leadId => 400", badId.status === 400);

  // ---------- 3) unknown lead => 404 ----------
  const missing = await call(A.token, { action: "forget", leadId: ghostUuid });
  check("unknown lead => 404", missing.status === 404);

  // ---------- 4) ownership-negative (B's lead C via A's token) ----------
  const notMine = await call(A.token, { action: "forget", leadId: leadC });
  check("other user's lead forget => 404", notMine.status === 404);
  const notMineDel = await call(A.token, { action: "delete", leadId: leadC });
  check("other user's lead delete => 404", notMineDel.status === 404);
  check("other lead untouched after both", (await q1("thread_memory", `lead_id='${leadC}'`)) === 1 && (await q1("leads", `id='${leadC}'`)) === 1
    && (await q1("audit_events", `lead_id='${leadC}'`)) === auditC, `(auditC=${auditC})`);

  // ---------- 5) forget lead A (suppress=false via caller) ----------
  const fg = await call(A.token, { action: "forget", leadId: leadA });
  const fj = fg.json ?? {};
  const rc = fj.row_counts ?? {};
  check("forget 200 + forgot:true", fg.status === 200 && fj.forgot === true && fj.suppressed === false);
  check("forget exact row_counts", rc.thread_memory === 1 && rc.ai_classifications === 1 && rc.owner_alerts === 1 && rc.emails_sent === 1
    && rc.meetings === 1 && rc.tracking_events === 1 && rc.audit_events === auditA && rc.ai_spend_ledger === 1
    && rc.lead_score === 1 && rc.send_queue_cancelled === 1 && rc.email_threads_tombstoned === 1 && rc.saved_businesses_purged === 1,
    JSON.stringify(rc));
  check("lead row kept", (await q1("leads", `id='${leadA}'`)) === 1);
  const tomb = (await b(`select forget_at is not null as t, turn_count as tc, high_priority as hp from email_threads where lead_id='${leadA}';`))[0];
  check("thread tombstones (forget_at set, counters reset)", tomb?.t === true && tomb?.tc === 0 && tomb?.hp === false);
  check("queue cancelled but kept", (await q1("send_queue", `lead_id='${leadA}' and status='cancelled'`)) === 1);
  const sbA = (await b(`select discovered_by, forgotten_by, email from saved_businesses where place_id='ch_fixture_forget_a';`))[0];
  check("saved_business attribution purged (discovered removed, forgotten appended, email nulled)",
    !(sbA?.discovered_by ?? []).includes(A.uid) && (sbA?.forgotten_by ?? []).includes(A.uid) && sbA?.email === null,
    JSON.stringify(sbA));
  check("campaign_learning A folded (0 left)", (await q1("campaign_learning", `campaign_id='${cA}'`)) === 0);
  check("audit: no per-lead rows; one identity-light lead.forgot", (await q1("audit_events", `lead_id='${leadA}'`)) === 0
    && (await q1("audit_events", `event='lead.forgot' and lead_id is null and user_id='${A.uid}'`)) === 1);
  // re-forget idempotency: no double-erase. Delete-type stores stay 0; the two
  // persistent markers (already-tombstoned thread, already-purged business)
  // are re-marked (1) simply because they still exist — the RPC is re-entrant.
  const fg2 = await call(A.token, { action: "forget", leadId: leadA });
  const rc2 = fg2.json?.row_counts ?? {};
  const zeroes = ["thread_memory", "ai_classifications", "owner_alerts", "emails_sent", "meetings",
    "tracking_events", "audit_events", "ai_spend_ledger", "lead_score", "send_queue_cancelled"]
    .every((k) => rc2[k] === 0);
  check("re-forget idempotent (deletes all zero, lead kept, re-mark only)",
    fg2.status === 200 && fg2.json?.forgot === true && zeroes
      && rc2.email_threads_tombstoned === 1 && rc2.saved_businesses_purged === 1,
    JSON.stringify(rc2));

  // ---------- 6) delete lead B ----------
  const dl = await call(A.token, { action: "delete", leadId: leadB });
  const dj = dl.json ?? {};
  const drc = dj.row_counts ?? {};
  check("delete 200 + deleted:true", dl.status === 200 && dj.deleted === true);
  check("delete exact row_counts", drc.thread_memory === 1 && drc.ai_classifications === 1 && drc.owner_alerts === 1 && drc.emails_sent === 1
    && drc.meetings === 1 && drc.tracking_events === 1 && drc.audit_events === auditB && drc.ai_spend_ledger === 1
    && drc.send_queue === 1 && drc.campaign_learning === 1 && drc.saved_businesses_purged === 1, JSON.stringify(drc));
  check("lead row gone", (await q1("leads", `id='${leadB}'`)) === 0);
  check("child + cascade rows gone for B", (await q1("thread_memory", `lead_id='${leadB}'`)) === 0
    && (await q1("emails_sent", `lead_id='${leadB}'`)) === 0 && (await q1("meetings", `lead_id='${leadB}'`)) === 0
    && (await q1("tracking_events", `lead_id='${leadB}'`)) === 0 && (await q1("lead_score", `lead_id='${leadB}'`)) === 0
    && (await q1("send_queue", `lead_id='${leadB}'`)) === 0 && (await q1("email_threads", `lead_id='${leadB}'`)) === 0);
  check("campaign_learning B folded (0 left)", (await q1("campaign_learning", `campaign_id='${cB}'`)) === 0);
  check("audit: identity-light lead.deleted", (await q1("audit_events", `event='lead.deleted' and lead_id is null and user_id='${A.uid}'`)) === 1);
} catch (err) {
  console.log("ERROR during proof setup/run:", err.message);
  fails++;
} finally {
  // ---------- teardown ----------
  for (const uid of created) {
    await fetch(`${SITE}/auth/v1/admin/users/${uid}`, { method: "DELETE", headers: { apikey: svc, Authorization: `Bearer ${svc}` } }).catch(() => null);
  }
  const peeps = created.length ? `id='${created.join("' or id='")}'` : "false";
  check("ephemeral users deleted & profiles gone", (await q1("profiles", peeps)) === 0, `(${created.length} user(s))`);
}

console.log(`\n${fails === 0 ? "all checks passed" : fails + " check(s) failed"}`);
// Same deterministic-exit pattern as the sweep (win32 fetch-socket race).
process.exitCode = fails ? 1 : 0;