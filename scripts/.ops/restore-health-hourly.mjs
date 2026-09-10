// Restore health-hourly to its canonical original: drop the injected crash key,
// reschedule hourly. Must match the pre-test command (verified by body line
// equality + no crash key + schedule '0 * * * *').
import * as db from "./_db.mjs";

const cur = (await db.runQuery(`select schedule, command from cron.job where jobname='health-hourly';`))[0];
const hasCrashMarker = (s) => String(s).includes("crash");
console.log("before restore — crash key present:", hasCrashMarker(cur.command));

await db.runQuery(`select cron.unschedule('health-hourly');`);
const orig = String(cur.command).replace(`, 'crash', 'true'`, "");
await db.runQuery(`select cron.schedule('health-hourly', '0 * * * *', $cmd$ ${orig} $cmd$);`);

const chk = (await db.runQuery(`select schedule, command from cron.job where jobname='health-hourly';`))[0];
const clean = chk.schedule === "0 * * * *" && !hasCrashMarker(chk.command) &&
  chk.command.includes("body := jsonb_build_object('trigger', 'pg_cron')");
console.log("schedule:", chk.schedule);
console.log("clean body (original) & schema restored:", clean);
if (!clean) process.exit(1);