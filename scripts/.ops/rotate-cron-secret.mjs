// Rotate CRON_SECRET: supersedes the literal baked into every pg_cron job.
// pg_cron does NOT read the env var live — each job's command embeds the value
// in its http header. This rewrites every cron.job.command to the new literal
// (unschedule + schedule, since direct UPDATE on cron.job is denied to the
// Management API role), then reports old/new literal counts.
//
// Usage: node scripts/.ops/rotate-cron-secret.mjs
// Requires: .cron-secret.txt containing the NEW value, and the OLD value in $OLD_SECRET.
import { readFileSync } from "node:fs";
import * as db from "./_db.mjs";

const NEW = readFileSync(new URL("../../.cron-secret.txt", import.meta.url), "utf8").replace(/\s+$/, "");
const OLD = process.env.OLD_SECRET;
if (!OLD) throw new Error("OLD_SECRET env required");

const run = (sql) => db.runQuery(sql);

const rows = await run("select jobname, schedule, command from cron.job order by jobname;");
let rewrote = 0;
const orig = new Map(rows.map((r) => [r.jobname, { schedule: r.schedule, command: r.command }]));

for (const r of rows) {
  if (!r.command.includes(OLD)) {
    console.log(`SKIP (no old secret in command): ${r.jobname}`);
    continue;
  }
  const cmdNew = r.command.replaceAll(OLD, NEW);
  await run(`select cron.unschedule('${r.jobname}');`);
  await run(`select cron.schedule('${r.jobname}', '${r.schedule}', $cmd$ ${cmdNew} $cmd$);`);
  rewrote++;
  console.log(`  rewrote ${r.jobname}`);
}

const c = await run(
  `select (select count(*) from cron.job where command like '%${OLD}%') oldn, (select count(*) from cron.job where command like '%${NEW}%') newn;`,
);
console.log(`rewrote ${rewrote}/${rows.length} jobs | old-literal rows: ${c[0].oldn} | new-literal rows: ${c[0].newn}`);
if (c[0].oldn !== 0) process.exit(2);
if (c[0].newn !== rows.length) process.exit(3);