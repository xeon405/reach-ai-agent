// supabase/functions/_shared/ai-cost-gate.ts
var AI_COST_PER_1M_IN = Number(Deno.env.get("AI_COST_PER_1M_IN") ?? "0.20");
var AI_COST_PER_1M_OUT = Number(Deno.env.get("AI_COST_PER_1M_OUT") ?? "0.80");
var AI_ALLOWANCE_PER_SEND = Number(Deno.env.get("AI_ALLOWANCE_PER_SEND") ?? "0.0016");
var AI_PER_CALL_GUARD = Number(Deno.env.get("AI_PER_CALL_GUARD") ?? "0.0025");
var AI_SAFETY_FACTOR = Number(Deno.env.get("AI_SAFETY_FACTOR") ?? "1.5");
var AI_REPLY_MONTH_SHARE = Number(Deno.env.get("AI_REPLY_MONTH_SHARE") ?? "0.30");
var AI_METER_MAX_AGE_MS = 10 * 60 * 1e3;
var AI_DRIFT_TOL_AHEAD = Number(Deno.env.get("AI_DRIFT_TOL_AHEAD") ?? "0.004");
var PLAN_EMAIL_CAPS = {
  free: 10,
  starter: 50,
  growth: 200,
  agency: 500
};
var REPLY_KINDS = /* @__PURE__ */ new Set(["classify", "reply_draft", "escalate"]);
function round6(usd) {
  return Math.round(usd * 1e6) / 1e6;
}
function estimateCost(inTokens, outTokens) {
  const usd = (Math.max(0, inTokens) * AI_COST_PER_1M_IN + Math.max(0, outTokens) * AI_COST_PER_1M_OUT) / 1e6;
  return Math.ceil(usd * 1e6) / 1e6;
}
function reserveEstimate(promptChars, maxTokens) {
  const inTok = Math.max(100, Math.ceil(promptChars / 4));
  const outTok = Math.max(1, maxTokens);
  const usd = estimateCost(inTok, outTok) * AI_SAFETY_FACTOR;
  const r = Math.ceil(usd * 1e6) / 1e6;
  return Math.max(r, 1e-6);
}
function aiPools(plan) {
  const cap = PLAN_EMAIL_CAPS[String(plan ?? "").toLowerCase()] ?? PLAN_EMAIL_CAPS.starter;
  const daily = round6(cap * AI_ALLOWANCE_PER_SEND);
  const monthly = round6(30 * daily);
  return { daily, monthly, cap };
}
async function readConfig(db, keys, scope) {
  const out = {};
  try {
    const { data } = await db.from("agent_config").select("key, scope, scope_id, value, enabled").in("key", keys).eq("enabled", true);
    const rows = data ?? [];
    for (const key of keys) {
      const pick = (s, id) => rows.find((r) => r.key === key && r.scope === s && r.scope_id === id);
      const eff = (scope.campaignId ? pick("campaign", scope.campaignId) : void 0) ?? (scope.userId ? pick("user", scope.userId) : void 0) ?? pick("glob", null);
      out[key] = eff?.value;
    }
  } catch {
  }
  return out;
}
function concede(rule) {
  return { mode: "template", metering_degraded: false, reason: rule };
}
async function resolveAiQuality(db, ctx) {
  const cfg = await readConfig(db, ["ai_quality.mode", "ai_quality.metering_degraded"], {
    userId: ctx.userId ?? void 0,
    campaignId: ctx.campaignId ?? void 0
  });
  const rawMode = String(cfg["ai_quality.mode"] ?? "").trim();
  if (rawMode) {
    if (rawMode === "hard_stop") return { mode: "hard_stop", metering_degraded: false, reason: "admin:hard_stop" };
    if (rawMode === "template") return { mode: "template", metering_degraded: false, reason: "admin:template" };
  }
  const metaDegradedRow = cfg["ai_quality.metering_degraded"];
  const metaDegraded = metaDegradedRow === true || metaDegradedRow === "true";
  let state = null;
  let stateReadFailed = false;
  if (ctx.userId) {
    try {
      const { data } = await db.from("ai_cost_state").select("used_daily_usd, used_monthly_usd, last_reported_at").eq("profile_id", ctx.userId).maybeSingle();
      if (data) {
        state = {
          used_daily: Number(data.used_daily_usd ?? 0) || 0,
          used_month: Number(data.used_monthly_usd ?? 0) || 0,
          last_reported_at: data.last_reported_at ? String(data.last_reported_at) : null
        };
      }
    } catch {
      stateReadFailed = true;
    }
  }
  const pools = aiPools(ctx.plan);
  const degraded = metaDegraded || driftedFresh(state, pools);
  const isReply = REPLY_KINDS.has(ctx.kind);
  if (stateReadFailed) return concede("unreadable_state");
  if (!state) {
    if (degraded) return concede("metering_degraded");
    return { mode: "ai", metering_degraded: metaDegraded, reason: "no_state" };
  }
  if (state.used_month >= pools.monthly) return { mode: "hard_stop", metering_degraded: degraded, reason: "monthly_pool" };
  if (isReply) {
    if (state.used_month >= pools.monthly * AI_REPLY_MONTH_SHARE) return concede("reply_month_share");
    return { mode: "ai", metering_degraded: degraded, reason: degraded ? "reply_keeps_ai_under_degrade" : null };
  }
  if (degraded) return concede("metering_degraded");
  if (state.used_daily >= pools.daily) return concede("daily_pool");
  return { mode: "ai", metering_degraded: false, reason: null };
}
function driftedFresh(state) {
  if (!state) return false;
  if (state.used_daily <= 0) return false;
  if (!state.last_reported_at) return true;
  return Date.now() - new Date(state.last_reported_at).getTime() > AI_METER_MAX_AGE_MS;
}
async function openAiCall(db, ctx, maxTokens = 1024) {
  const bypass = await readConfig(db, ["ai_quality.gate_enabled"], {
    userId: ctx.userId ?? void 0,
    campaignId: ctx.campaignId ?? void 0
  });
  const gateOn = bypass["ai_quality.gate_enabled"] ?? true;
  if (gateOn === false || gateOn === "false") {
    return {
      mode: "ai",
      metering_degraded: false,
      reason: "gate_disabled",
      async run(promptText, opts) {
        return ctx.groqChat(
          [{ role: "user", content: promptText }],
          {
            maxTokens: opts?.maxTokens ?? maxTokens,
            temperature: opts?.temperature,
            context: {
              fn: ctx.fn ?? "openAiCall",
              kind: ctx.kind,
              user_id: ctx.userId ?? void 0,
              campaign_id: ctx.campaignId ?? void 0,
              lead_id: ctx.leadId ?? void 0,
              decision_id: ctx.decisionId ?? void 0
            }
          }
        );
      }
    };
  }
  const quality = await resolveAiQuality(db, ctx);
  if (quality.mode !== "ai") return { ...quality, run: async () => null };
  return {
    mode: "ai",
    metering_degraded: quality.metering_degraded,
    reason: quality.reason,
    async run(promptText, opts) {
      const pool = aiPools(ctx.plan);
      const reserve = reserveEstimate(promptText.length, opts?.maxTokens ?? maxTokens);
      if (reserve > AI_PER_CALL_GUARD) return null;
      let debit = null;
      try {
        const res = await db.rpc("ai_cost_debit", {
          p_profile_id: ctx.userId,
          p_debit: reserve,
          p_pool_daily: pool.daily,
          p_pool_monthly: pool.monthly
        });
        debit = res.data;
      } catch {
        return null;
      }
      if (!debit?.ok) return null;
      try {
        const text = await ctx.groqChat(
          [{ role: "user", content: promptText }],
          {
            maxTokens: opts?.maxTokens ?? maxTokens,
            temperature: opts?.temperature,
            context: {
              fn: ctx.fn ?? "openAiCall",
              kind: ctx.kind,
              user_id: ctx.userId ?? void 0,
              campaign_id: ctx.campaignId ?? void 0,
              lead_id: ctx.leadId ?? void 0,
              decision_id: ctx.decisionId ?? void 0,
              reserve
            }
          }
        );
        return text;
      } catch {
        return null;
      }
    }
  };
}
export {
  AI_ALLOWANCE_PER_SEND,
  AI_COST_PER_1M_IN,
  AI_COST_PER_1M_OUT,
  AI_DRIFT_TOL_AHEAD,
  AI_METER_MAX_AGE_MS,
  AI_PER_CALL_GUARD,
  AI_REPLY_MONTH_SHARE,
  AI_SAFETY_FACTOR,
  PLAN_EMAIL_CAPS,
  aiPools,
  estimateCost,
  openAiCall,
  reserveEstimate,
  resolveAiQuality,
  round6
};
