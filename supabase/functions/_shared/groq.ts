import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const DEFAULT_MODEL = Deno.env.get("GROQ_MODEL") ?? "openai/gpt-oss-120b";
// TPM-budget escape hatches: when the primary model's token-per-minute pool is
// exhausted (429), retry the SAME prompt on a model with its OWN per-model TPM
// pool. Groq rate-limits per API key AND per model, so a burst on gpt-oss-120b
// (free tier 8K TPM) can be re-sent to gpt-oss-20b (its own 8K TPM window) on
// any of the other healthy keys — effectively multiplying the budget across
// keys and models. Only models PROBED to exist on this account are listed.
const MODEL_FALLBACKS = (Deno.env.get("GROQ_MODEL_FALLBACKS") ?? "openai/gpt-oss-20b")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// Metered AI spend (INTELLIGENCE-LAYER-DESIGN.md §6.1). Token prices are ENV-
// configurable so rate changes never need a deploy; defaults are the gpt-oss-120b
// ballpark. Every LLM call crosses groqChat -> exactly one ai_spend_ledger row.
const AI_COST_PER_1M_IN = Number(Deno.env.get("AI_COST_PER_1M_IN") ?? "0.20");
const AI_COST_PER_1M_OUT = Number(Deno.env.get("AI_COST_PER_1M_OUT") ?? "0.80");
const METER_BUFFER_MAX = 500;

export interface MeterContext {
  /** Caller for attribution: send-worker / inbox-agent / send-reply / lead-ai / … */
  fn?: string;
  /** gen_email | gen_followup | reply_draft | classify | draft | escalate | reply | discovery | … */
  kind?: string;
  user_id?: string;
  campaign_id?: string;
  lead_id?: string;
  decision_id?: string;
  /** Anonymous-visitor call (support-chat guest bucket): settle ai_cost_guest_state
   *  instead of a per-user ai_cost_state row (guests have no profile id). */
  guest?: boolean;
  /** Up-front reservation (USD) the durable counter was debited by; the meter
   *  settles actual spend minus this. Only set by gated calls (openAiCall). */
  reserve?: number;
  /** Per-call model override. The support-chat widget ships a ~4.5K-token prompt,
   *  so it opts into groq/compound (70K TPM) instead of gpt-oss-120b's tiny 8K
   *  free-tier TPM window — quality is frontier-level and bursts stop 429ing. */
  model?: string;
}

interface LedgerRow {
  fn: string;
  kind: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  est_cost_usd: number;
  user_id: string | null;
  campaign_id: string | null;
  lead_id: string | null;
  decision_id: string | null;
  model_version: string | null;
}

function estimateCost(inTokens: number, outTokens: number): number {
  const usd = (inTokens * AI_COST_PER_1M_IN + outTokens * AI_COST_PER_1M_OUT) / 1_000_000;
  return Math.round(usd * 1_000_000) / 1_000_000; // 6dp precision
}

let meterAdmin: ReturnType<typeof createClient<any>> | null = null;
let meterPending: LedgerRow[] = [];
let meterDropped = 0;
let meterWarned = false;

function meterDb() {
  if (meterAdmin) return meterAdmin;
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return null;
  meterAdmin = createClient(url, key, { auth: { persistSession: false } });
  return meterAdmin;
}

