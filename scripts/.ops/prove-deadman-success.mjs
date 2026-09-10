// Live proof: the dead-man's switch SUCCESS ping lands on healthchecks.io via a
// REAL pg_cron->edge dispatch (not a manual curl). Temporarily reschedules
// health-hourly to * * * * *, waits for the function to run + ping, restores the
// original schedule/command byte-for-byte in finally. ping_ok=true in the
// health.run audit means fetch(<ping-url>) returned 2xx (hc-ping 200 for a valid
// check UUID; a bogus UUID would 404 => ping_ok=false).
import { readFileSync } from "node:fs";
import * as db from "./_db.mjs";

const JOB = "health-hourly";
const T0 = Date.now();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const orig = (await db.runQuery(`select jobname, schedule, command from cron.job where jobname='${JOB}';`))[0];
console.log("original:", JSON.stringify({ schedule: orig.schedule, command: orig.command.slice(0, 160) }));

await db.runQuery(`select cron.unschedule('${JOB}');`);
await db.runQuery(`select cron.schedule('${JOB}', '* * * * *', $cmd$ ${orig.command} $cmd$);`);

try {
  let found = null;
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline && !found) {
    await sleep(10_000);
    const rows = await db.runQuery(
      "select payload, created_at from audit_events where event='health.run' and (payload->>'run_at')::timestamptz > to_timestamp(" + T0 / 1000 + ") order by created_at desc limit 3;",
    );
    if (rows.length) found = rows[0];
  }
  if (!found) {
    console.log("FAIL: no health.run audit landed during forced dispatch window");
    process.exit(1);
  }
  console.log("health.run after forced dispatch:", JSON.stringify(found.payload), "at", found.created_at);
  const ok = found.payload && found.payload.ping_ok === true;
  console.log(ok ? "SUCCESS-PING PROVEN (hc-ping returned 2xx to the GET)" : "FAIL: ping_ok was not true");
  if (!ok) process.exit(1);
} finally {
  await db.runQuery(`select cron.unschedule('${JOB}');`);
  await db.runQuery(`select cron.schedule('${JOB}', '${orig.schedule}', $cmd$ ${orig.command} $cmd$);`);
}
const restored = (await db.runQuery(`select schedule, command from cron.job where jobname='${JOB}';`))[0];
const norm = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
const back = norm(restored.schedule) === norm(orig.schedule) && norm(restored.command) === norm(orig.command);
console.log("schedule restored byte-for-byte:", back, `(schedule=${restored.schedule})`);