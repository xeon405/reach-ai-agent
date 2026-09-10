// Stage 7 simulation proof — drives the REAL ai-cost-gate.ts contract
// (bundled unmodified by scripts/.stage7/build-stage7-test.mjs) against a
// mocked structural db. The user-approved proof bar for diff 2:
//   A. estimateCost always rounds UP (meter never undercounts for rounding).
//   B. Reservation math + durable atomic debit: refuse-on-ceiling, rollover
//      window handling, per-call guard trips BEFORE any debit RPC.
//   C. Decision matrix: healthy / daily pool / metering_degraded / reply-month
//      share / monthly hard-stop / admin markers / unreadable-state.
//   D. Non-uniform degrade: new-outreach kinds trip on the daily pool,
//      reply/radar kinds keep AI far longer.
//   E. openAiCall run(): debit ok -> LLM; debit refused/failed -> null (caller
//      template path); mode !== 'ai' -> null with NO LLM and NO debit.
// Exits nonzero on any assertion failure.

import "./.stage7/deno-polyfill.mjs";
import {
  AI_PER_CALL_GUARD,
  aiPools,
  estimateCost,
  openAiCall,
  reserveEstimate,
  resolveAiQuality,
} from "./.stage7/ai-cost-gate.test.mjs";

let failures = 0;
const line = (ok, msg) => { console.log(`  ${ok ? "PASS" : "FAIL"}  ${msg}`); if (!ok) failures++; };

function makeDb({ configRows = [], stateRow = null, stateThrows = false, rpcResult = null } = {}) {
  const rpcLog = [];
  const q = (rows, fails = false) => {
    const self = {
      select: () => self,
      eq: (col, v) => (col === "enabled" ? q(rows.filter((r) => r.enabled === v)) : self),
      in: () => self,
      enabled: () => q(rows.filter((r) => r.enabled !== false)),
      maybeSingle: () => Promise.resolve(fails ? (() => { throw new Error("mock db read failure"); })() : { data: rows[0] ?? null }),
      then: (res, rej) => (fails ? Promise.reject(new Error("mock db read failure")).then(res, rej) : Promise.resolve({ data: rows }).then(res, rej)),
    };
    return self;
  };
  const db = {
    from: (table) => {
      if (table === "ai_cost_state") return q(stateRow ? [stateRow] : [], stateThrows);
      return q(configRows);
    },
    rpc: (fn, args) => { rpcLog.push({ fn, args }); return Promise.resolve(rpcResult); },
  };
  return { db, rpcLog };
}

const CTX = { userId: "u1", campaignId: "c1", leadId: "l1", plan: "starter", fn: "send-worker" };

// ---------------------------------------------------------------------------
console.log("SCENARIO A — estimateCost rounds UP (never undercounts)");
{
  line(estimateCost(0, 0) === 0, "zero tokens => $0");
  const single = (1000 * 0.0000002 + 0) / 1000000 * 1000000;
  line(estimateCost(1000, 0) === 0.0002, "1000 in => $0.0002 exact");
  line(estimateCost(1, 0) === 0.000001, "1 token in => ceil to $0.000001 (raw $0.0000002 would round UNDER to $0 otherwise)");
  const two = estimateCost(0, 1);
  line(two === 0.000001 && two >= 0.0000008, "1 token out => ceil not truncate");
  line(estimateCost(3000, 2000) === 0.0022, "3000 in + 2000 out => $0.0022");
}

// ---------------------------------------------------------------------------
console.log("SCENARIO B — pools, reservation, guard");
{
  line(aiPools("free").daily === 0.016 && aiPools("free").monthly === 0.48, "free: $0.016/day $0.48/mo");
  line(aiPools("starter").daily === 0.08 && aiPools("starter").monthly === 2.4, "starter: $0.08/day $2.40/mo");
  line(aiPools("growth").daily === 0.32 && aiPools("agency").daily === 0.8, "growth $0.32/day, agency $0.80/day");
  line(aiPools("BOGUS").daily === 0.08, "unknown plan falls back to starter pool");
  const r1 = reserveEstimate(0, 700);
  line(r1 >= 0.000001 && r1 <= AI_PER_CALL_GUARD, `min reserve ${r1} within guard`);
  const r2 = reserveEstimate(4000, 700);
  const expect = estimateCost(Math.ceil(4000 / 4), 700) * 1.5;
  line(r2 >= Math.ceil(expect * 1e6) / 1e6, "reserve scales with input length + safety factor");
  const huge = reserveEstimate(80_000, 1000);
  line(huge > AI_PER_CALL_GUARD, `huge prompt reserve ${huge} exceeds single-call guard ${AI_PER_CALL_GUARD}`);
}