// Fire-and-forget; never blocks the send path. On failure the row is buffered
// (capped) and ONE visible ai.metering.degraded audit row is written on the next
// success — degraded metering is never silent (§6.1/§6.6). A toast-worthy
// last_reported_at staleness tripwire is the system-level backstop.
// When `settle` is set (a gated call that reserved up front), the counter is
// settled to ACTUAL (reserved + settleDelta) so the durable ceiling converges to
// true spend each call — abandoned reserves only decay by window rollover.
async function recordMeter(
  row: LedgerRow,
  settle?: { userId?: string; delta: number; guest?: boolean },
): Promise<void> {
  const db = meterDb();
  if (!db) {
    if (meterPending.length < METER_BUFFER_MAX) meterPending.push(row);
    else meterDropped++;
    return;
  }
  try {
    await db.from("ai_spend_ledger").insert(row);
    if (settle) {
      if (settle.guest) {
        db.rpc("ai_cost_guest_settle", { p_delta: settle.delta }).then(
          () => {},
          () => {},
        );
      } else {
        db.rpc("ai_cost_settle", {
          p_profile_id: settle.userId,
          p_delta: settle.delta,
        }).then(
          () => {},
          () => {},
        );
      }
    }
    const buffered = meterPending;
    if (buffered.length > 0 || meterDropped > 0) {
      meterPending = [];
      const dropped = meterDropped;
      meterDropped = 0;
      db.from("audit_events")
        .insert({
          user_id: row.user_id ?? null,
          campaign_id: row.campaign_id ?? null,
          lead_id: row.lead_id ?? null,
          event: "ai.metering.degraded",
          payload: { unreported_calls: buffered.length, dropped, recovered: true },
          decision_id: row.decision_id ?? null,
          model_version: "meter/v1",
          strategy_ref: null,
        })
        .then(
          () => {},
          () => {},
        );
    }
    if (!meterWarned) {
      meterWarned = true;
      console.warn("[meter] ai_spend_ledger flush recovered");
    }
  } catch {
    if (meterPending.length < METER_BUFFER_MAX) meterPending.push(row);
    else meterDropped++;
    if (!meterWarned) {
      meterWarned = true;
      console.warn(
        "[meter] ai_spend_ledger write failed — rows buffered; metering degraded is visible via ai.metering.degraded + last_reported_at staleness (conserve, don't spend blind)",
      );
    }
  }
}

/**
 * The models this deployment will actually try, primary first. Exported so
 * health-check can report the pool without redeploying to inspect config.
 */
export function groqModels(primary?: string): string[] {
  return [primary ?? Deno.env.get("GROQ_MODEL") ?? DEFAULT_MODEL, ...MODEL_FALLBACKS];
}

