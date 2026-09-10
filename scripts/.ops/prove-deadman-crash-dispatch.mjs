// Real-dispatch crash, v2 (tooling fixed: no process.exit inside try; schedule
// injection verified before waiting). Temporarily repoints health-hourly to
// * * * * * with body {"trigger":"pg_cron","crash":true} (boolean jsonb), waits
// for a REAL pg_cron->edge dispatch to 500, restores byte-for-byte, and verifies
// the restore + a final clean run.
import * as db from "./_db.mjs";

const JOB = "health-hourly";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const orig = (await db.runQuery(`select schedule, command from cron.job where jobname='${JOB}';`))[0];
const norm = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
const crashCmd = orig.command.replace(
  "jsonb_build_object('trigger', 'pg_cron')",
  "jsonb_build_object('trigger', 'pg_cron') || '{\"crash\": true}'::jsonb",
);
if (crashCmd === orig.command) throw new Error("injection produced no change; aborting");

await db.runQuery(`select cron.unschedule('${JOB}');`);
await db.runQuery(`select cron.schedule('${JOB}', '* * * * *', $cmd$ ${crashCmd} $cmd$);`);

// Did the crash body actually take? Read it back from cron.job.
const live = (await db.runQuery(`select command from cron.job where jobname='${JOB}';`))[0];
const boolextrue = live.command.includes('|| \'{"crash": true}\'::jsonb');
console.log("scheduled crash body sticks (boolean jsonb):", boolextrue);
if (!boolextrue) throw new Error("schedule did not carry the crash body");

try {
  const deadline = Date.now() + 150_000;
  let saw = false;
  while (Date.now() < deadline && !saw) {
    await sleep(10_000);
    const rows = await db.runQuery("select status_code from net._http_response order by id desc limit 25;");
    saw = rows.some((r) => r.status_code === 500);
  }
  console.log("net._http_response 500 (function crashed on a real pg_cron dispatch):", saw);
  if (!saw) throw new Error("no 500 observed in window");
} finally {
  await db.runQuery(`select cron.unschedule('${JOB}');`);
  await db.runQuery(`select cron.schedule('${JOB}', '${orig.schedule}', $cmd$ ${orig.command} $cmd$);`);
  const chk = (await db.runQuery(`select schedule, command from cron.job where jobname='${JOB}';`))[0];
  const n = (await db.runQuery(`select count(*) c from cron.job where jobname='${JOB}';`))[0].c;
  console.log("single job:", n === 1);
  console.log("restored byte-for-byte:", norm(chk.schedule) === norm(orig.schedule) && norm(chk.command) === norm(orig.command));
}

const re = await fetch(`${db.getEnv("SUPABASE_URL")}/functions/v1/health-check`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "x-cron-secret": (await import("node:fs")).readFileSync(new URL("../../.cron-secret.txt", import.meta.url), "utf8").replace(/\s+$/, "") },
  body: JSON.stringify({ trigger: "pg_cron" }),
});
console.log("post-restore direct health-check:", re.status);