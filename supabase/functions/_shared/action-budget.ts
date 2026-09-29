/** Per-message and per-conversation ACTION caps for the assistant.
 *
 *  ai-cost-gate.ts already caps AI SPEND. It cannot cap STEPS: a loop of
 *  cheap, near-zero-cost actions (DB churn, repeated API calls, 5,000 wrong
 *  turns) never trips a dollar budget, so the run must be bounded separately.
 *
 *  This module is the step limiter. Two independent caps, because they catch
 *  different failures:
 *    - perMessage      one runaway request spinning forever
 *    - perConversation one long session drifting forever
 *
 *  On hitting either cap the caller MUST stop and ask the user to continue
 *  (see budgetPrompt) rather than silently proceeding or silently failing.
 *
 *  The decision logic is pure and Deno-free so it is unit-testable in plain
 *  Node against this exact file. Persistence is layered on top and is
 *  fail-safe: if the table is missing or unreachable we refuse to allow
 *  actions rather than allowing an unbounded run. */

export type BudgetReason = "ok" | "message_cap" | "conversation_cap" | "disabled";

export type ActionCaps = { perMessage: number; perConversation: number };

/** Per-plan step allowance. Deliberately far above what a normal request
 *  needs (a lead search is 1-2 actions) so the cap only ever trips on a loop. */
export const PLAN_ACTION_CAPS: Record<string, ActionCaps> = {
  free: { perMessage: 3, perConversation: 8 },
  starter: { perMessage: 5, perConversation: 20 },
  growth: { perMessage: 8, perConversation: 40 },
  agency: { perMessage: 12, perConversation: 80 },
};

/** Fallback for unknown/null plans — the free tier, not the most generous. */
export const DEFAULT_ACTION_CAPS: ActionCaps = PLAN_ACTION_CAPS.free;

export function actionCaps(plan?: string | null): ActionCaps {
  return PLAN_ACTION_CAPS[String(plan ?? "").toLowerCase()] ?? DEFAULT_ACTION_CAPS;
}

export type ActionBudgetState = {
  messageId: string | null;
  usedInMessage: number;
  usedInConversation: number;
};

export type ActionDecision = {
  allowed: boolean;
  reason: BudgetReason;
  limits: ActionCaps;
  used: { inMessage: number; inConversation: number };
  remaining: { inMessage: number; inConversation: number };
  /** The state to persist. Unchanged when the action was refused. */
  state: ActionBudgetState;
};

export function emptyActionState(): ActionBudgetState {
  return { messageId: null, usedInMessage: 0, usedInConversation: 0 };
}

/** A new user message resets only the per-message counter; the conversation
 *  counter keeps climbing, which is the whole point of having both. */
export function beginMessage(state: ActionBudgetState, messageId: string): ActionBudgetState {
  if (state.messageId === messageId) return state;
  return { messageId, usedInMessage: 0, usedInConversation: state.usedInConversation };
}

/** Pure decision: may one more action run right now? */
export function consumeAction(
  state: ActionBudgetState,
  plan?: string | null,
  disabled = false,
): ActionDecision {
  const limits = actionCaps(plan);
  const remaining = {
    inMessage: Math.max(0, limits.perMessage - state.usedInMessage),
    inConversation: Math.max(0, limits.perConversation - state.usedInConversation),
  };
  const used = { inMessage: state.usedInMessage, inConversation: state.usedInConversation };
  const done = (
    allowed: boolean,
    reason: BudgetReason,
    next: ActionBudgetState,
  ): ActionDecision => ({
    allowed,
    reason,
    limits,
    used,
    remaining,
    state: next,
  });

  if (disabled) return done(false, "disabled", state);
  if (state.usedInMessage >= limits.perMessage) return done(false, "message_cap", state);
  if (state.usedInConversation >= limits.perConversation)
    return done(false, "conversation_cap", state);

  const next: ActionBudgetState = {
    messageId: state.messageId,
    usedInMessage: state.usedInMessage + 1,
    usedInConversation: state.usedInConversation + 1,
  };
  return done(true, "ok", next);
}

/** The user-facing "stop and ask" text. The agent must say this and WAIT —
 *  it must not continue on its own and it must not treat a refusal as fatal. */
export function budgetPrompt(decision: ActionDecision): string {
  if (decision.allowed) return "";
  if (decision.reason === "disabled") {
    return "I can't take any actions right now. Please try again later.";
  }
  const used = decision.used.inMessage;
  const cap = decision.limits.perMessage;
  return `I've done ${used} ${used === 1 ? "action" : "actions"} for this request (limit ${cap}). Want me to continue?`;
}

// ---------------------------------------------------------------------------
// Persistence — layered on the pure logic above. Service role only; the edge
// functions hold the key. There is intentionally NO client-facing policy: a
// customer must never be able to read or inflate their own budget.
// ---------------------------------------------------------------------------

export type Db = {
  from: (t: string) => any;
};

const TABLE = "agent_action_state";

/** Reads the conversation's counters. A missing table or a read error yields a
 *  zeroed state ONLY when `strict` is false; the caller then decides. */
export async function readActionState(
  db: Db,
  conversationId: string,
): Promise<{ state: ActionBudgetState; readable: boolean }> {
  try {
    const { data, error } = await db
      .from(TABLE)
      .select("message_id, used_in_message, used_in_conversation")
      .eq("conversation_id", conversationId)
      .maybeSingle();
    if (error) return { state: emptyActionState(), readable: false };
    if (!data) return { state: emptyActionState(), readable: true };
    return {
      state: {
        messageId: (data.message_id as string | null) ?? null,
        usedInMessage: Number(data.used_in_message) || 0,
        usedInConversation: Number(data.used_in_conversation) || 0,
      },
      readable: true,
    };
  } catch {
    return { state: emptyActionState(), readable: false };
  }
}

export async function writeActionState(
  db: Db,
  conversationId: string,
  state: ActionBudgetState,
): Promise<boolean> {
  try {
    const { error } = await db.from(TABLE).upsert(
      {
        conversation_id: conversationId,
        message_id: state.messageId,
        used_in_message: state.usedInMessage,
        used_in_conversation: state.usedInConversation,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "conversation_id" },
    );
    return !error;
  } catch {
    return false;
  }
}

/** The single entry point the agent loop calls: begin a message (optional),
 *  then ask permission to run one action.
 *
 *  Fail-closed: if the counters cannot be read OR the updated state cannot be
 *  written, the action is REFUSED. An unpersistable counter is exactly the
 *  case where a runaway loop would be invisible, so it must not run. */
export async function requestAction(
  db: Db,
  opts: { conversationId: string; messageId?: string; plan?: string | null; disabled?: boolean },
): Promise<ActionDecision> {
  const limits = actionCaps(opts.plan);
  const disabled = opts.disabled === true;

  if (disabled) {
    return consumeAction(emptyActionState(), opts.plan, true);
  }

  const { state: read, readable } = await readActionState(db, opts.conversationId);
  if (!readable) {
    return consumeAction(
      { ...emptyActionState(), usedInMessage: limits.perMessage },
      opts.plan,
      false,
    );
  }

  const began = opts.messageId ? beginMessage(read, opts.messageId) : read;
  const decision = consumeAction(began, opts.plan, false);
  if (!decision.allowed) return decision;

  const saved = await writeActionState(db, opts.conversationId, decision.state);
  if (!saved) {
    // Counted-but-unrecorded: treat the cap as already reached so the run stops.
    return consumeAction({ ...began, usedInMessage: limits.perMessage }, opts.plan, false);
  }
  return decision;
}
