// Simulation proof for the stage-9 health-check decision engine.
// Imports the EXACT module shipped to production (_shared/health-engine.ts)
// so the proof exercises the real code: thresholds, cron staleness/missing
// logic, drift epsilon, and the full dedup/cooldown state machine.
import {
  alertBody,
  alertTitle,
  cronLimitMs,
  cronProblems,
  driftProblems,
  evaluateHealth,
  PENDING_STALE_MS,
  pingDeadMan,
  PROCESSING_ORPHAN_MS,
  queueProblems,
  STALE_FLOOR_MIN,
} from "../../supabase/functions/_shared/health-engine.ts";
import type { HealthProblem, HealthState } from "../../supabase/functions/_shared/health-engine.ts";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(cond: boolean, label: string) {
  if (cond) {
    passed++;
    console.log(`  PASS ${label}`);
  } else {
    failed++;
    failures.push(label);
    console.log(`  FAIL ${label}`);
  }
}

function isIso(s: unknown): s is string {
  return typeof s === "string" && !Number.isNaN(new Date(s).getTime());
}

const T0 = new Date("2026-09-10T12:00:00Z").getTime();

console.log("BLOCK A — cron staleness / missing");
{
  // cost-sweep cadence 5m -> 2x=10m, floored to STALE_FLOOR_MIN (30m)
  assert(cronLimitMs("cost-sweep") === 30 * 60 * 1000, "A1 cost-sweep limit floored at 30m");
  assert(cronLimitMs("outreachai_send_worker_hourly") === 2 * 60 * 60 * 1000, "A2 hourly cron limit = 2h");
  assert(cronLimitMs("outreachai_warm_areas_daily") === 2 * 86400 * 1000, "A3 daily cron limit = 2d");
  assert(cronLimitMs("unknown-job") === 2 * 60 * 60 * 1000, "A4 unknown cron defaults to 2h");

  const fresh = cronProblems(
    [
      { jobname: "cost-sweep", last_success: new Date(T0 - 29 * 60 * 1000).toISOString() },
      { jobname: "outreachai_send_worker_hourly", last_success: new Date(T0 - 90 * 60 * 1000).toISOString() },
      { jobname: "outreachai_warm_areas_daily", last_success: new Date(T0 - 86400 * 1000).toISOString() },
    ],
    T0,
  );
  assert(!fresh.some((p) => p.key === "cron:cost-sweep"), "A5 cost-sweep within floored limit => ok");
  assert(!fresh.some((p) => p.key === "cron:outreachai_send_worker_hourly"), "A6 hourly within 2h => ok");
  assert(!fresh.some((p) => p.key === "cron:outreachai_warm_areas_daily"), "A7 daily within 2d => ok");
  // but missing expected jobs ARE flagged
  assert(fresh.some((p) => p.key === "cron:learning-hourly") && fresh.some((p) => p.key === "cron:outreachai_inbox_agent_hourly"), "A8 every expected-but-missing job flagged");

  const stale = cronProblems(
    [
      { jobname: "outreachai_send_worker_hourly", last_success: new Date(T0 - 3 * 60 * 60 * 1000).toISOString() },
      { jobname: "reputation-nightly", last_success: new Date(T0 - 3 * 86400 * 1000).toISOString() },
    ],
    T0,
  );
  assert(stale.some((p) => p.key === "cron:outreachai_send_worker_hourly"), "A9 hourly job 3h silent => stale");
  assert(stale.some((p) => p.key === "cron:reputation-nightly"), "A10 nightly 3d silent => stale");

  // a cron that has NEVER fired isn't stale yet (waiting for first scheduled run)
  {
    const allHealthy = {
      "cost-sweep": new Date(T0 - 4 * 60 * 1000).toISOString(),
      "outreachai_push_drainer_minutely": new Date(T0 - 30 * 1000).toISOString(),
      "outreachai_inbox_agent_hourly": new Date(T0 - 30 * 1000).toISOString(),
      "outreachai_send_worker_hourly": new Date(T0 - 50 * 60 * 1000).toISOString(),
      "learning-hourly": new Date(T0 - 40 * 60 * 1000).toISOString(),
      "outreachai_daily_digest": new Date(T0 - 5 * 60 * 60 * 1000).toISOString(),
      "outreachai_warm_areas_daily": new Date(T0 - 6 * 60 * 60 * 1000).toISOString(),
      "reputation-nightly": new Date(T0 - 12 * 60 * 60 * 1000).toISOString(),
    };
    const freshRuns = () =>
      (Object.keys({ ...allHealthy, "health-hourly": null }) as string[]).map((jobname) => ({
        jobname,
        last_success: allHealthy[jobname] ?? null,
        last_start: allHealthy[jobname] ?? null,
      }));
    assert(cronProblems(freshRuns(), T0).length === 0, "A11 brand-new cron (never fired) => OK until first fire");

    // attempted but never succeeded IS a problem
    const attempted = cronProblems(
      freshRuns().map((r) =>
        r.jobname === "health-hourly"
          ? { ...r, last_success: null, last_start: new Date(T0 - 3600_000).toISOString() }
          : r,
      ),
      T0,
    );
    assert(attempted.some((p) => p.key === "cron:health-hourly" && p.body.includes("never succeeded")), "A12 attempted-but-never-succeeded => stale");
  }

  // unscheduled entirely = missing = insta-alert even if it just re-appeared with no history
  const afterReschedule = cronProblems(
    [{ jobname: "outreachai_send_worker_hourly", last_success: null, last_start: null }],
    T0,
  );
  assert(afterReschedule.some((p) => p.key === "cron:learning-hourly"), "A13 missing expected jobs still flagged");

  // ---- OUTCOME-FIRST: run-marker evidence (Stage 9 hardening) ----
  // Fixtures mirror the real health_cron_evidence() RPC shape:
  //   last_run_event      = event NAME string (informational)
  //   last_run_event_at   = ISO timestamp of last confirmed execution
  // M1: execution marker fresh even when DISPATCH looks stale -> OK.
  //     (Outcome wins: the function provably ran; pg_cron detail gaps are noise.)
  const m1 = cronProblems(
    [{ jobname: "cost-sweep", last_success: new Date(T0 - 3 * 60 * 60 * 1000).toISOString(), last_start: new Date(T0 - 3 * 60 * 60 * 1000).toISOString(), last_run_event: "cost.sweep.run", last_run_event_at: new Date(T0 - 4 * 60 * 1000).toISOString() }],
    T0,
  );
  assert(!m1.some((p) => p.key === "cron:cost-sweep"), "M1 fresh execution marker => OK despite old dispatch ledger");

  // M2: THE blind spot — dispatch fresh ("succeeded") but execution marker stale
  //     => RED even though pg_cron/job_run_details still looks healthy.
  const m2 = cronProblems(
    [{ jobname: "cost-sweep", last_success: new Date(T0 - 4 * 60 * 1000).toISOString(), last_start: new Date(T0 - 4 * 60 * 1000).toISOString(), last_run_event: "cost.sweep.run", last_run_event_at: new Date(T0 - 31 * 60 * 1000).toISOString() }],
    T0,
  );
  assert(m2.some((p) => p.key === "cron:cost-sweep" && p.body.includes("confirmed execution")), "M2 stale marker + fresh dispatch => RED (the 09-09 failure mode)");

  // M3: marker stale + dispatch YESTERDAY-stale => RED too (both paths agree).
  const m3 = cronProblems(
    [{ jobname: "reputation-nightly", last_success: new Date(T0 - 60 * 60 * 1000).toISOString(), last_start: new Date(T0 - 60 * 60 * 1000).toISOString(), last_run_event: "health.report.run", last_run_event_at: new Date(T0 - 3 * 86400 * 1000).toISOString() }],
    T0,
  );
  assert(m3.some((p) => p.key === "cron:reputation-nightly"), "M3 stale marker => RED regardless of dispatch");

  // M4: no marker yet + fresh dispatch => OK during rollout (fallback path).
  const m4 = cronProblems(
    [{ jobname: "outreachai_daily_digest", last_success: new Date(T0 - 12 * 60 * 60 * 1000).toISOString(), last_start: new Date(T0 - 12 * 60 * 60 * 1000).toISOString(), last_run_event: "digest.run", last_run_event_at: null }],
    T0,
  );
  assert(!m4.some((p) => p.key === "cron:outreachai_daily_digest"), "M4 no marker yet, fresh dispatch => OK (pre-rollout fallback)");

  // M5: no marker + dispatch stale => still RED via fallback (legacy behavior intact).
  const m5 = cronProblems(
    [{ jobname: "outreachai_daily_digest", last_success: new Date(T0 - 4 * 86400 * 1000).toISOString(), last_start: new Date(T0 - 4 * 86400 * 1000).toISOString(), last_run_event: "digest.run", last_run_event_at: null }],
    T0,
  );
  assert(m5.some((p) => p.key === "cron:outreachai_daily_digest"), "M5 no marker + dispatch stale => RED (fallback preserved)");
}

