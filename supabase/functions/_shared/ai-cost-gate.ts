// ============================================================
// AI-COST-GATE — Stage 7 request-time consumer contract.
// Design: INTELLIGENCE-LAYER-DESIGN.md §6.3→§6.6.
// Principles enforced HERE, in one place:
//   * The hard ceiling is a DURABLE atomic reservation-debit (ai_cost_debit RPC):
//     every gated AI call debits ai_cost_state BEFORE the call; a regular
//     reserve-then-settle (meter settles actual − reserved via ai_cost_settle).
//   * Abandoned reservations are NOT refunded — they decay by window rollover and
//     only bias toward earlier degrade (safe direction). The sweep never rewrites
//     counters, so it can never race an in-flight debit.
//   * Fail-safe = CONSERVE, never spend blind: a failed ceiling read/debit means
//     the caller runs the deterministic template path, not the AI path.
//   * The dual markers (ai_quality.mode, ai_quality.metering_degraded) live in
//     agent_config and are read through the SAME scoped picker as getKillSwitch
//     (glob -> user -> campaign, most specific wins). The sweep is the single
//     writer; an admin can still set a row directly (hard_stop wins immediately).
//   * Non-uniform degrade (§6.4): new-outreach kinds (gen_email/gen_followup/
//     gen_email_alt/summarize) trip at the daily pool and at metering_degraded;
//     reply/radar kinds (classify/reply_draft/escalate) keep AI far longer and
//     trip only on the monthly pool or the reply share of the monthly pool.
// This module mirrors the dependency-free style of intelligence-reads.ts: a
// structural db (from/rpc) keeps it harness-testable from Node.
// ============================================================

export const AI_COST_PER_1M_IN = Number(Deno.env.get("AI_COST_PER_1M_IN") ?? "0.20");
export const AI_COST_PER_1M_OUT = Number(Deno.env.get("AI_COST_PER_1M_OUT") ?? "0.80");
export const AI_ALLOWANCE_PER_SEND = Number(Deno.env.get("AI_ALLOWANCE_PER_SEND") ?? "0.0016");
export const AI_PER_CALL_GUARD = Number(Deno.env.get("AI_PER_CALL_GUARD") ?? "0.0025");
export const AI_SAFETY_FACTOR = Number(Deno.env.get("AI_SAFETY_FACTOR") ?? "1.5");
export const AI_REPLY_MONTH_SHARE = Number(Deno.env.get("AI_REPLY_MONTH_SHARE") ?? "0.30");
/** Sweep staleness: a counter whose last_reported_at is older than this is
 *  spent-unknown and conserves (§6.6). Sweep cadence is 5 min; 10 min covers
 *  exactly one missed tick plus slack. */
export const AI_METER_MAX_AGE_MS = 10 * 60 * 1000;
/** Ledger-drift tolerance: counter ahead of Σ(ledger) by more than 2× the
 *  average reserved call is a dark-ledger signal (rows lost / settle sans
 *  ledger) => metering is degraded => conserve (§6.6). */
export const AI_DRIFT_TOL_AHEAD = Number(Deno.env.get("AI_DRIFT_TOL_AHEAD") ?? "0.004");

export const PLAN_EMAIL_CAPS: Record<string, number> = {
  free: 10,
  starter: 50,
  growth: 200,
  agency: 500,
};

/** Visitor wall of the public support-chat widget. The guest bucket is a
 *  single-row global counter (ai_cost_guest_state) because guests have no
 *  profile row and ai_cost_state.profile_id FKs to profiles. Raised from
 *  $0.10/day to $0.50/day (2026-09) after real usage data showed ~$0.0033 per
 *  chat message — $0.10 was ~30 messages/day for ALL visitors (a single
 *  curious visitor could exhaust the whole widget). $0.50 ≈ 150 messages/day,
 *  ~5-6x the daily usage we observed. */
export const AI_GUEST_POOL_DAILY = Number(Deno.env.get("AI_GUEST_POOL_DAILY") ?? "0.50");
export const AI_GUEST_POOL_MONTHLY = Number(Deno.env.get("AI_GUEST_POOL_MONTHLY") ?? String(round6(AI_GUEST_POOL_DAILY * 30)));

export type AiMode = "ai" | "template" | "hard_stop";

export interface AiQuality {
  mode: AiMode;
  metering_degraded: boolean;
  reason: string | null;
}

