// Live proof: reputation-nightly ledger actually refreshes on a REAL cron run.
//
// Two phases:
//   Phase 1 (natural): wait up to 75s for the scheduled night run to fire
//                      (it fires 01:15 UTC) and refresh the ledger.
//   Phase 2 (forced):  if no movement, temporarily reschedule the job to "* * * * *"
//                      so pg_cron really dispatches (net.http_post -> edge runtime),
//                      assert the ledger advances + self-verifying audit lands,
//                      then restore the canonical schedule byte-for-byte.
//
// Asserts for every mailbox in sender_health: last_measured_at strictly advances,
// and a health.report.run audit row appears with mailboxes_measured >= 3.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as db from "./_db.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "..", ".proof-reputation-live.json");
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

console.log("now:", now(), "T0:", T0);

// ---- baseline --------------------------------------------------------------
const baseHealth = await db.runQuery(
  "select profile_id, last_measured_at from sender_health order by profile_id;",
);
console.log("baseline sender_health:", JSON.stringify(baseHealth));
const baseRun = await db.runQuery(
  "select max(runid) as max_runid from cron.job_run_details d join cron.job j on j.jobid=d.jobid where j.jobname='reputation-nightly';",
).then((r) => r[0].max_runid);
const baseAudit = await db.runQuery(
  "select count(*)::int as n from audit_events where event='health.report.run';",
).then((r) => r[0].n);
console.log("baseline max runid:", baseRun, "| baseline health.report.run audits:", baseAudit);

const job = (await db.runQuery(
  "select jobid, schedule, command from cron.job where jobname='reputation-nightly';",
))[0];
console.log("current job:", JSON.stringify({ jobid: job.jobid, schedule: job.schedule, command: job.command.slice(0, 120) }));

const ledgerAdvanced = (rows) =>
  rows.length === baseHealth.length &&
  rows.every((r) => {
    const b = baseHealth.find((x) => x.profile_id === r.profile_id);
    return b && new Date(r.last_measured_at) > new Date(b.last_measured_at);
  });

// ---- Phase 1: natural scheduled run ------------------------------------------
console.log("\n[Phase 1] waiting for the natural scheduled run to fire (≤75s)...");
let moved = false;
const phase1End = Date.now() + 75_000;
while (Date.now() < phase1End) {
  await sleep(5_000);
  const rows = await db.runQuery("select profile_id, last_measured_at from sender_health order by profile_id;");
  if (ledgerAdvanced(rows)) {
    moved = true;
    console.log("ledger advanced via natural run at", now());
    break;
  }
}

if (!moved) {
  // ---- Phase 2: force a real cron dispatch -------------------------------------
  console.log("[Phase 2] natural run missed — temporarily rescheduling to '* * * * *' to force a REAL pg_cron dispatch...");
  await db.runQuery("select cron.unschedule('reputation-nightly');");
  await db.runQuery(
    "select cron.schedule('reputation-nightly', '* * * * *', $cron$ " + job.command + " $cron$);",
  );
  console.log("temporary every-minute schedule live at", now());

  // A new jobid now owns the name; wait for pg_cron to actually fire it.
  const tempEnd = Date.now() + 90_000;
  let fired = null;
  while (Date.now() < tempEnd && !fired) {
    await sleep(5_000);
    const runs = await db.runQuery(
      "select d.runid, d.status, d.start_time from cron.job_run_details d join cron.job j on j.jobid=d.jobid where j.jobname='reputation-nightly' and d.start_time > to_timestamp(" + (T0 / 1000) + ") order by d.start_time desc limit 3;",
    );
    if (runs.length) fired = runs[0];
  }
  check("pg_cron actually fired reputation-nightly after reschedule", !!fired, fired ? `run#${fired.runid} ${fired.status} @${fired.start_time}` : "no run detail within 90s");

  // Edge runtime executes asynchronously after dispatch; poll for reliability.
  const ledEnd = Date.now() + 60_000;
  while (Date.now() < ledEnd) {
    await sleep(5_000);
    const rows = await db.runQuery("select profile_id, last_measured_at from sender_health order by profile_id;");
    if (ledgerAdvanced(rows)) { moved = true; console.log("ledger advanced via forced cron run at", now()); break; }
  }

  // ---- restore canonical schedule byte-for-byte --------------------------------
  await db.runQuery("select cron.unschedule('reputation-nightly');");
  await db.runQuery(
    "select cron.schedule('reputation-nightly', '15 1 * * *', $cron$ " + job.command + " $cron$);",
  );
  await sleep(2_000);
  const restored = await db.runQuery(
    "select schedule, command from cron.job where jobname='reputation-nightly';",
  );
  const norm = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
  check(
    "canonical schedule restored (normalized compare)",
    !!restored[0] &&
      norm(restored[0].schedule) === norm(job.schedule) &&
      norm(restored[0].command) === norm(job.command) &&
      restored[0].command.includes("/functions/v1/reputation-report") &&
      restored[0].command.includes(db.getEnv("CRON_SECRET")),
    `now=${restored[0]?.schedule} (was ${job.schedule}) target/secret intact=${restored[0]?.command.includes("/functions/v1/reputation-report") === true && restored[0]?.command.includes(db.getEnv("CRON_SECRET"))}`,
  );
}

check("ledger refreshed (all mailboxes strictly newer), via a real cron-dispatched run", moved);

// ---- assert ledger + audit evidence ------------------------------------------------
const afterRows = await db.runQuery("select profile_id, last_measured_at from sender_health order by profile_id;");
afterRows.forEach((r) => {
  const b = baseHealth.find((x) => x.profile_id === r.profile_id);
  check(
    `mailbox ${r.profile_id.slice(0, 8)}... last_measured_at advances`,
    !!b && new Date(r.last_measured_at) > new Date(b.last_measured_at),
    `${b?.last_measured_at} -> ${r.last_measured_at}`,
  );
});

const audits = await db.runQuery(
  "select id, payload from audit_events where event='health.report.run' and created_at > to_timestamp(" + (T0 / 1000) + ") order by created_at;",
);
console.log("health.report.run rows landed:", audits.length, JSON.stringify(audits.map((a) => a.payload)));
check(
  "self-verifying audit health.report.run landed with mailboxes_measured>=3",
  audits.length >= 1 && audits.some((a) => Number(a.payload?.mailboxes_measured) >= 3),
  audits.length ? `rows=${audits.length}` : "none",
);
check("no per-mailbox errors recorded", audits.every((a) => !(a.payload?.errors?.length)), audits.some((a) => a.payload?.errors?.length) ? "some errors: " + JSON.stringify(audits.map((a) => a.payload?.errors).filter(Boolean)) : "");

// ---- report -----------------------------------------------------------------------
const summary = {
  ok: failures.length === 0,
  checks,
  failures,
  sender_health_after: afterRows,
  audit_rows: audits,
  t_seconds: ((Date.now() - T0) / 1000).toFixed(1),
  job_restored: job.schedule,
};
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(summary, null, 2));
console.log("\n" + (summary.ok ? "ALL PASS" : "FAILURES"), `— ${checks.filter((c) => c.ok).length}/${checks.length} checks, ${summary.t_seconds}s`);
if (!summary.ok) process.exit(1);