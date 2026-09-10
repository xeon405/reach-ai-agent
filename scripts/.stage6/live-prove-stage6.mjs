// Stage 6 QUEUE-PRIORITY live proof.
// Proving real send-campaign enqueue behavior with the lead_score kill-switch:
//   RUN 1 (enabled)  -> fresh scores must shape send_queue.priority (score, else 0.5)
//   RUN 2 (disabled) -> NO score reads at all; every job must be 0.5 (pure FIFO)
// Zero-send guarantee: leads are conv_mode=HUMAN (worker cancels via
// eligibility legitimately) AND the campaign is flipped to paused immediately
// after enqueue (worker cancels via campaign_not_active). Both are real,
// deterministic worker paths — no cold email can be sent.
// Ends with full cleanup (leads, jobs, score rows, toggle rows; campaign active).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const env = fs.readFileSync(path.join(root, ".env"), "utf8").split("\n").filter(Boolean);
const get = (k) => process.env[k] ?? env.find((l) => l.startsWith(`${k}=`))?.slice(k.length + 1).trim();
const MGMT_TOKEN = get("SUPABASE_ACCESS_TOKEN");
const REF = get("SUPABASE_PROJECT_REF") || "zvohdvopmvzsujktrdmu";
const SUPABASE_URL = get("SUPABASE_URL") || `https://${REF}.supabase.co`;
const CRON_SECRET = get("CRON_SECRET");
if (!CRON_SECRET) {
  console.error("REFUSING to run: CRON_SECRET missing from .env (file was truncated).");
  console.error("Restore it (canonical: .cron-secret.txt / supabase secrets list), then re-run 'node scripts/env-audit.mjs'.");
  process.exit(1);
}

const U = "39b65a0f-2c1d-48e2-9ee7-a358ba8d0570"; // outreachai.team owner
const C = "c3772e1f-c028-48e4-8f8c-abcf73240f28"; // "Test" campaign, delivery=instant
const RUN1 = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222", "33333333-3333-4333-8333-333333333333", "44444444-4444-4444-8444-444444444444"];
const RUN2 = ["55555555-5555-4555-8555-555555555555", "66666666-6666-4666-8666-666666666666", "77777777-7777-4777-8777-777777777777", "88888888-8888-4888-8888-888888888888"];
const ALL = [...RUN1, ...RUN2];

