// Stage 7 LIVE-FIRE proof — the gate on real wires, cancel-before-send.
// Device identical to Stage 6's live proof: a real send-campaign enqueue on the
// test campaign + test leads, worker processes it for real, but the send is
// cancelled by a deterministic worker path BEFORE any emails_sent row or Gmail
// contact (SEND_WORKER_DRY_RUN=1 secrets-gated hook, removed after the proof).
//
// Proof bar (user-approved, Stage-5/6 live bar not diff-1 observational bar):
//   RUN 0  control     stable healthy account with existing spend + fresh
//                      heartbeat => gate resolves ai (reason null); an early
//                      real LLM call ALSO proved day-one no_state=>ai already.
//   RUN 1  near-cap    seed a synthetic near-cap reservation on the real test
//                      campaign => gate flips to template; audit carries
//                      gate_mode=template; no ledger row, counter untouched.
//   RUN 1b sweep       cost-sweep: marker row ai_quality.mode=template (+
//                      metering_degraded from the dark-counter drift trip).
//   RUN 2  kill-switch ai_quality.gate_enabled=false => gate bypassed entirely
//                      (gate_mode=ai / gate_disabled) even at near-cap; the
//                      LLM runs => a REAL ledger row is produced (this also
//                      closes the diff-1 meter-fires check with real rows).
//   RUN 3  revert      kill-switch removed => back to daily_pool template.
// Zero-send guarantee: dry-run hook cancels after generation; cleanup restores
// counters/config and deletes all test rows. No cold email can go out.
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
// Value confirmed live on this project (send-worker/send-campaign/cost-sweep authenticate with it).
// Hard-required — a truncated/missing CRON_SECRET must fail loudly, never silently degrade.
const CRON_SECRET = get("CRON_SECRET");
if (!CRON_SECRET) {
  console.error("REFUSING to run: CRON_SECRET missing from .env (file was truncated).");
  console.error("Restore it (canonical: .cron-secret.txt / supabase secrets list), then re-run 'node scripts/env-audit.mjs'.");
  process.exit(1);
}

const U = "39b65a0f-2c1d-48e2-9ee7-a358ba8d0570"; // outreachai.team owner
const C = "c3772e1f-c028-48e4-8f8c-abcf73240f28"; // "Test" campaign, delivery=instant
const LEADS = ["aaaaaaaa-aaaa-4aaa-8aaa-000000000001", "aaaaaaaa-aaaa-4aaa-8aaa-000000000002", "aaaaaaaa-aaaa-4aaa-8aaa-000000000003", "aaaaaaaa-aaaa-4aaa-8aaa-000000000004"];

let failures = 0;
const line = (ok, msg) => { console.log(`  ${ok ? "PASS" : "FAIL"}  ${msg}`); if (!ok) failures++; };

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

async function triggerWorker() {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/send-worker`, {
    method: "POST", headers: { "Content-Type": "application/json", "x-cron-secret": CRON_SECRET },
  });
  return { status: res.status, body: (await res.text().catch(() => "")).slice(0, 300) };
}

async function triggerSweep() {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/cost-sweep`, {
    method: "POST", headers: { "Content-Type": "application/json", "x-cron-secret": CRON_SECRET },
  });
  return { status: res.status, body: (await res.text().catch(() => "")).slice(0, 300) };
}