console.log("BLOCK B — send_queue age (2x-cadence, no false alarm on hourly worker)");
{
  assert(PENDING_STALE_MS === 2 * 60 * 60 * 1000, "B1 pending limit is exactly 2h");
  assert(PROCESSING_ORPHAN_MS === 15 * 60 * 1000, "B2 orphan claim limit is 15m");
  assert(STALE_FLOOR_MIN === 30, "B3 staleness floor is 30m");

  assert(queueProblems({ pendingMax: new Date(T0 - 60 * 60 * 1000).toISOString(), nowMs: T0 }).length === 0, "B4 1h-old pending (hourly worker) => NO alarm");
  assert(queueProblems({ pendingMax: new Date(T0 - 2 * 60 * 60 * 1000 - 60000).toISOString(), nowMs: T0 }).some((p) => p.key === "queue:pending"), "B5 2h+ old pending => alarm");

  assert(queueProblems({ processingMax: new Date(T0 - 14 * 60 * 1000).toISOString(), nowMs: T0 }).length === 0, "B6 14m processing => ok");
  assert(queueProblems({ processingMax: new Date(T0 - 16 * 60 * 1000).toISOString(), nowMs: T0 }).some((p) => p.key === "queue:orphan"), "B7 16m processing => orphan alarm");

  assert(queueProblems({ nowMs: T0 }).length === 0, "B8 empty queue => ok");
}