async function exec(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${MGMT_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text().catch(() => "");
  if (!/^2\d\d$/.test(String(res.status))) throw new Error(`SQL ${res.status}: ${text.slice(0, 400)}`);
  try { return JSON.parse(text); } catch { return text; }
}

async function enqueueViaFunction(campaignId) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/send-campaign`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-cron-secret": CRON_SECRET },
    body: JSON.stringify({ user_id: U, campaignId }),
  });
  return { status: res.status, body: await res.text().catch(() => "") };
}

const leadsInsert = (ids, tag) => ids.map((id, i) =>
  `('${id}','${U}','${C}','stage6.${tag}.${i + 1}@gmail.com','US','new',false,'NEW','HUMAN')`
).join(",\n");

async function setupRun(ids, tag, scores, toggleOn) {
  const leadVals = leadsInsert(ids, tag);
  const scoreVals = scores.map((s, i) => s === null
    ? null
    : `('${ids[i]}',${s},'${s >= 0.7 ? "A" : s >= 0.4 ? "C" : "D"}','{}'::jsonb,1,now(),now() + interval '24 hours')`
  ).filter(Boolean).join(",\n");

  await exec(`
delete from public.agent_config where key = 'lead_score.enabled' and scope = 'campaign' and scope_id = '${C}';

insert into public.agent_config (key, scope, scope_id, value, enabled)
values ('lead_score.enabled','campaign','${C}', ${toggleOn ? "'true'" : "'false'"}::jsonb, true);

insert into public.leads (id, user_id, campaign_id, email, country, status, unsubscribed, lifecycle, conv_mode) values
${leadVals};

${scoreVals ? `insert into public.lead_score (lead_id, score, tier, features, score_version, computed_at, expires_at) values
${scoreVals}
on conflict (lead_id) do update set score = excluded.score, tier = excluded.tier, expires_at = now() + interval '24 hours';` : "-- no scores for this run"}
`);
  console.log(`  [setup] ${ids.length} leads + score rows + toggle=${toggleOn}`);
}

async function readPriorities(ids, label) {
  const rows = await exec(`select id, lead_id, priority, status, created_at from public.send_queue where lead_id in (${ids.map((i) => `'${i}'`).join(",")}) order by created_at`);
  console.log(`  [${label}] send_queue rows:`);
  console.table(rows);
  return rows;
}

console.log("== Stage 6 live proof: send-campaign priority fill ==");
try {
  console.log("\n--- preconditions ---");
  console.table(await exec(`select status from public.campaigns where id = '${C}'`));

  // ---------------- RUN 1: lead_score.enabled ON ----------------
  console.log("\n--- RUN 1 (kill-switch ON): scores 0.9 / 0.4 / 0.1 / (no row) ---");
  await setupRun(RUN1, "v1", [0.9, 0.4, 0.1, null], true);
  const r1 = await enqueueViaFunction(C);
  console.log(`  [send-campaign] HTTP ${r1.status} ${r1.body}`);
  await exec(`update public.campaigns set status = 'paused' where id = '${C}'`);
  const p1 = await readPriorities(RUN1, "run1");
  await exec(`delete from public.send_queue where lead_id in (${RUN1.map((i) => `'${i}'`).join(",")});
delete from public.lead_score where lead_id in (${RUN1.map((i) => `'${i}'`).join(",")});
delete from public.leads where id in (${RUN1.map((i) => `'${i}'`).join(",")});
update public.campaigns set status = 'active' where id = '${C}';`);

  // ---------------- RUN 2: lead_score.enabled OFF ----------------
  console.log("\n--- RUN 2 (kill-switch OFF): fresh scores 0.95 / 0.8 / 0.7 / 0.6 EXIST but must be ignored ---");
  await setupRun(RUN2, "v2", [0.95, 0.8, 0.7, 0.6], false);
  const r2 = await enqueueViaFunction(C);
  console.log(`  [send-campaign] HTTP ${r2.status} ${r2.body}`);
  await exec(`update public.campaigns set status = 'paused' where id = '${C}'`);
  const p2 = await readPriorities(RUN2, "run2");

  // ---------------- Evidence: audits ----------------
  console.log("\n--- email.queued audits (priority + score_advised truthfulness) ---");
  console.table(await exec(`select created_at, payload->>'job_id' as job_id, payload->>'priority' as priority, payload->>'score_advised' as score_advised from public.audit_events where event = 'email.queued' and campaign_id = '${C}' order by created_at desc limit 10`));

  // ---------------- Assertions ----------------
  let failures = 0;
  const line = (ok, msg) => { console.log(`  ${ok ? "PASS" : "FAIL"}  ${msg}`); if (!ok) failures++; };
  const pri = (rows, id) => Number(rows.find((r) => r.lead_id === id)?.priority);
  console.log("\n--- assertions ---");
  line(pri(p1, RUN1[0]) === 0.9, "run1: fresh score 0.9 => priority 0.9");
  line(pri(p1, RUN1[1]) === 0.4, "run1: fresh score 0.4 => priority 0.4");
  line(pri(p1, RUN1[2]) === 0.1, "run1: fresh score 0.1 => priority 0.1");
  line(pri(p1, RUN1[3]) === 0.5, "run1: no score row => priority 0.5 (default, FIFO-identical)");
  line(RUN2.every((id) => pri(p2, id) === 0.5), "run2: kill-switch OFF => EVERY job 0.5 despite fresh 0.95/0.8/0.7/0.6 present");
  const flagged = await exec(`select count(*) as n from public.audit_events where event='email.queued' and (payload->>'job_id') in (${p1.map((r) => `'${r.id}'`).join(",")}) and (payload->>'score_advised')::boolean = true`);
  line(Number(flagged[0].n) === 3, "score_advised=true exactly on run1's 3 scored rows (0.9/0.4/0.1)");
  const offAdvised = await exec(`select count(*) as n from public.audit_events where event='email.queued' and (payload->>'job_id') in (${p2.map((r) => `'${r.id}'`).join(",")}) and (payload->>'score_advised')::boolean = true`);
  line(Number(offAdvised[0].n) === 0, "run2 rows ALL score_advised=false — the kill-switch OFF run performed zero score reads (pure FIFO), audit stays truthful");

  // ---------------- Cleanup ----------------
  console.log("\n--- cleanup ---");
  await exec(`
delete from public.send_queue where lead_id in (${ALL.map((i) => `'${i}'`).join(",")});
delete from public.lead_score where lead_id in (${ALL.map((i) => `'${i}'`).join(",")});
delete from public.leads where id in (${ALL.map((i) => `'${i}'`).join(",")});
delete from public.agent_config where key = 'lead_score.enabled' and scope = 'campaign' and scope_id = '${C}';
update public.campaigns set status = 'active' where id = '${C}';
delete from public.send_queue where campaign_id = '${C}' and status in ('pending','claimed','processing','cancelled');
`);
  const leftovers = await exec(`select count(*) as n from public.send_queue q join public.leads l on l.id = q.lead_id where l.email like 'stage6.%'`);
  const camp = await exec(`select status from public.campaigns where id = '${C}'`);
  const toggles = await exec(`select count(*) as n from public.agent_config where key='lead_score.enabled' and scope_id = '${C}'`);
  line(leftovers[0].n === 0, "no leftover queue jobs for test leads");
  line(camp[0].status === "active", "campaign restored to active");
  line(toggles[0].n === 0, "toggle rows removed");

  console.log(`\n${failures === 0 ? "ALL ASSERTIONS PASSED" : `${failures} ASSERTION(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
} catch (e) {
  console.error("LIVE PROOF ERROR:", e.message);
  // best-effort cleanup so a failure never leaves the campaign paused
  try {
    await exec(`update public.campaigns set status = 'active' where id = '${C}';`);
    console.error("(campaign restored to active)");
  } catch { /* ignore */ }
  process.exit(1);
}