// ---------------------------------------------------------------------------
console.log("SCENARIO C — decision matrix (resolveAiQuality)");
{
  const fresh = makeDb();
  const f = await resolveAiQuality(fresh.db, { ...CTX, kind: "gen_email" });
  line(f.mode === "ai" && f.reason === "no_state", "fresh profile, no config => ai (no_state)");

  const noStateNoUserId = makeDb();
  const n = await resolveAiQuality(noStateNoUserId.db, { ...CTX, userId: null, kind: "gen_email" });
  line(n.mode === "ai", "no userId and no state => ai");

  const freshlySeededAccounts = [undefined, "free", "starter", "growth", "agency"].map(async (plan) => {
    const freshDb = makeDb();
    const q = await resolveAiQuality(freshDb.db, { userId: "u2", campaignId: "c9", kind: "gen_email", plan: plan ?? undefined });
    return { plan, mode: q.mode, reason: q.reason };
  });
  for (const r of await Promise.all(freshlySeededAccounts)) {
    line(r.mode === "ai" && r.reason === "no_state", `day-one account (${r.plan ?? "no plan"}) with NO ai_cost_state row => full AI (no_state)`);
  }

  const unreadable = makeDb({ stateThrows: true });
  const u = await resolveAiQuality(unreadable.db, { ...CTX, kind: "gen_email" });
  line(u.mode === "template" && u.reason === "unreadable_state", "state read failure => template (conserve)");

  const dailyPool = makeDb({ stateRow: { used_daily_usd: 0.08, used_monthly_usd: 0.1, last_reported_at: new Date().toISOString() } });
  const d = await resolveAiQuality(dailyPool.db, { ...CTX, kind: "gen_email" });
  line(d.mode === "template" && d.reason === "daily_pool", "daily pool reached (gen_email) => template");
  const d2 = await resolveAiQuality(dailyPool.db, { ...CTX, kind: "gen_followup" });
  line(d2.mode === "template" && d2.reason === "daily_pool", "daily pool reached (gen_followup) => template");

  const dailyOkReply = makeDb({ stateRow: { used_daily_usd: 0.20, used_monthly_usd: 0.1, last_reported_at: new Date().toISOString() } });
  const dn = await resolveAiQuality(dailyOkReply.db, { ...CTX, kind: "reply_draft" });
  line(dn.mode === "ai", "daily over pool but REPLY => keeps AI (monthly only)");

  const monthHard = makeDb({ stateRow: { used_daily_usd: 0.02, used_monthly_usd: 2.41, last_reported_at: new Date().toISOString() } });
  const m1 = await resolveAiQuality(monthHard.db, { ...CTX, kind: "gen_email" });
  line(m1.mode === "hard_stop", "monthly pool reached (gen_email) => hard_stop");
  const m2 = await resolveAiQuality(monthHard.db, { ...CTX, kind: "reply_draft" });
  line(m2.mode === "hard_stop", "monthly pool reached (reply) => hard_stop");

  const replyShare = makeDb({ stateRow: { used_daily_usd: 0.01, used_monthly_usd: 0.75, last_reported_at: new Date().toISOString() } });
  const rs = await resolveAiQuality(replyShare.db, { ...CTX, kind: "reply_draft" });
  line(rs.mode === "template" && rs.reason === "reply_month_share", "reply share 30% of monthly reached => reply template");
  const rs2 = await resolveAiQuality(replyShare.db, { ...CTX, kind: "gen_email" });
  line(rs2.mode === "ai", "reply share reached but daily healthy => gen_email STAYS ai (non-uniform)");

  const degradedMarker = makeDb({
    configRows: [{ key: "ai_quality.metering_degraded", scope: "user", scope_id: "u1", value: true, enabled: true }],
    stateRow: { used_daily_usd: 0.01, used_monthly_usd: 0.02, last_reported_at: new Date().toISOString() },
  });
  const g1 = await resolveAiQuality(degradedMarker.db, { ...CTX, kind: "gen_email" });
  line(g1.mode === "template" && g1.reason === "metering_degraded", "metering_degraded marker => gen_email template");
  const g2 = await resolveAiQuality(degradedMarker.db, { ...CTX, kind: "reply_draft" });
  line(g2.mode === "ai" && g2.metering_degraded === true && g2.reason === "reply_keeps_ai_under_degrade", "metering_degraded => reply keeps AI, flag readable separately");

  const staleState = makeDb({ stateRow: { used_daily_usd: 0.05, used_monthly_usd: 0.02, last_reported_at: new Date(Date.now() - 11 * 60 * 1000).toISOString() } });
  const st = await resolveAiQuality(staleState.db, { ...CTX, kind: "gen_email" });
  line(st.mode === "template" && st.reason === "metering_degraded", "stale heartbeat + spend => gen_email template");
  const st2 = await resolveAiQuality(staleState.db, { ...CTX, kind: "reply_draft" });
  line(st2.mode === "ai", "stale heartbeat => reply keeps AI");

  const noHeartbeat = makeDb({ stateRow: { used_daily_usd: 0.05, used_monthly_usd: 0.02, last_reported_at: null } });
  const nh = await resolveAiQuality(noHeartbeat.db, { ...CTX, kind: "gen_email" });
  line(nh.mode === "template" && nh.reason === "metering_degraded", "spend with no heartbeat => template");

  const zeroSpendStale = makeDb({ stateRow: { used_daily_usd: 0, used_monthly_usd: 0, last_reported_at: "2020-01-01T00:00:00Z" } });
  const zs = await resolveAiQuality(zeroSpendStale.db, { ...CTX, kind: "gen_email" });
  line(zs.mode === "ai", "no spend + stale heartbeat => ai (no drift signal)");

  const adminHard = makeDb({
    configRows: [{ key: "ai_quality.mode", scope: "glob", scope_id: null, value: "hard_stop", enabled: true }],
  });
  const a1 = await resolveAiQuality(adminHard.db, { ...CTX, kind: "gen_email" });
  line(a1.mode === "hard_stop" && a1.reason === "admin:hard_stop", "admin glob hard_stop wins immediately (fresh profile)");

  const adminTemp = makeDb({
    configRows: [{ key: "ai_quality.mode", scope: "user", scope_id: "u1", value: "template", enabled: true }],
    stateRow: { used_daily_usd: 0, used_monthly_usd: 0, last_reported_at: new Date().toISOString() },
  });
  const a2 = await resolveAiQuality(adminTemp.db, { ...CTX, kind: "reply_draft" });
  line(a2.mode === "template" && a2.reason === "admin:template", "admin user-level template wins even over reply exemption");

  const scoped = makeDb({
    configRows: [
      { key: "ai_quality.mode", scope: "glob", scope_id: null, value: "ai", enabled: true },
      { key: "ai_quality.mode", scope: "campaign", scope_id: "c1", value: "template", enabled: true },
    ],
    stateRow: { used_daily_usd: 0.01, used_monthly_usd: 0.02, last_reported_at: new Date().toISOString() },
  });
  const sp = await resolveAiQuality(scoped.db, { ...CTX, kind: "gen_email" });
  line(sp.mode === "template", "campaign-scoped marker beats glob (most-specific wins)");

  const disabled = makeDb({
    configRows: [{ key: "ai_quality.mode", scope: "glob", scope_id: null, value: "hard_stop", enabled: false }],
  });
  const dis = await resolveAiQuality(disabled.db, { ...CTX, kind: "gen_email" });
  line(dis.mode !== "hard_stop", "disabled marker row is ignored");
}