export interface GateContext {
  userId?: string | null;
  campaignId?: string | null;
  leadId?: string | null;
  kind: string; // gen_email | gen_followup | gen_email_alt | summarize | classify | reply_draft | escalate | chat
  decisionId?: string | null;
  plan?: string | null;
  fn?: string;
  /** Override the global per-call USD guard for THIS call site. The guard's job
   *  is catching a single runaway call (100K+ char prompt); a support-chat call
   *  legitimately ships the full product manual (~17K chars) plus history, whose
   *  reserve lands ~$0.003-0.004 — above the generic email-sized guard of
   *  $0.0025. Scalars that carry a knowledge base opt into a higher ceiling. */
  perCallGuard?: number;
  /** Optional model for the LLM call (support-chat opts into groq/compound's
   *  70K TPM pool because its multi-K-token prompt exhausts gpt-oss-120b free
   *  tier TPM after a burst). Defaults to GROQ_MODEL when unset. */
  model?: string;
}

type Db = { from: (table: string) => any; rpc: (fn: string, args: any) => any };

const REPLY_KINDS = new Set(["classify", "reply_draft", "escalate"]);

export function round6(usd: number): number {
  return Math.round(usd * 1_000_000) / 1_000_000;
}

/** Cost estimate rounds UP to 6dp — the meter never undercounts state for
 *  rounding reasons (safe direction; §6.2/Q2 review). */
export function estimateCost(inTokens: number, outTokens: number): number {
  const usd = (Math.max(0, inTokens) * AI_COST_PER_1M_IN + Math.max(0, outTokens) * AI_COST_PER_1M_OUT) / 1_000_000;
  return Math.ceil(usd * 1_000_000) / 1_000_000;
}

/** Pre-call reservation bound for one call: input estimated from prompt size
 *  (≈ 4 chars/token), output capped at maxTokens, safety factor on top. */
export function reserveEstimate(promptChars: number, maxTokens: number): number {
  const inTok = Math.max(100, Math.ceil(promptChars / 4));
  const outTok = Math.max(1, maxTokens);
  const usd = estimateCost(inTok, outTok) * AI_SAFETY_FACTOR;
  const r = Math.ceil(usd * 1_000_000) / 1_000_000;
  return Math.max(r, 0.000001);
}

export function aiPools(plan?: string | null): { daily: number; monthly: number; cap: number } {
  const cap = PLAN_EMAIL_CAPS[String(plan ?? "").toLowerCase()] ?? PLAN_EMAIL_CAPS.starter;
  const daily = round6(cap * AI_ALLOWANCE_PER_SEND);
  const monthly = round6(30 * daily);
  return { daily, monthly, cap };
}

// ------------------------------------------------------------------
// Scoped marker reader — the SAME most-specific-wins picker as getKillSwitch,
// generalised to arbitrary agent_config keys (mode + metering_degraded).
// ------------------------------------------------------------------
async function readConfig(db: Db, keys: string[], scope: { userId?: string | null; campaignId?: string | null }) {
  const out: Record<string, unknown> = {};
  try {
    const { data } = await db
      .from("agent_config")
      .select("key, scope, scope_id, value, enabled")
      .in("key", keys)
      .eq("enabled", true);
    const rows = (data ?? []) as Array<{ key: string; scope: string; scope_id: string | null; value: unknown }>;
    for (const key of keys) {
      const pick = (s: string, id: string | null) => rows.find((r) => r.key === key && r.scope === s && r.scope_id === id);
      const eff = (scope.campaignId ? pick("campaign", scope.campaignId) : undefined)
        ?? (scope.userId ? pick("user", scope.userId) : undefined)
        ?? pick("glob", null);
      out[key] = eff?.value;
    }
  } catch {
    // read failure -> no marker -> derive from state (never exposes spend).
  }
  return out;
}

// ------------------------------------------------------------------
// concede() — the conservative tail ALL refusals funnel through.
// Reason is explicit so a reviewer can prove which rule tripped.
// ------------------------------------------------------------------
function concede(rule: string): AiQuality {
  return { mode: "template", metering_degraded: false, reason: rule };
}

/** Resolve the AI-quality decision for ONE call site. Deterministic, no writes.
 *  order: admin markers -> monthly hard-stop -> per-bucket tripwires. */
