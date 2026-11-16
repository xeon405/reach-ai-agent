// ============================================================================
// The fast lane: learned vocabulary.
//
// One function answers "what did this account teach us about these words?"
// and another records the outcome so the next time costs nothing.
//
// The promotion rule is the important part: a phrase only becomes account-wide
// after being used in a SECOND, DIFFERENT conversation. Repeating it fifty
// times in one chat proves nothing about how a team talks, and must not turn
// one person's phrasing into everyone else's problem.
// ============================================================================

import type { AgentIntent, AgentParams } from "./agent-capabilities.ts";
import { fixTypos } from "./typos.ts";

type Db = { from: (t: string) => any };

export const ACCOUNT_SCOPE = "*";

export type LearnedRow = {
  id: number;
  scope: string;
  phrase: string;
  intent: AgentIntent;
  params: AgentParams;
  state: "provisional" | "account" | "retired";
  uses: number;
  correct: number;
};

/** Canonical form so punctuation, case and extra spaces never cause a miss. */
export function phraseKey(msg: string): string {
  // Same typo pass as the router, so a phrase learned from "pase my campain"
  // is stored and looked up as "pause my campaign" instead of needing a second
  // model call for every spelling.
  return fixTypos(msg)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

/** Short greetings and confirmations must never be learned as an intent. */
const NOT_LEARNABLE = new Set([
  "yes", "no", "y", "n", "ok", "okay", "sure", "thanks", "thank you", "hi", "hello",
  "hey", "yes please", "no thanks", "do it", "go ahead", "confirm", "cancel", "stop",
  "what can you do", "what can you do?", "help", "help me", "who are you", "what are you",
]);

export function isLearnable(phrase: string): boolean {
  if (phrase.length < 4) return false;
  if (NOT_LEARNABLE.has(phrase)) return false;
  return phrase.split(" ").length >= 2;
}

/**
 * Look for a learned mapping. Account-wide wins over this conversation's own, so
 * a team habit always beats a single person's guess.
 */
export async function recall(db: Db, userId: string, phrase: string, conversationId: string | null): Promise<LearnedRow | null> {
  if (!isLearnable(phrase)) return null;
  const scopes = conversationId ? [ACCOUNT_SCOPE, conversationId] : [ACCOUNT_SCOPE];
  const { data, error } = await db
    .from("agent_learned_phrases")
    .select("id, scope, phrase, intent, params, state, uses, correct")
    .eq("user_id", userId)
    .eq("phrase", phrase)
    .in("scope", scopes)
    .neq("state", "retired")
    .limit(2);
  if (error || !data || data.length === 0) return null;
  // Rank in code rather than in SQL. Ordering by scope in Postgres sorts '*'
  // last (ASCII 42 sorts below any hex character a UUID can start with), so
  // DESC actually handed the CHAT-LOCAL row the win - the opposite of what a
  // team habit should do. Being explicit here also documents the rule.
  const rows = data as LearnedRow[];
  return rows.find((r) => r.scope === ACCOUNT_SCOPE) ?? rows[0] ?? null;
}

/**
 * Find any live row for this phrase, whatever scope it lives in.
 *
 * recall() deliberately will not return another conversation's provisional row
 * (that phrasing was never proven to be a team habit), but recordUse() must
 * still be able to FIND it. This is the lookup that lets a phrase first heard
 * in one chat be promoted when it turns up again in another.
 */
async function findAnyLive(db: Db, userId: string, phrase: string): Promise<LearnedRow | null> {
  const { data, error } = await db
    .from("agent_learned_phrases")
    .select("id, scope, phrase, intent, params, state, uses, correct")
    .eq("user_id", userId)
    .eq("phrase", phrase)
    .neq("state", "retired")
    .limit(5);
  if (error || !data || data.length === 0) return null;
  const rows = data as LearnedRow[];
  return rows.find((r) => r.scope === ACCOUNT_SCOPE) ?? rows[0] ?? null;
}

/**
 * Record a successful use.
 *
 * On first hearing we store it as provisional, scoped to the chat that taught
 * it. When it is later used from a DIFFERENT conversation we promote it to
 * account-wide, because that is the only evidence that it is not just one
 * person's habit.
 */
export async function recordUse(
  db: Db,
  userId: string,
  phrase: string,
  intent: AgentIntent,
  params: AgentParams,
  conversationId: string | null,
  row: LearnedRow | null,
): Promise<void> {
  // Learning is an optimisation, never a correctness requirement. If the table
  // is missing or the write fails, the answer the user got is still correct -
  // it just cost a model call next time. So never let this throw.
  try {
    await recordUseInner(db, userId, phrase, intent, params, conversationId, row);
  } catch (e) {
    console.warn("[agent] learning write skipped:", e instanceof Error ? e.message : e);
  }
}

async function recordUseInner(
  db: Db,
  userId: string,
  phrase: string,
  intent: AgentIntent,
  params: AgentParams,
  conversationId: string | null,
  row: LearnedRow | null,
): Promise<void> {
  if (!isLearnable(phrase)) return;
  const scope = conversationId ?? ACCOUNT_SCOPE;

  if (!row) {
    // The caller had no fast-lane hit, so the SLOW lane (the model) just
    // resolved this phrase. That is the moment worth recording. If the phrase
    // already exists as a provisional row from a DIFFERENT conversation, this
    // is the independent second sighting that promotes it - so look it up
    // across all scopes rather than blindly inserting a duplicate.
    const existing = conversationId ? await findAnyLive(db, userId, phrase) : null;
    if (existing && existing.state === "provisional" && existing.scope !== conversationId) {
      await db
        .from("agent_learned_phrases")
        .update({ scope: ACCOUNT_SCOPE, state: "account", uses: existing.uses + 1, correct: existing.correct + 1, last_used_at: new Date().toISOString() })
        .eq("id", existing.id)
        .eq("user_id", userId);
      return;
    }
    if (existing) {
      await db
        .from("agent_learned_phrases")
        .update({ uses: existing.uses + 1, correct: existing.correct + 1, last_used_at: new Date().toISOString() })
        .eq("id", existing.id)
        .eq("user_id", userId);
      return;
    }
    await db.from("agent_learned_phrases").upsert(
      {
        user_id: userId,
        scope,
        phrase,
        intent,
        params,
        state: scope === ACCOUNT_SCOPE ? "account" : "provisional",
        uses: 1,
        correct: 1,
      },
      { onConflict: "user_id,scope,phrase" },
    );
    return;
  }

  const promotes = row.state === "provisional" && row.scope !== scope;
  await db
    .from("agent_learned_phrases")
    .update({
      uses: row.uses + 1,
      correct: row.correct + 1,
      last_used_at: new Date().toISOString(),
      ...(promotes ? { scope: ACCOUNT_SCOPE, state: "account" } : {}),
    })
    .eq("id", row.id)
    .eq("user_id", userId);
}

/**
 * Retired because it was wrong. Kept, not deleted, so the user can see what the
 * agent mislearned and correct the record.
 */
export async function retire(db: Db, userId: string, phrase: string, conversationId: string | null): Promise<void> {
  if (!isLearnable(phrase)) return;
  try {
    const q = db
      .from("agent_learned_phrases")
      .update({ state: "retired" })
      .eq("user_id", userId)
      .eq("phrase", phrase)
      .neq("state", "retired");
    if (conversationId) await q.eq("scope", conversationId);
    else await q;
  } catch (e) {
    // Best-effort, same reasoning as recordUse: a stale fast-lane mapping that
    // fails to retire costs one wrong-but-confirmed result, not a broken chat.
    console.warn("[agent] learning retire skipped:", e instanceof Error ? e.message : e);
  }
}

/**
 * Retire the most recently used phrase in this conversation.
 *
 * This is the "the user got confused" signal. When the model cannot follow the
 * user's follow-up, the likeliest explanation is that the fast lane answered
 * the previous turn in a way the user did not recognise as their own question,
 * so that mapping goes back to being understood from meaning.
 *
 * Note what is deliberately NOT a retirement signal: an empty result. A fresh
 * account returns "you have no campaigns yet" for perfectly correct requests,
 * so retiring on empty would throw away every phrase a new user ever learns.
 */
export async function retireLastUsed(db: Db, userId: string, conversationId: string): Promise<void> {
  try {
    const { data } = await db
      .from("agent_learned_phrases")
      .select("id")
      .eq("user_id", userId)
      .eq("scope", conversationId)
      .neq("state", "retired")
      .order("last_used_at", { ascending: false })
      .limit(1);
    const id = (data ?? [])[0]?.id;
    if (!id) return;
    await db.from("agent_learned_phrases").update({ state: "retired" }).eq("id", id).eq("user_id", userId);
  } catch (e) {
    console.warn("[agent] learning confusion-retire skipped:", e instanceof Error ? e.message : e);
  }
}

export async function listLearned(db: Db, userId: string) {
  const { data, error } = await db
    .from("agent_learned_phrases")
    .select("id, scope, phrase, intent, params, state, uses, correct, last_used_at")
    .eq("user_id", userId)
    .order("last_used_at", { ascending: false })
    .limit(200);
  // Best-effort: if the table is not there yet, the account simply has no
  // learned phrases. Never 500 a chat request over a missing fast lane.
  if (error) return [] as LearnedRow[];
  return (data ?? []) as LearnedRow[];
}

export async function forget(db: Db, userId: string, id: number): Promise<void> {
  const { error } = await db.from("agent_learned_phrases").delete().eq("id", id).eq("user_id", userId);
  if (error) throw new Error(error.message);
}

/** What the agent believes, ready to show the user. */
export function describeLearned(rows: LearnedRow[]) {
  return rows.map((r) => ({
    id: r.id,
    phrase: r.phrase,
    intent: r.intent,
    state: r.state,
    scope: r.scope === ACCOUNT_SCOPE ? "everyone on this account" : "this chat only",
    uses: r.uses,
    correct: r.correct,
  }));
}
