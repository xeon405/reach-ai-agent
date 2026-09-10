// Live proof: the cron probe now judges OUTCOME (run-marker audit) first, not
// pg_cron dispatch. Replays the exact 09-09 reputation-nightly failure mode on
// push-drainer: the cron STILL dispatches successfully (job_run_details stays
// 'succeeded') while the function body never executes (marker stops advancing).
//
// Sequence:
//   1. repoint push-drainer's cron at a nonexistent function path
//   2. wait until dispatch stays fresh BUT the marker crosses its 30m limit
//   3. health-check -> RED on "confirmed execution stale", alert created
//   4. second health-check -> dedup silent (cooldown, count stays 1)
//   5. restore the original command; next real run writes a fresh marker
//   6. health-check -> resolved, no new alerts
//   7. verify the cron job is restored byte-for-byte
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as db from "./_db.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "..", ".proof-health-cron-marker.json");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const now = () => new Date().toISOString();

const T0 = Date.now();
const failures = [];
const checks = [];
const check = (name, ok, detail = "") => {
  checks.push({ name, ok, detail });
  if (!ok) failures.push(`${name} ${detail}`.trim());
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  (" + detail + ")" : ""}`);
};

const JOB = "outreachai_push_drainer_minutely";
const LIMIT_MS = 30 * 60 * 1000;
const URL_BASE = db.getEnv("SUPABASE_URL");

const cronRows = (name) =>
  db.runQuery(
    "select jobid, schedule, command from cron.job where jobname=$JOB$" + name + "$JOB$;",
  );
const markerOf = () =>
  db.runQuery(
    "select last_run_event, last_run_event_at, last_success, last_start from public.health_cron_evidence() where jobname=$JOB$" + JOB + "$JOB$;",
  );

const job = (await cronRows(JOB))[0];
console.log("now:", now(), "| original:", JSON.stringify({ schedule: job.schedule, command: job.command.trim().slice(0, 120) }));
writeFileSync(".cron-backup.json", JSON.stringify({ schedule: job.schedule, command: job.command }));

// pre-flight: verify the RPC returns the OUTCOME shape the engine consumes
// (last_run_event = event name string, last_run_event_at = ISO timestamp).
const isIso = (s) => typeof s === "string" && !Number.isNaN(new Date(s).getTime());
const pre = (await markerOf())[0];
check(
  "RPC shape: last_run_event is a name + last_run_event_at is an ISO timestamp",
  typeof pre.last_run_event === "string" && isIso(pre.last_run_event_at),
  `event=${pre.last_run_event} at=${pre.last_run_event_at}`,
);

// ---- 1. break EXECUTION only (dispatch keeps 'succeeding') ------------------
const bogusUrl = `${URL_BASE}/functions/v1/__no_such_fn_$cron$`;
await db.runQuery("select cron.unschedule($JOB$" + JOB + "$JOB$);");
await db.runQuery(
  "select cron.schedule($JOB$" + JOB + "$JOB$, '* * * * *', " +
    "$cmd$ select net.http_post(url := '" + bogusUrl +
    "', headers := jsonb_build_object('x-cron-secret', '" + db.getEnv("CRON_SECRET") + "', 'Content-Type', 'application/json'), body := jsonb_build_object('trigger','pg_cron'));$cmd$);",
);
console.log("execution broken: cron now points at", bogusUrl, "at", now());

// capture the frozen marker baseline
const base = await markerOf();
console.log("frozen marker baseline:", base[0]);

// ---- 2. prove dispatch stays 'succeeded' while marker freezes -----------------
let freshDispatchSeen = null;
const dispatchWaitEnd = Date.now() + 150_000;
while (Date.now() < dispatchWaitEnd && !freshDispatchSeen) {
  await sleep(10_000);
  const tb = await markerOf();
  const r = tb[0];
  if (r.last_start && new Date(r.last_start).getTime() > T0) {
    freshDispatchSeen = r.last_start;
    // marker must NOT have advanced since baseline
  }
}
check(
  "dispatch records fresh 'succeeded' runs while execution is broken",
  !!freshDispatchSeen,
  freshDispatchSeen ? `last_start=${freshDispatchSeen}` : "no dispatch within 150s",
);
const frozenCheck = await markerOf();
check(
  "run marker frozen after break (no execution)",
  new Date(frozenCheck[0].last_run_event_at).getTime() <= new Date(base[0].last_run_event_at).getTime() + 5000,
  `marker=${frozenCheck[0].last_run_event_at}`,
);