export async function resolveAiQuality(
  db: Db,
  ctx: GateContext,
): Promise<AiQuality> {
  const cfg = await readConfig(db, ["ai_quality.mode", "ai_quality.metering_degraded"], {
    userId: ctx.userId ?? undefined,
    campaignId: ctx.campaignId ?? undefined,
  });
  const rawMode = String(cfg["ai_quality.mode"] ?? "").trim();
  if (rawMode) {
    if (rawMode === "hard_stop") return { mode: "hard_stop", metering_degraded: false, reason: "admin:hard_stop" };
    if (rawMode === "template") return { mode: "template", metering_degraded: false, reason: "admin:template" };
  }
  const metaDegradedRow = cfg["ai_quality.metering_degraded"];
  const metaDegraded = metaDegradedRow === true || metaDegradedRow === "true";

  let state: { used_daily: number; used_month: number; last_reported_at: string | null } | null = null;
  let stateReadFailed = false;
  if (ctx.userId) {
    try {
      const { data } = await db
        .from("ai_cost_state")
        .select("used_daily_usd, used_monthly_usd, last_reported_at")
        .eq("profile_id", ctx.userId)
        .maybeSingle();
      if (data) {
        state = {
          used_daily: Number(data.used_daily_usd ?? 0) || 0,
          used_month: Number(data.used_monthly_usd ?? 0) || 0,
          last_reported_at: data.last_reported_at ? String(data.last_reported_at) : null,
        };
      }
    } catch {
      stateReadFailed = true; // read failed => spent-unknown => conserve below
    }
  }

  const pools = aiPools(ctx.plan);
  const degraded = metaDegraded || driftedFresh(state);
  const isReply = REPLY_KINDS.has(ctx.kind);

  if (stateReadFailed) return concede("unreadable_state");
  if (!state) {
    // No counter row yet (fresh profile, nothing spent). Only an explicit
    // degraded marker conserves here — a missing row is NOT unreadable state.
    if (degraded) return concede("metering_degraded");
    return { mode: "ai", metering_degraded: metaDegraded, reason: "no_state" };
  }

  if (state.used_month >= pools.monthly) return { mode: "hard_stop", metering_degraded: degraded, reason: "monthly_pool" };
  if (isReply) {
    // L2: replies + intent radar keep AI far longer — only the reply share of
    // the monthly pool (30%) trips them, never the daily L1 check.
    if (state.used_month >= pools.monthly * AI_REPLY_MONTH_SHARE) return concede("reply_month_share");
    return { mode: "ai", metering_degraded: degraded, reason: degraded ? "reply_keeps_ai_under_degrade" : null };
  }
  if (degraded) return concede("metering_degraded");
  if (state.used_daily >= pools.daily) return concede("daily_pool");
  return { mode: "ai", metering_degraded: false, reason: null };
}

function driftedFresh(state: { used_daily: number; last_reported_at: string | null } | null) {
  if (!state) return false; // no row yet is not a drift signal — see no_state path
  if (state.used_daily <= 0) return false;
  if (!state.last_reported_at) return true; // spend with no heartbeat => unknown
  return Date.now() - new Date(state.last_reported_at).getTime() > AI_METER_MAX_AGE_MS;
}

// ------------------------------------------------------------------
// The per-call handle. mode !== 'ai' => run() returns null and the CALLER goes
// deterministic-template (no LLM, no ledger, no debit).
// mode === 'ai' => run() debits the durable counter, then the LLM call, then the
// meter settles actual minus reserved. A refused/degraded debit returns null too
// (so this call degenerates to its template in the same direction, not a burn).
// ------------------------------------------------------------------
export interface AiCallHandle {
  mode: AiMode;
  metering_degraded: boolean;
  reason: string | null;
  run(promptText: string, opts?: { maxTokens?: number; temperature?: number; json?: boolean }): Promise<string | null>;
}

export async function openAiCall(
  db: Db,
  ctx: GateContext & { groqChat: (m: Array<{ role: string; content: string }>, o?: any) => Promise<string> },
  maxTokens = 1024,
): Promise<AiCallHandle> {
  // Emergency kill-switch: ai_quality.gate_enabled = false (glob/user/campaign,
  // most specific wins) bypasses the gate ENTIRELY — every call goes straight to
  // groqChat exactly as pre-Stage-7, with no reserve and no debit. One row flip
  // reverts every send; the gate is not consulted for a decision. (The
  // observational meter in groq.ts still records usage.) See §6.3.
  const bypass = await readConfig(db, ["ai_quality.gate_enabled"], {
    userId: ctx.userId ?? undefined,
    campaignId: ctx.campaignId ?? undefined,
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
            json: opts?.json,
            context: {
              fn: ctx.fn ?? "openAiCall",
              kind: ctx.kind,
              model: ctx.model,
              user_id: ctx.userId ?? undefined,
              campaign_id: ctx.campaignId ?? undefined,
              lead_id: ctx.leadId ?? undefined,
              decision_id: ctx.decisionId ?? undefined,
            },
          },
        );
      },
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
      if (reserve > (ctx.perCallGuard ?? AI_PER_CALL_GUARD)) return null; // single-call guard (→ template)
      let debit: any = null;
      try {
        const res = await db.rpc("ai_cost_debit", {
          p_profile_id: ctx.userId,
          p_debit: reserve,
          p_pool_daily: pool.daily,
          p_pool_monthly: pool.monthly,
        });
        debit = res.data;
      } catch {
        return null; // debit unreachable => conserve (never spend blind)
      }
      if (!debit?.ok) return null; // ceiling tripped on the durable counter
      try {
        const text = await ctx.groqChat(
          [{ role: "user", content: promptText }],
          {
            maxTokens: opts?.maxTokens ?? maxTokens,
            temperature: opts?.temperature,
            json: opts?.json,
            context: {
              fn: ctx.fn ?? "openAiCall",
              kind: ctx.kind,
              model: ctx.model,
              user_id: ctx.userId ?? undefined,
              campaign_id: ctx.campaignId ?? undefined,
              lead_id: ctx.leadId ?? undefined,
              decision_id: ctx.decisionId ?? undefined,
              reserve,
            },
          },
        );
        return text;
      } catch {
        return null; // LLM failure => caller's template path (abandoned reserve decays, safe)
      }
    },
  };
}