export function groqKeys(): string[] {
  return (Deno.env.get("GROQ_API_KEYS") ?? Deno.env.get("GROQ_API_KEY") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

// ── Healthy-key pool ───────────────────────────────────────────
// A key that returns 429/5xx is parked in cooldown (default 60s) so a single
// hot/rate-limited key never blocks a reply: every send picks RANDOMLY among
// the keys that are currently healthy, so load spreads across ALL configured
// keys instead of a round-robin cursor that a throttled key can monopolize.
const KEY_COOLDOWN_MS = Number(Deno.env.get("GROQ_KEY_COOLDOWN_MS") ?? `${60_000}`);

interface KeyState {
  coolUntil: number; // epoch ms; 0 = healthy
}

const keyStates = new Map<string, KeyState>();

let keyCursor = 0;

function healthyKeys(keys: string[]): string[] {
  const now = Date.now();
  return keys.filter((k) => (keyStates.get(k)?.coolUntil ?? 0) <= now);
}

function pickKey(keys: string[]): string {
  const healthy = healthyKeys(keys);
  const pool = healthy.length > 0 ? healthy : keys; // all parked → reuse soonest-expiring one
  return pool[Math.floor(Math.random() * pool.length)];
}

function parkKey(key: string, retryAfterSec: number | null): void {
  const delay =
    retryAfterSec && Number.isFinite(retryAfterSec) && retryAfterSec > 0
      ? Math.min(retryAfterSec, 300) * 1000
      : KEY_COOLDOWN_MS;
  keyStates.set(key, { coolUntil: Date.now() + delay });
}

export async function groqChat(
  messages: Array<{ role: string; content: string }>,
  opts?: {
    maxTokens?: number;
    temperature?: number;
    /** Ask the provider for a JSON object. Used where the caller parses a
     *  contract (the fact writer), because a free-form reply cannot be
     *  enforced and would be silently discarded. */
    json?: boolean;
    context?: MeterContext;
  },
): Promise<string> {
  const keys = groqKeys();
  if (keys.length === 0) throw new Error("No GROQ API keys configured");
  // models = [primary (per-call override or default), fallback1, fallback2...];
  // keys = [key1...]. The override lets a call site (support-chat) pick a model
  // with a bigger TPM pool while every other surface keeps DEFAULT_MODEL.
  const primary = opts?.context?.model ?? DEFAULT_MODEL;
  const models = groqModels(primary);
  // Up to 2 passes over every (key × model) pair so a burst still eventually
  // completes once any pool frees up. Capped hard so we never loop forever.
  const maxTries = Math.max(6, Math.min(keys.length * models.length * 2, 16));
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < maxTries; attempt++) {
    const key = pickKey(keys);
    const model = models[keyCursor % models.length];
    keyCursor++;
    try {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model,
          messages,
          max_tokens: opts?.maxTokens ?? 1024,
          temperature: opts?.temperature,
          ...(opts?.json ? { response_format: { type: "json_object" } } : {}),
          // Reasoning models spend budget thinking first — cap it so answers survive
          reasoning_effort: "low",
        }),
      });
      if (res.status === 429 || res.status >= 500) {
        // Park THIS key so it cools down while the other keys absorb load; honor
        // a Retry-After when provided. Rotating the model too lets us cross into
        // a separate, larger TPM pool instead of stalling on the primary model.
        const retryAfterRaw = res.headers.get("retry-after") ?? "";
        const retryAfter = Number(retryAfterRaw);
        parkKey(key, Number.isFinite(retryAfter) && retryAfterRaw !== "" ? retryAfter : null);
        lastErr = new Error(`AI busy (${res.status}) on ${model}`);
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
        continue;
      }
      if (!res.ok) {
        console.error("[groq] error:", res.status, await res.text());
        throw new Error("AI service temporarily unavailable");
      }
      const data = await res.json();
      const msg = data?.choices?.[0]?.message ?? {};
      // Reasoning models sometimes put everything in `reasoning` with empty content
      let text = String(msg.content ?? "");
      if (!text.trim() && typeof msg.reasoning === "string") text = msg.reasoning;
      // Some models wrap thoughts in tags or code fences — strip both
      text = text
        .replace(/ thinking[\s\S]*?<\/think>/g, "")
        .replace(/```json|```/g, "")
        .trim();
      // Meter (fire-and-forget, never blocks the response): capture usage that was
      // previously discarded and write the spend ledger row. Gated calls (reserve
      // set) additionally settle the durable counter to ACTUAL (reserve + delta).
      const ctx = opts?.context ?? {};
      const u = data?.usage ?? {};
      const inTokens = Math.max(0, Number(u?.input_tokens ?? u?.prompt_tokens ?? 0) || 0);
      const outTokens = Math.max(0, Number(u?.output_tokens ?? u?.completion_tokens ?? 0) || 0);
      recordMeter(
        {
          fn: ctx.fn ?? "unknown",
          kind: ctx.kind ?? "generic",
          model,
          input_tokens: inTokens,
          output_tokens: outTokens,
          est_cost_usd: estimateCost(inTokens, outTokens),
          user_id: ctx.user_id ?? null,
          campaign_id: ctx.campaign_id ?? null,
          lead_id: ctx.lead_id ?? null,
          decision_id: ctx.decision_id ?? null,
          model_version: null,
        },
        ctx.reserve != null && (ctx.user_id || ctx.guest)
          ? {
              userId: String(ctx.user_id ?? ""),
              delta: estimateCost(inTokens, outTokens) - Number(ctx.reserve),
              guest: ctx.guest,
            }
          : undefined,
      ).catch(() => {});
      return text;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("AI service temporarily unavailable");
}

/** Pulls the first JSON object/array out of an LLM response. */
export function extractJson<T>(text: string): T | null {
  const objStart = text.indexOf("{");
  const arrStart = text.indexOf("[");
  const start = arrStart !== -1 && (arrStart < objStart || objStart === -1) ? arrStart : objStart;
  if (start === -1) return null;
  const endCurly = text.lastIndexOf("}");
  const endSquare = text.lastIndexOf("]");
  const end = Math.max(endCurly, endSquare);
  if (end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}

/** Re-exported so existing `from "./groq.ts"` importers keep working. */
export { sanitizeForPrompt } from "./sanitize.ts";