console.log("BLOCK C — cost drift epsilon");
{
  assert(driftProblems([{ profile_id: "u1", window_date: "2026-09-10", window_month: "2026-09", used_daily_usd: 0.004, used_monthly_usd: 0.01 }], { u1: { daily: 0.004, monthly: 0.01 } }).length === 0, "C1 exact/within epsilon => ok");
  assert(driftProblems([{ profile_id: "u1", window_date: "2026-09-10", window_month: "2026-09", used_daily_usd: 0.004, used_monthly_usd: 0.01 }], { u1: { daily: 0.02, monthly: 0.01 } }).some((p) => p.key === "costdrift:u1"), "C2 daily over epsilon => alarm");
  assert(driftProblems([{ profile_id: "u1", window_date: "2026-09-10", window_month: "2026-09", used_daily_usd: 0.01, used_monthly_usd: 0.004 }], { u1: { daily: 0.01, monthly: 0.06 } }).some((p) => p.key === "costdrift:u1"), "C3 monthly over epsilon => alarm");
  assert(driftProblems([{ profile_id: "u1", window_date: "2026-09-10", window_month: "2026-09", used_daily_usd: 0.01, used_monthly_usd: 0.01 }], {}).length === 0, "C4 no matching profile => ok");
}

console.log("BLOCK D — dedup/cooldown state machine");
{
  const P: HealthProblem = { key: "cron:x", title: "Cron quiet: x", body: "x is quiet." };
  const P2: HealthProblem = { key: "queue:pending", title: "Stalled", body: "stalled." };

  // D1: new episode -> initial alert, count=1, active episode starts
  const r1 = evaluateHealth([P], {}, T0_iso(T0), 86400_000);
  assert(r1.decisions.length === 1 && r1.decisions[0].alert === "initial", "D1.1 new problem alerts (initial)");
  const s1 = r1.decisions[0].state;
  assert(s1.alert_count === 1 && !s1.resolved_at && s1.active_since === s1.last_alerted_at, "D1.2 state: count=1, active, no resolve");
  assert(r1.resolveKeys.length === 0, "D1.3 nothing to resolve");
  assert(alertBody(P, s1.alert_count).endsWith("[alert #1]"), "D1.4 body carries episode count");

  // D2: rerun 59m later, still broken -> SILENT (no re-alert), last_seen advances
  const T2 = T0 + 59 * 60 * 1000;
  const r2 = evaluateHealth([P], { "cron:x": s1 }, T0_iso(T2), 86400_000);
  assert(r2.decisions[0].alert === null, "D2.1 continuously-broken => no re-alert");
  assert(r2.decisions[0].state.last_seen_at === T0_iso(T2) && r2.decisions[0].state.alert_count === 1, "D2.2 only last_seen advances, count stays 1");

  // D3: 24h escalation fires ONCE
  const T3 = T0 + 25 * 60 * 60 * 1000;
  const r3 = evaluateHealth([P], { "cron:x": r2.decisions[0].state }, T0_iso(T3), 86400_000);
  assert(r3.decisions[0].alert === "escalation", "D3.1 24h later => one escalation");
  assert(r3.decisions[0].state.escalated_at === T0_iso(T3) && r3.decisions[0].state.alert_count === 2, "D3.2 escalated_at set, count=2");
  assert(alertTitle(P, "escalation") === "Cron quiet: x — still failing", "D3.3 escalation title distinct");

  // D4: a further hour -> silence again (no third alert ever while active)
  const T4 = T0 + 26 * 60 * 60 * 1000;
  const r4 = evaluateHealth([P], { "cron:x": r3.decisions[0].state }, T0_iso(T4), 86400_000);
  assert(r4.decisions[0].alert === null, "D4.1 after escalation => silence again");

  // D5: clears -> resolved, but a bare rerun keeps it resolved
  const T5 = T0 + 26 * 60 * 60 * 1000 + 1000;
  const r5 = evaluateHealth([], { "cron:x": r4.decisions[0].state }, T0_iso(T5), 86400_000);
  assert(r5.resolveKeys.includes("cron:x"), "D5.1 clear => resolve key returned");

  // D6: recurrence after resolve -> NEW alert (new episode, count rolls forward)
  const T6 = T0 + 27 * 60 * 60 * 1000;
  const resolvedState: HealthState = { ...r4.decisions[0].state, resolved_at: T0_iso(T5) };
  const r6 = evaluateHealth([P], { "cron:x": resolvedState }, T0_iso(T6), 86400_000);
  assert(r6.decisions[0].alert === "initial", "D6.1 resolved-then-recurring => re-alerts");
  assert(r6.decisions[0].state.alert_count === 3 && r6.decisions[0].state.escalated_at === null && !r6.decisions[0].state.resolved_at, "D6.2 count=3, escalation reset, new active episode");

  // D7: independent problems resolve independently
  const both = evaluateHealth([P, P2], {}, T0_iso(T0), 86400_000);
  assert(both.decisions.length === 2 && both.decisions.every((d) => d.alert === "initial"), "D7.1 two independent problems alert together");
  const onlyQueue = evaluateHealth([P2], Object.fromEntries(both.decisions.map((d) => [d.state.check_key, d.state])), T0_iso(T0 + 1000), 86400_000);
  assert(onlyQueue.resolveKeys.includes("cron:x") && !onlyQueue.resolveKeys.includes("queue:pending"), "D7.2 resolving one leaves the other active");

  // D8: healthy run with no prior state -> nothing at all
  const r8 = evaluateHealth([], {}, T0_iso(T0), 86400_000);
  assert(r8.decisions.length === 0 && r8.resolveKeys.length === 0, "D8 healthy baseline => zero alerts, zero resolves");
}