// ---------------------------------------------------------------------------
console.log("SCENARIO D — openAiCall run(): debit -> LLM; refuse -> null");
{
  let groqCalls = 0, lastCtx = null;
  const groqChat = async (_m, o) => { groqCalls++; lastCtx = o; return "Best regards,\nAli"; };

  const okDb = makeDb({ rpcResult: { data: { ok: true } } });
  const gate = await openAiCall(okDb.db, { ...CTX, kind: "gen_email", groqChat });
  line(gate.mode === "ai", "handle mode ai when healthy");
  const out = await gate.run("short prompt", { maxTokens: 700, temperature: 0.8 });
  line(out === "Best regards,\nAli", "debited call returns LLM text");
  line(okDb.rpcLog.length === 1 && okDb.rpcLog[0].fn === "ai_cost_debit", "exactly one ai_cost_debit RPC on run");
  const dr = okDb.rpcLog[0]?.args ?? {};
  line(dr.p_pool_daily === aiPools("starter").daily && dr.p_pool_monthly === aiPools("starter").monthly, "debit carries the plan's pools");
  line(dr.p_profile_id === "u1" && dr.p_debit > 0, "debit carries userId + reserve");
  line(groqCalls === 1 && lastCtx.context.reserve === dr.p_debit, "LLM call passes the SAME reserve into meter context");

  const refused = makeDb({ rpcResult: { data: { ok: false, reason: "daily_pool" } } });
  let rp = 0;
  const gate2 = await openAiCall(refused.db, { ...CTX, kind: "gen_email", groqChat: async () => { rp++; return ""; } });
  const out2 = await gate2.run("x");
  line(out2 === null && rp === 0, "debit refused => run() null, no LLM");

  const boom = makeDb({ rpcResult: { data: { ok: true } }, stateThrows: false });
  boom.db.rpc = async () => { throw new Error("rpc unreachable"); };
  const gate3 = await openAiCall(boom.db, { ...CTX, kind: "gen_email", groqChat: async () => "never" });
  const out3 = await gate3.run("x");
  line(out3 === null, "debit unreachable => run() null (conserves, never spends blind)");

  const guardRun = makeDb({ rpcResult: { data: { ok: true } } });
  const gate4 = await openAiCall(guardRun.db, { ...CTX, kind: "gen_email", groqChat: async () => "never" });
  const out4 = await gate4.run("x".repeat(80_000), { maxTokens: 1000 });
  line(out4 === null && guardRun.rpcLog.length === 0, "per-call guard trips BEFORE any debit RPC");

  const tempDb = makeDb({
    stateRow: { used_daily_usd: 0.08, used_monthly_usd: 0.1, last_reported_at: new Date().toISOString() },
  });
  const gate5 = await openAiCall(tempDb.db, { ...CTX, kind: "gen_email", groqChat: async () => "never" });
  line(gate5.mode === "template", "daily pool => gate opens in template mode");
  const out5 = await gate5.run("x");
  line(out5 === null && tempDb.rpcLog.length === 0, "template-mode run(): null, zero LLM, zero debit, zero ledger");
}

