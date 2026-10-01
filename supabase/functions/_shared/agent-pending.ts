// ============================================================================
// Remembering what we were in the middle of.
//
// The agent asks "Which campaign should I add them to?" and the person
// answers "Q3 push". Without help, that answer looks like a brand-new message:
// the intent is gone and the "London dentists" filter is gone with it, so the
// request orphans and the agent starts guessing again.
//
// This module is the memory that stops that. It is deliberately tiny:
//
//   save   the intent + whatever slots we already had, when we ask
//   load   them back on the next message, if it is still fresh
//   clear  drop them as soon as the request completes or is abandoned
//
// Two rules keep this safe:
//
//  1. It NEVER widens what the agent may do. The stored intent is checked
//     against the same GOALS allowlist everything else uses, and a stale
//     entry simply does not load. A cached hint cannot invent a write.
//  2. It expires. An unanswered question from last week must not resurrect
//     itself, so anything older than PENDING_TTL_MINUTES is ignored and
//     cleaned up on sight.
// ============================================================================

import { GOAL_BY_INTENT, VALID_INTENTS, type AgentIntent, type AgentParams } from "./agent-capabilities.ts";
import { PENDING_TTL_MINUTES } from "./agent-executor.ts";

type Db = { from: (t: string) => any };

export type CarriedState = { intent: AgentIntent; params: AgentParams };

/** Only allowlisted intents may be remembered, and only their known slots. */
const ALLOWED_SLOTS = new Set<keyof AgentParams>([
  "city", "country", "company", "category", "campaignName", "query", "limit",
]);

function cleanParams(raw: unknown): AgentParams {
  const out: AgentParams = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const key = k as keyof AgentParams;
    if (!ALLOWED_SLOTS.has(key)) continue;
    if (key === "limit") {
      const n = Number(v);
      if (Number.isFinite(n)) out.limit = Math.max(1, Math.min(200, Math.trunc(n)));
    } else if (typeof v === "string") {
      const s = v.replace(/\s+/g, " ").trim().slice(0, 120);
      if (s) out[key] = s;
    }
  }
  return out;
}

/**
 * Remember a clarification we just asked. A no-op if the intent is not real,
 * so a hallucinated or stale intent can never be reintroduced later.
 */
export async function savePendingState(
  db: Db,
  userId: string,
  conversationId: string,
  intent: AgentIntent | null,
  params: AgentParams | null,
): Promise<void> {
  if (!intent || !VALID_INTENTS.includes(intent)) {
    await clearPendingState(db, userId, conversationId);
    return;
  }
  await db
    .from("agent_pending_state")
    .upsert(
      {
        conversation_id: conversationId,
        user_id: userId,
        intent,
        params: cleanParams(params),
        asked_at: new Date().toISOString(),
      },
      { onConflict: "user_id,conversation_id" },
    );
}

/**
 * Read the pending clarification, if there is a fresh one for this exact user
 * and conversation. Anything expired is deleted rather than returned.
 */
export async function loadPendingState(
  db: Db,
  userId: string,
  conversationId: string,
): Promise<CarriedState | null> {
  const { data } = await db
    .from("agent_pending_state")
    .select("intent, params, asked_at")
    .eq("conversation_id", conversationId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return null;

  const askedAt = Date.parse(String(data.asked_at ?? ""));
  const ageMs = Date.now() - (Number.isNaN(askedAt) ? 0 : askedAt);
  if (!Number.isFinite(askedAt) || ageMs > PENDING_TTL_MINUTES * 60_000) {
    await clearPendingState(db, userId, conversationId);
    return null;
  }

  const intent = String(data.intent ?? "") as AgentIntent;
  if (!VALID_INTENTS.includes(intent) || !GOAL_BY_INTENT.has(intent)) {
    await clearPendingState(db, userId, conversationId);
    return null;
  }
  return { intent, params: cleanParams(data.params) };
}

export async function clearPendingState(db: Db, userId: string, conversationId: string): Promise<void> {
  await db
    .from("agent_pending_state")
    .delete()
    .eq("conversation_id", conversationId)
    .eq("user_id", userId);
}

/**
 * Fold new slots into whatever is already remembered.
 *
 * Used when the agent asks a SECOND question about the same goal, so the
 * campaign name collected by the first question survives into the second.
 * When nothing is pending, this starts a fresh record, so callers do not need
 * to care whether this is a first question or a follow-up.
 */
export async function mergePendingParams(
  db: Db,
  userId: string,
  conversationId: string,
  params: AgentParams | null,
  intent?: AgentIntent | null,
): Promise<void> {
  const current = await loadPendingState(db, userId, conversationId);

  // Prefer a freshly-understood intent; otherwise keep the one we were on.
  const wantIntent = intent ?? current?.intent ?? null;
  if (!wantIntent || !VALID_INTENTS.includes(wantIntent)) {
    await clearPendingState(db, userId, conversationId);
    return;
  }

  const merged: AgentParams = { ...(current?.params ?? {}) };
  for (const [k, v] of Object.entries(params ?? {}) as [keyof AgentParams, unknown][]) {
    if (v === undefined || v === null || v === "") continue;
    (merged as Record<string, unknown>)[k] = v;
  }
  await savePendingState(db, userId, conversationId, wantIntent, merged);
}