// ------------------------------------------------------------------
// The ANONYMOUS equivalent of openAiCall for the public support-chat widget.
// Guests have no profile → no ai_cost_state row, and no user/campaign scope for
// markers — only the glob markers apply, and the spend ceiling is the single-row
// global guest bucket (ai_cost_guest_debit, atomic, rollover-aware). Staleness
// comes from the bucket's OWN heartbeat (kept fresh by the cost-sweep) so a
// spent-unknown bucket conserves exactly like a user's column. The reserve is
// settled to ACTUAL by the meter (context.guest => ai_cost_guest_settle).
// mode !== 'ai' (or run() null) => the caller replies with a canned line — the
// visitor never sees an error, only a graceful pause.
// ------------------------------------------------------------------
export async function openGuestAiCall(
  db: Db,
  ctx: {
    kind: string;
    fn?: string;
    perCallGuard?: number;
    model?: string;
    groqChat: (m: Array<{ role: string; content: string }>, o?: any) => Promise<string>;
  },
  maxTokens = 1024,
): Promise<AiCallHandle> {
  const bypass = await readConfig(db, ["ai_quality.gate_enabled"], {});
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
            json: opts?.json,
            context: { fn: ctx.fn ?? "openGuestAiCall", kind: ctx.kind, model: ctx.model },
          },
        );
      },
    };
  }

  const cfg = await readConfig(db, ["ai_quality.mode", "ai_quality.metering_degraded"], {});
  const rawMode = String(cfg["ai_quality.mode"] ?? "").trim();
  if (rawMode === "hard_stop") return { mode: "hard_stop", metering_degraded: false, reason: "admin:hard_stop", run: async () => null };
  if (rawMode === "template") return { ...concede("admin:template"), run: async () => null };
  const metaDegraded = cfg["ai_quality.metering_degraded"] === true || cfg["ai_quality.metering_degraded"] === "true";

  let state: { used_daily: number; last_reported_at: string | null } | null = null;
  let stateReadFailed = false;
  try {
    const { data } = await db
      .from("ai_cost_guest_state")
      .select("used_daily_usd, last_reported_at")
      .eq("id", true)
      .maybeSingle();
    if (data) {
      state = {
        used_daily: Number(data.used_daily_usd ?? 0) || 0,
        last_reported_at: data.last_reported_at ? String(data.last_reported_at) : null,
      };
    }
  } catch {
    stateReadFailed = true;
  }

  if (stateReadFailed) return { ...concede("unreadable_state"), run: async () => null };
  if (metaDegraded || driftedFresh(state)) return { ...concede("metering_degraded"), run: async () => null };
  // No row yet (nothing spent) => allowed, mirroring the user-side no_state path.
  if (state && state.used_daily >= AI_GUEST_POOL_DAILY) return { ...concede("guest_daily_pool"), run: async () => null };

  return {
    mode: "ai",
    metering_degraded: metaDegraded,
    reason: null,
    async run(promptText, opts) {
      const reserve = reserveEstimate(promptText.length, opts?.maxTokens ?? maxTokens);
      if (reserve > (ctx.perCallGuard ?? AI_PER_CALL_GUARD)) return null;
      let debit: any = null;
      try {
        const res = await db.rpc("ai_cost_guest_debit", {
          p_debit: reserve,
          p_pool_daily: AI_GUEST_POOL_DAILY,
          p_pool_monthly: AI_GUEST_POOL_MONTHLY,
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
            json: opts?.json,
            context: {
              fn: ctx.fn ?? "openGuestAiCall",
              kind: ctx.kind,
              model: ctx.model,
              reserve,
              guest: true,
            },
          },
        );
        return text;
      } catch {
        return null;
      }
    },
  };
}