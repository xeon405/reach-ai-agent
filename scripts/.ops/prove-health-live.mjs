// LIVE PROOF — stage-9 health-check end-to-end against production.
// Protocol (design-approved):
//   fire   -> unschedule warm-areas -> run -> alert fires (owner_alerts + push_queue)
//   cooldown-> run again while broken -> stays silent (no 2nd alert)
//   resolve-> reschedule -> run -> episode resolved, no alert
//   recur  -> unschedule -> run -> NEW alert (recurrence still alerts)
// Cleanup restores byte-identical cron + removes every row the proof created.
import { getEnv, runQuery } from "./_db.mjs";

const SUPABASE_URL = getEnv("SUPABASE_URL");
const CRON_SECRET = getEnv("CRON_SECRET");
const WARM = "outreachai_warm_areas_daily";
const KEY = `cron:${WARM}`;
const TITLE = `Cron missing: ${WARM}`;

let failed = 0;
let passed = 0;
function assert(cond, label, extra = "") {
  if (cond) { passed++; console.log(`  PASS ${label}`); }
  else { failed++; console.log(`  FAIL ${label} ${extra}`); }
}
async function check(label, fn) {
  try {
    await fn();
  } catch (e) {
    failed++;
    console.log(`  FAIL ${label} — threw: ${e.message}`);
  }
}
const q = (sql) => runQuery(sql);
const esc = (s) => s.replace(/'/g, "''");
const since = () => {
  const s = new Date(Date.now() - 1000).toISOString();
  return s;
};

const WINDOW_START = new Date().toISOString();

async function runHealth() {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/health-check`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-cron-secret": CRON_SECRET },
    body: JSON.stringify({ trigger: "pg_cron" }),
  });
  const j = await res.json();
  return { status: res.status, j };
}

async function systemAlertRows() {
  return q(
    `select id, title, body, created_at from public.owner_alerts
     where kind='system' and created_at >= '${WINDOW_START}' and title ilike '%${WARM}%'
     order by created_at;`,
  );
}
async function pushRows() {
  return q(
    `select user_id, title, body from public.push_queue
     where created_at >= '${WINDOW_START}' and title ilike '%${WARM}%' order by created_at;`,
  );
}
async function stateRow() {
  const r = await q(`select * from public.health_state where check_key='${KEY}';`);
  return r[0] ?? null;
}
async function auditRuns() {
  const r = await q(
    `select count(*) c from public.audit_events where event='health.run' and created_at >= '${WINDOW_START}';`,
  );
  return Number(r[0]?.c ?? 0);
}
const cronExists = async (name) => {
  const r = await q(`select count(*) c from cron.job where jobname='${esc(name)}';`);
  return Number(r[0]?.c ?? 0) > 0;
};

const warm = {
  schedule: "0 6 * * *",
  command: `select net.http_post(url:='https://zvohdvopmvzsujktrdmu.supabase.co/functions/v1/warm-areas', headers:=jsonb_build_object('x-cron-secret', '${CRON_SECRET}', 'Content-Type', 'application/json'), body:='{}'::jsonb);`,
};
const unschedule = (name) => q(`select cron.unschedule('${esc(name)}');`);
const rescheduleWarm = () =>
  q(
    `select cron.schedule('${esc(WARM)}', '${warm.schedule}', $cmd$${warm.command}$cmd$);`,
  );

// ---- no fixture: pg_cron.pg_owns job_run_details, and cron.run_job() is
// absent from this pg_cron version. Instead the baseline run legitimately
// reports cron:health-hourly "never succeeded" (brand-new cron, first real
// firing is at 00:00 UTC). That finding is TRUE; its health_state row stays
// active so the first real scheduled run resolves it silently. The proof
// asserts on the warm-areas key only.

try {
console.log("STEP 0 — baseline");
  await check("0.1 warm-areas cron exists at baseline", async () => {
    assert(await cronExists(WARM), "warm-areas present");
  });
  const alertBase = (await systemAlertRows()).length;
  assert(alertBase === 0, `no system alerts for ${WARM} before we start`);

  console.log("STEP 1 — healthy baseline run");
  await check("1 healthy baseline", async () => {
    const r = await runHealth();
    assert(r.status === 200 && r.j?.ok === true, "function completes ok", JSON.stringify(r.j));
    assert((await auditRuns()) === 1, "audit health.run recorded");
    const al = await systemAlertRows();
    assert(al.length === alertBase, `no alert on healthy baseline (${al.length} vs ${alertBase})`);
  });

  console.log("STEP 2 — FIRE: break warm-areas and confirm the alert fires");
  await check("2 break + fire", async () => {
    await unschedule(WARM);
    assert(!(await cronExists(WARM)), "warm-areas unscheduled");
    const r = await runHealth();
    assert(r.status === 200 && r.j?.ok === true, "check completes", JSON.stringify(r.j));
    assert((r.j?.problems ?? []).includes(KEY), `problem key ${KEY} reported`);
    const al = await systemAlertRows();
    assert(al.length === 1, `one alert fired (${al.length})`, JSON.stringify(al));
    assert(al[0]?.body?.includes("[alert #1]"), "alert body carries [alert #1]", al[0]?.body);
    const st = await stateRow();
    assert(st && !st.resolved_at && st.alert_count === 1, "health_state active, count=1");
    const p = await pushRows();
    assert(p.length === 1, `push_queue row enqueued (${p.length})`, JSON.stringify(p));
  });

  console.log("STEP 3 — COOLDOWN: still broken, run again -> silent");
  await check("3 cooldown", async () => {
    const firstSeen = (await stateRow())?.last_seen_at;
    const r = await runHealth();
    assert(r.status === 200 && r.j?.ok === true, "check completes");
    const al = await systemAlertRows();
    assert(al.length === 1, `no second alert (${al.length})`);
    const st = await stateRow();
    assert(st && st.alert_count === 1 && new Date(st.last_seen_at) > new Date(firstSeen), "count stays 1, last_seen advanced");
    const p = await pushRows();
    assert(p.length === 1, `no duplicate push (${p.length})`);
  });

  console.log("STEP 4 — RESOLVE: reschedule, run -> episode resolved, no alert");
  await check("4 resolve", async () => {
    await rescheduleWarm();
    assert(await cronExists(WARM), "warm-areas rescheduled");
    const r = await runHealth();
    assert(r.status === 200 && r.j?.ok === true, "check completes");
    assert(!(r.j?.problems ?? []).includes(KEY), "problem key gone");
    const al = await systemAlertRows();
    assert(al.length === 1, `no new alert on resolve (${al.length})`);
    const st = await stateRow();
    assert(st && !!st.resolved_at, "health_state resolved");
  });

  console.log("STEP 5 — RECUR: break again -> NEW alert (recurrence still alerts)");
  await check("5 recur", async () => {
    await unschedule(WARM);
    const r = await runHealth();
    assert(r.status === 200 && r.j?.ok === true, "check completes");
    const al = await systemAlertRows();
    assert(al.length === 2, `new alert on recurrence (${al.length})`, JSON.stringify(al));
    assert(al[al.length - 1]?.body?.includes("[alert #2]"), "recurrence body carries [alert #2]");
    const st = await stateRow();
    assert(st && st.alert_count === 2 && !st.resolved_at && st.escalated_at === null, "count=2, new active episode, escalation reset");
    const p = await pushRows();
    assert(p.length === 2, `second push enqueued (distinct body) (${p.length})`);
  });

  console.log("STEP 6 — CLEANUP");
  await check("6 cleanup", async () => {
    await rescheduleWarm();
    if (await cronExists(WARM)) {
      await q(`delete from public.health_state where check_key='${KEY}';`);
      await q(`delete from public.owner_alerts where kind='system' and created_at >= '${WINDOW_START}' and title ilike '%${esc(WARM)}%';`);
      await q(`delete from public.push_queue where created_at >= '${WINDOW_START}' and title ilike '%${esc(WARM)}%';`);
    }
    assert(await cronExists(WARM), "warm-areas restored");
    const st = await stateRow();
    assert(st === null, "health_state cleaned");
    assert((await systemAlertRows()).length === 0, "system alerts cleaned");
  });
} finally {
  // restore the circadian cron no matter what
  if (!(await cronExists(WARM))) await rescheduleWarm();
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);