// ---------------------------------------------------------------------------
console.log("SCENARIO E — admin kill-switch (ai_quality.gate_enabled = false)");
{
  let calls = 0, capturedCtx = null;
  const groqChat = async (_m, o) => { calls++; capturedCtx = o; return "pre-stage-7 reply"; };

  const bypassGlob = makeDb({
    configRows: [{ key: "ai_quality.gate_enabled", scope: "glob", scope_id: null, value: false, enabled: true }],
    stateRow: { used_daily_usd: 0.20, used_monthly_usd: 2.5, last_reported_at: new Date(Date.now() - 30 * 60 * 1000).toISOString() },
  });
  const g = await openAiCall(bypassGlob.db, { ...CTX, kind: "gen_email", groqChat });
  line(g.mode === "ai" && g.reason === "gate_disabled", "gate_enabled=false => handle opens in ai/gate_disabled even at 250% of monthly pool");
  const gone = await g.run("hello", { maxTokens: 500 });
  line(gone === "pre-stage-7 reply", "kill-switched run: LLM still called (pre-Stage-7 behavior)");
  line(calls === 1 && bypassGlob.rpcLog.length === 0, "kill-switched run: zero debit RPC (gate never consulted)");
  line(capturedCtx && capturedCtx.context.reserve === undefined && capturedCtx.context.kind === "gen_email", "kill-switched context: same meter shape as diff 1 (no reserve, kind kept)");

  let calls2 = 0;
  const bypassUserScope = makeDb({
    configRows: [{ key: "ai_quality.gate_enabled", scope: "user", scope_id: "u1", value: "false", enabled: true }],
    stateRow: { used_daily_usd: 0.20, used_monthly_usd: 2.5, last_reported_at: new Date(Date.now() - 30 * 60 * 1000).toISOString() },
  });
  const g2 = await openAiCall(bypassUserScope.db, { ...CTX, kind: "reply_draft", groqChat: async () => { calls2++; return "ok"; } });
  line(g2.mode === "ai" && g2.reason === "gate_disabled", "user-scoped 'false' string also bypasses");
  await g2.run("noop", { maxTokens: 100 });
  line(calls2 === 1 && bypassUserScope.rpcLog.length === 0, "user-scoped bypass also zero-debit");

  let calls3 = 0;
  const noBypass = makeDb({
    configRows: [{ key: "ai_quality.gate_enabled", scope: "glob", scope_id: null, value: true, enabled: true }],
    stateRow: { used_daily_usd: 0.08, used_monthly_usd: 0.1, last_reported_at: new Date().toISOString() },
  });
  const g3 = await openAiCall(noBypass.db, { ...CTX, kind: "gen_email", groqChat: async () => { calls3++; return "x"; } });
  line(g3.mode === "template", "gate_enabled=true (explicit) => gate still enforces (daily pool => template)");
  const no8 = await g3.run("x");
  line(no8 === null && calls3 === 0, "enabled=true + pool hit => template path, LLM untouched");

  let calls4 = 0;
  const noRow = makeDb();
  const g4 = await openAiCall(noRow.db, { ...CTX, kind: "gen_email", groqChat: async () => { calls4++; return "x"; } });
  line(g4.mode === "ai", "no gate_enabled row (default) => normal gate, fresh profile => ai");
  await g4.run("hi", { maxTokens: 100 });
  line(noRow.rpcLog.length === 1, "default (no row) => debit runs normally");
}

// ---------------------------------------------------------------------------
console.log(`\n${failures === 0 ? "ALL PASS" : failures + " FAILURES"}`);
process.exit(failures === 0 ? 0 : 1);