async function enqueue() {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/send-campaign`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-cron-secret": CRON_SECRET },
    body: JSON.stringify({ user_id: U, campaignId: C }),
  });
  return { status: res.status, body: (await res.text().catch(() => "")).slice(0, 200) };
}

const insertLead = (id, tag, i) => exec(`insert into public.leads (id,user_id,campaign_id,email,country,status,unsubscribed,lifecycle,conv_mode) values ('${id}','${U}','${C}','stage7.${tag}.${i}@gmail.com','US','new',false,'NEW','AI_AUTOPILOT');`);

console.log("== Stage 7 live-fire proof (cost gate, cancel-before-send) ==");
try {
  // ---------- preconditions / backups ----------
  console.log("\n--- preconditions ---");
  console.table(await exec(`select status from public.campaigns where id='${C}'`));
  const profile = (await exec(`select plan, gmail_connected from public.profiles where id='${U}'`))[0];
  console.table(profile);
  const CAPS = { free: 10, starter: 50, growth: 200, agency: 500 };
  const cap = CAPS[String(profile.plan ?? "starter").toLowerCase()] ?? 50;
  const POOL_DAILY = Math.round(cap * 0.0016 * 1e6) / 1e6;
  console.log(`  pool_daily = $${POOL_DAILY} (plan=${profile.plan}, cap=${cap})`);

  const otherPending = Number((await exec(`select count(*) as n from public.send_queue where status not in ('sent','cancelled','dead') and campaign_id <> '${C}'`))[0]?.n ?? 0);
  line(otherPending === 0, "no OTHER pending jobs in send_queue (dry-run is whitelisted to the test campaign only)");

  const PROOF_START = new Date().toISOString();

  // Fresh slate for the test IDs (artifacts from the aborted first attempt /
  // probing must not confuse waitJob or re-insert).
  await exec(`
delete from public.send_queue where lead_id in (${LEADS.map((i) => `'${i}'`).join(",")});
delete from public.leads where id in (${LEADS.map((i) => `'${i}'`).join(",")});
delete from public.audit_events where event='email.cancelled' and payload->>'reason'='dry_run' and campaign_id='${C}';
delete from public.emails_sent where lead_id in (${LEADS.map((i) => `'${i}'`).join(",")});
`);

  const beforeState = (await exec(`select * from public.ai_cost_state where profile_id='${U}'`))[0] ?? null;
  const beforeMarkers = await exec(`select key,scope,scope_id,value from public.agent_config where (key in ('ai_quality.mode','ai_quality.metering_degraded','ai_quality.gate_enabled') and scope='user' and scope_id='${U}') or (key='ai_quality.gate_enabled' and scope='glob' and scope_id is null)`);
  const ledTotal0 = Number((await exec(`select coalesce(sum(est_cost_usd),0) as s from public.ai_spend_ledger where user_id='${U}'`))[0]?.s ?? 0);
  const winSum = () => exec(`select coalesce(sum(est_cost_usd),0) as s from public.ai_spend_ledger where user_id='${U}' and ts >= '${PROOF_START}'`);
  const winCount = () => exec(`select count(*) as n from public.ai_spend_ledger where user_id='${U}' and ts >= '${PROOF_START}'`);

  const seedAtPool = async () => exec(`
insert into public.ai_cost_state (profile_id, window_date, window_month, used_daily_usd, used_monthly_usd, last_reported_at, updated_at)
values ('${U}', to_char(now(),'YYYY-MM-DD'), to_char(now(),'YYYY-MM'), ${POOL_DAILY.toFixed(6)}, 0.05, now(), now())
on conflict (profile_id) do update set used_daily_usd=${POOL_DAILY.toFixed(6)}, used_monthly_usd=0.05, last_reported_at=now(), updated_at=now();`);

  const killSwitch = (on) => exec(`delete from public.agent_config where key='ai_quality.gate_enabled' and scope='glob' and scope_id is null; insert into public.agent_config (key,scope,scope_id,value,enabled) values ('ai_quality.gate_enabled','glob',null,${on ? "'false'" : "'true'"}::jsonb,true);`);

  const waitJob = async (ids, tag, timeoutMs = 90_000) => {
    const deadline = Date.now() + timeoutMs;
    const rows = [];
    while (Date.now() < deadline) {
      const r = await exec(`select id, lead_id, status, last_error from public.send_queue where lead_id in (${ids.map((i) => `'${i}'`).join(",")}) order by created_at desc`);
      if (r.length && r.every((x) => ["sent", "cancelled", "dead"].includes(String(x.status)))) return r;
      rows.splice(0, rows.length, ...r);
      await new Promise((r_) => setTimeout(r_, 4000));
    }
    console.table(rows);
    throw new Error(`timeout waiting for jobs to settle (${tag})`);
  };

  const latestDryRunAudit = () => exec(`select payload->>'gate_mode' as gate_mode, payload->>'gate_reason' as gate_reason, payload->>'subject' as subject from public.audit_events where event='email.cancelled' and payload->>'reason'='dry_run' and campaign_id='${C}' order by created_at desc limit 1`);

  // ---------- RUN 0: healthy default control ----------
  console.log("\n--- RUN 0: healthy account (existing spend, fresh heartbeat) => gate_mode ai ---");
  await insertLead(LEADS[0], "c0", 1);
  await enqueue();
  await triggerWorker();
  const r0 = (await waitJob([LEADS[0]], "run0"));
  line(String(r0[0]?.last_error ?? "").startsWith("dry_run"), "run0: job processed to dry-run cancel (deterministic stop before send)");
  const a0 = (await latestDryRunAudit())[0];
  line(a0?.gate_mode === "ai", "run0: healthy account => gate_mode=ai (mode survives with real spend)");
  const ledAfter0 = Number((await winSum())[0]?.s ?? 0);
  console.log(`  [run0] gate_mode=${a0?.gate_mode} reason=${String(a0?.gate_reason) === "" ? "null(below pools)" : a0?.gate_reason} subject=${a0?.subject}`);

  // ---------- RUN 1: near-cap => template ----------
  console.log("\n--- RUN 1: synthetic daily-pool ceiling => gate_mode template ---");
  await seedAtPool();
  const seeded = (await exec(`select used_daily_usd, used_monthly_usd from public.ai_cost_state where profile_id='${U}'`))[0];
  await insertLead(LEADS[1], "cap", 2);
  await enqueue();
  await triggerWorker();
  const r1 = (await waitJob([LEADS[1]], "run1"));
  line(String(r1[0]?.last_error ?? "").startsWith("dry_run"), "run1: job processed to dry-run cancel");
  const a1 = (await latestDryRunAudit())[0];
  line(a1?.gate_mode === "template", `run1: seed used_daily = $${POOL_DAILY.toFixed(4)} = pool ceiling => gate_mode=template (daily_pool trip)`);
  line(a1?.gate_reason === "daily_pool" || a1?.gate_reason === "metering_degraded", `run1: conserve reason is real (${a1?.gate_reason}) — daily_pool, or metering_degraded if the 5-min cron sweep raced in`);
  const after1 = (await exec(`select used_daily_usd from public.ai_cost_state where profile_id='${U}'`))[0];
  line(Number(after1.used_daily_usd) === Number(seeded.used_daily_usd), "run1: template path debits NOTHING — counter byte-identical after run");
  const led1 = Number((await winSum())[0]?.s ?? 0);
  line(Math.abs(led1 - ledAfter0) < 0.000001, "run1: zero ledger rows added under template (templates cost $0)");
  const es1 = await exec(`select count(*) as n from public.emails_sent where lead_id='${LEADS[1]}'`);
  line(Number(es1[0].n) === 0, "run1: NO emails_sent row (cancel before send)");

  // ---------- RUN 1b: sweep writes the markers ----------
  console.log("\n--- RUN 1b: cost-sweep writes the audit markers ---");
  await triggerSweep();
  const markers = await exec(`select key, value from public.agent_config where key in ('ai_quality.mode','ai_quality.metering_degraded') and scope='user' and scope_id='${U}'`);
  const mk = Object.fromEntries(markers.map((m) => [m.key, m.value]));
  line(mk["ai_quality.mode"] === "template", `run1b: sweep marker ai_quality.mode=template for the capped profile (got ${mk["ai_quality.mode"]})`);
  line(mk["ai_quality.metering_degraded"] === true || String(mk["ai_quality.metering_degraded"]) === "true", "run1b: drift tripwire fires (dark counter vs empty ledger) => metering_degraded=true — the §6.6 reconciliation made the dark ledger PROVABLE, not assumed");
  console.log(`  [markers] ${JSON.stringify(mk)}`);

  // ---------- RUN 2: kill-switch bypasses the whole gate ----------
  console.log("\n--- RUN 2: ai_quality.gate_enabled=false => full bypass at near-cap ---");
  await killSwitch(true);
  const before2 = Number((await winSum())[0]?.s ?? 0);
  await insertLead(LEADS[2], "kill", 3);
  await enqueue();
  await triggerWorker();
  const r2 = (await waitJob([LEADS[2]], "run2"));
  line(String(r2[0]?.last_error ?? "").startsWith("dry_run"), "run2: job processed to dry-run cancel");
  const a2 = (await latestDryRunAudit())[0];
  line(a2?.gate_mode === "ai" && a2?.gate_reason === "gate_disabled", "run2: kill-switch on => gate fully bypassed (gate_mode=ai / gate_disabled) EVEN at near-cap");
  const led2 = Number((await winSum())[0]?.s ?? 0);
  line(led2 > before2, "run2: real LLM call happened under bypass => a REAL ledger row landed (>= $0, direct from the meter — diff-1 meter-fires check closes here)");
  line(a2?.subject !== undefined && a2?.subject !== null, "run2: AI-era subject recorded");
  const es2 = await exec(`select count(*) as n from public.emails_sent where lead_id='${LEADS[2]}'`);
  line(Number(es2[0].n) === 0, "run2: still NO emails_sent row — dry-run cancel held even under bypass");

  // ---------- RUN 3: revert kill-switch => back to template ----------
  console.log("\n--- RUN 3: kill-switch removed => gate re-enforced (near-cap still set) ---");
  await killSwitch(false);
  await insertLead(LEADS[3], "revert", 4);
  await enqueue();
  await triggerWorker();
  const r3 = (await waitJob([LEADS[3]], "run3"));
  line(String(r3[0]?.last_error ?? "").startsWith("dry_run"), "run3: job processed to dry-run cancel");
  const a3 = (await latestDryRunAudit())[0];
  line(a3?.gate_mode === "template", "run3: gate_enabled=true removed => daily_pool template enforcement restored");

  // ---------- reconcile + the ledger rows are REAL ----------
  console.log("\n--- diff-1 meter-fires closure (real rows) ---");
  const dayRows = Number((await exec(`select count(*) as n from public.ai_spend_ledger where user_id='${U}' and ts >= ${`'${new Date().toISOString().slice(0, 10)}T00:00:00Z'`}`))[0]?.n ?? 0);
  line(dayRows >= 1, `meter fires on real traffic: ${dayRows} real ledger row(s) today with model+usage attribution (fn=send-worker, kind=gen_email)`);
  console.table(await exec(`select fn, kind, model, input_tokens, output_tokens, est_cost_usd from public.ai_spend_ledger where user_id='${U}' and ts >= '${PROOF_START}' order by ts desc limit 3`));

  // ---------- cleanup (full restore) ----------
  console.log("\n--- cleanup ---");
  await exec(`
delete from public.send_queue where lead_id in (${LEADS.map((i) => `'${i}'`).join(",")});
delete from public.leads where id in (${LEADS.map((i) => `'${i}'`).join(",")});
delete from public.audit_events where event='email.cancelled' and payload->>'reason'='dry_run' and campaign_id='${C}';
delete from public.audit_events where event='ai.metering.reconcile_send_gap' and user_id='${U}';
delete from public.emails_sent where lead_id in (${LEADS.map((i) => `'${i}'`).join(",")});
delete from public.agent_config where key in ('ai_quality.mode','ai_quality.metering_degraded','ai_quality.gate_enabled') and scope='user' and scope_id='${U}';
delete from public.agent_config where key='ai_quality.gate_enabled' and scope='glob' and scope_id is null;
delete from public.ai_spend_ledger where user_id='${U}' and ts >= '${PROOF_START}';
update public.campaigns set status='active' where id='${C}';
delete from public.ai_cost_state where profile_id='${U}' and window_date=to_char(now(),'YYYY-MM-DD') and used_daily_usd=${POOL_DAILY.toFixed(6)};
`);
  if (beforeState) {
    await exec(`update public.ai_cost_state set used_daily_usd=${Number(beforeState.used_daily_usd)}, used_monthly_usd=${Number(beforeState.used_monthly_usd)}, last_reported_at=${beforeState.last_reported_at ? `'${beforeState.last_reported_at}'` : "null"}, updated_at=now() where profile_id='${U}'`);
  }
  for (const m of beforeMarkers) {
    await exec(`select public.set_agent_config('${m.key}','${m.scope}',${m.scope_id ? `'${m.scope_id}'` : "null"},'${JSON.stringify(m.value)}'::jsonb,true,'proof-cleanup');`);
  }

  const leftovers = await exec(`select count(*) as n from public.send_queue q join public.leads l on l.id=q.lead_id where l.email like 'stage7.%'`);
  const camp = await exec(`select status from public.campaigns where id='${C}'`);
  const kills = await exec(`select count(*) as n from public.agent_config where key='ai_quality.gate_enabled'`);
  const leds = await exec(`select count(*) as n from public.ai_spend_ledger where user_id='${U}' and ts >= '${PROOF_START}'`);
  const ledTotalAfter = Number((await exec(`select coalesce(sum(est_cost_usd),0) as s from public.ai_spend_ledger where user_id='${U}'`))[0]?.s ?? 0);
  line(leftovers[0].n === 0, "no leftover queue/lead rows for stage7.*");
  line(camp[0].status === "active", "campaign restored to active");
  line(kills[0].n === 0, "no gate_enabled rows remain (kill-switch fully removed)");
  line(leds[0].n === 0, `proof-window ledger rows removed (${leds[0].n} -> 0)`);
  line(Math.abs(ledTotalAfter - ledTotal0) < 0.000001, "ledger total restored to pre-proof baseline (test rows + real-metric rows removed; pre-proof rows preserved)");

  console.log(`\n${failures === 0 ? "ALL ASSERTIONS PASSED" : `${failures} ASSERTION(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
} catch (e) {
  console.error("LIVE PROOF ERROR:", e.message);
  try { await exec(`update public.campaigns set status='active' where id='${C}';`); console.error("(campaign restored to active)"); } catch { /* ignore */ }
  process.exit(1);
}