function T0_iso(ms: number) {
  return new Date(ms).toISOString();
}

console.log("BLOCK E — dead-man's switch ping");
{
  const { createServer } = await import("node:http");
  const hits: string[] = [];
  const server = createServer((req, res) => {
    hits.push(req.url ?? "");
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("OK");
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}/ping`;

  const ok = await pingDeadMan(base, false);
  assert(ok && hits[hits.length - 1] === "/ping", "E1 success ping hits base URL");

  const fail = await pingDeadMan(base, true);
  assert(fail && hits[hits.length - 1] === "/ping/fail", "E2 crash ping hits /fail URL");

  const none = await pingDeadMan(undefined, false);
  assert(none === true && hits.length === 2, "E3 no URL configured => skip, still healthy");

  const silent = createServer((_req, _res) => { /* never responds */ });
  await new Promise((r) => silent.listen(0, "127.0.0.1", r));
  const slowStart = Date.now();
  const slow = await pingDeadMan(`http://127.0.0.1:${silent.address().port}/`, false, 80);
  assert(slow === false && Date.now() - slowStart < 1000, "E4 timeout/abort => returns false (never blocks the check)");
  silent.close();
  server.close();
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("Failures: " + failures.join("; "));
  // make sure a stray iso check never passes live: assert these string types
  assert(isIso(T0_iso(T0)), "zz never-run sanity");
  process.exit(1);
}
process.exit(0);