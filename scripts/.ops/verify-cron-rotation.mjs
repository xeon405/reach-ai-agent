// Post-rotation live verification: prove every cron-DISPATCHED function executes
// with the NEW CRON_SECRET (pg_cron literal == function env), via run-marker
// audit freshness (the only rows an executed function body can write).
//
// Natural jobs (already firing at high cadence): push-drainer, inbox-agent, cost-sweep.
// Forced jobs (slow cadence): we reschedule to * * * * * keeping the CURRENT
// (post-rotation) command, wait for one real pg_cron->edge dispatch to land a fresh
// marker, then restore schedule+command byte-for-byte.
//
// Usage: node scripts/.ops/verify-cron-rotation.mjs
import { writeFileSync } from "node:fs";
import { readFileSync } from "node:fs";
import * as db from "./_db.mjs";

const NEW = readFileSync(new URL("../../.cron-secret.txt", import.meta.url), "utf8").replace(/\s+$/, "");
const run = (sql) => db.runQuery(sql);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ROT = new Date(Date.now() - 90_000); // rotation moment (90s grace for clock skew)
const ROT_ISO = ROT.toISOString();
console.log("rotation marker threshold:", ROT_ISO);

// map jobname -> its execution marker event name
const EVENT = {
  "cost-sweep": "cost.sweep.run",
  "health-hourly": "health.run",
  "learning-hourly": "learning.fold",
  "outreachai_daily_digest": "digest.run",
  "outreachai_inbox_agent_hourly": "inbox.run",
  "outreachai_push_drainer_minutely": "push.drain.run",
  "outreachai_send_worker_hourly": "send.worker.run",
  "outreachai_warm_areas_daily": "warm.run",
  "reputation-nightly": "health.report.run",
};

const markers = async () => {
  const r = await run("select jobname, last_run_event, last_run_event_at from public.health_cron_evidence();");
  return new Map(r.map((x) => [x.jobname, x.last_run_event_at]));
};

const results = [];
const record = (job, ok, detail) => {
  results.push({ job, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${job}  (${detail})`);
};

const base = await markers();
for (const [job, ev] of Object.entries(EVENT)) {
  if (!base.has(job)) console.log(`WARN: ${job} not in cron evidence`);
}

// ---- natural-cadence jobs: wait for a fresh marker ----
const NAT = ["outreachai_push_drainer_minutely", "outreachai_inbox_agent_hourly", "cost-sweep"];
const natDeadline = Date.now() + 7 * 60 * 1000;
while (Date.now() < natDeadline) {
  const m = await markers();
  const done = NAT.every((j) => {
    const t = m.get(j);
    return t && new Date(t).getTime() > ROT.getTime();
  });
  if (done) break;
  await sleep(15_000);
}
{
  const m = await markers();
  for (const j of NAT) {
    const t = m.get(j);
    record(j, !!t && new Date(t).getTime() > ROT.getTime(), `marker=${t} (base=${base.get(j)})`);
  }
}

// ---- forced jobs: reschedule to * * * * *, wait for one fresh marker, restore ----
const FORCE = ["health-hourly", "learning-hourly", "outreachai_send_worker_hourly", "reputation-nightly", "outreachai_daily_digest", "outreachai_warm_areas_daily"];
for (const job of FORCE) {
  const orig = (await run(`select jobname, schedule, command from cron.job where jobname='${job}';`))[0];
  let ok = false;
  let markerAfter = null;
  try {
    await run(`select cron.unschedule('${job}');`);
    await run(`select cron.schedule('${job}', '* * * * *', $cmd$ ${orig.command} $cmd$);`);
    const forceDeadline = Date.now() + 95_000;
    while (Date.now() < forceDeadline) {
      const m = await markers();
      markerAfter = m.get(job);
      if (markerAfter && new Date(markerAfter).getTime() > ROT.getTime()) { ok = true; break; }
      await sleep(10_000);
    }
  } finally {
    await run(`select cron.unschedule('${job}');`);
    await run(`select cron.schedule('${job}', '${orig.schedule}', $cmd$ ${orig.command} $cmd$);`);
  }
  record(job, ok, `marker=${markerAfter} (base=${base.get(job)})`);
}

// ---- post-verification: every job still on the new literal ----
const post = await run(
  `select jobname, schedule, command from cron.job order by jobname;`,
);
let allCleaned = true;
for (const r of post) {
  if (!r.command.includes(NEW)) { console.log(`  LEAK: ${r.jobname} command does not contain new literal`); allCleaned = false; }
}
console.log("all post-rotation commands contain NEW literal:", allCleaned);

writeFileSync(new URL("../../.verify-cron-rotation.json", import.meta.url), JSON.stringify({ rotation: ROT_ISO, results, allCleaned }, null, 2));
const failed = results.filter((r) => !r.ok).length;
console.log(`\nRESULT: ${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);