// ---- 3. wait for marker staleness window (30m) -------------------------------
console.log("waiting for marker to cross the 30m staleness window...");
let waited = 0;
while (waited < LIMIT_MS + 120_000) {
  const m = await markerOf();
  const age = Date.now() - new Date(m[0].last_run_event_at).getTime();
  if (age > LIMIT_MS) { console.log("marker stale by", Math.round(age / 60000), "min at", now()); break; }
  await sleep(30_000);
  waited += 30_000;
}

// ---- 3b. health-check -> RED on stale marker despite fresh dispatch -----------
const hc = async () => {
  const res = await fetch(`${URL_BASE}/functions/v1/health-check`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-cron-secret": db.getEnv("CRON_SECRET") },
    body: JSON.stringify({ trigger: "pg_cron" }),
  });
  return res.json();
};
const b = await hc();
await sleep(3500);
const bPrev = (await markerOf())[0];
// the specific problem key
const pKey = `cron:${JOB}`;
const hasProblem = (problems) => (problems ?? []).includes(pKey);
console.log("first health-check:", JSON.stringify(b));
check("cron probe RED on stale marker via `" + pKey + "`", hasProblem(b.problems));
const attack = await db.runQuery(
  "select count(*)::int as n from owner_alerts where title like '%Cron quiet%' and created_at > to_timestamp(" + (T0 / 1000) + ");",
);
check("owner alert created for the broken-execution episode", attack[0].n >= 1, `alerts=${attack[0].n}`);

// dedup: second run must be SILENT (already active, cooldown)
const b2 = await hc();
await sleep(3500);
check("dedup: second health-check silent (no new alert)", (b2.alerts ?? {})[pKey] === undefined, JSON.stringify(b2.alerts));
const st = await db.runQuery(
  "select check_key, alert_count, escalated_at from health_state where check_key=$K$" + pKey + "$K$;",
);
check("health_state: episode active, alert_count=1, not escalated (24h)", st[0]?.alert_count === 1 && st[0]?.escalated_at === null, JSON.stringify(st[0]));

// ---- 4. restore the ORIGINAL command byte-for-byte ----------------------------
const saved = JSON.parse((await import("node:fs")).readFileSync(".cron-backup.json", "utf8"));
await db.runQuery("select cron.unschedule($JOB$" + JOB + "$JOB$);");
await db.runQuery(
  "select cron.schedule($JOB$" + JOB + "$JOB$, $SCHED$" + saved.schedule + "$SCHED$, $CMD$" + saved.command + "$CMD$);",
);
console.log("restored original command at", now());

// wait for the first REAL run to write a fresh marker
let restoredMarker = null;
const restoreWaitEnd = Date.now() + 150_000;
while (Date.now() < restoreWaitEnd && !restoredMarker) {
  await sleep(10_000);
  const m = await markerOf();
  if (m[0].last_run_event_at && new Date(m[0].last_run_event_at).getTime() > T0 + LIMIT_MS) {
    restoredMarker = m[0].last_run_event_at;
  }
}
check("execution restored: fresh run marker appears", !!restoredMarker, restoredMarker ?? "none");

// ---- 5. health-check -> resolved -------------------------------------------------
const b3 = await hc();
await sleep(3500);
check("episode resolves after restored execution", (b3.resolved ?? []).includes(pKey), JSON.stringify(b3.resolved));
const st2 = await db.runQuery(
  "select check_key, resolved_at from health_state where check_key=$K$" + pKey + "$K$;",
);
check("health_state episode marked resolved", !!st2[0]?.resolved_at, st2[0]?.resolved_at ?? "null");

// ---- 6. verify job restored byte-for-byte -----------------------------------------
const afterJob = (await cronRows(JOB))[0];
check("cron job restored byte-for-byte", afterJob.schedule === saved.schedule && afterJob.command === saved.command);

const summary = {
  ok: failures.length === 0,
  checks,
  failures,
  frozen_marker: base[0].last_run_event_at,
  first_hc: b,
  second_hc: { problems: b2.problems, alerts: b2.alerts, resolved: b2.resolved },
  restore_hc: b3,
  restored_schedule: afterJob.schedule,
  t_seconds: ((Date.now() - T0) / 1000).toFixed(1),
};
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(summary, null, 2));
console.log("\n" + (summary.ok ? "ALL PASS" : "FAILURES"), `— ${checks.filter((c) => c.ok).length}/${checks.length} checks, ${summary.t_seconds}s`);
if (!summary.ok) process.exit(1);