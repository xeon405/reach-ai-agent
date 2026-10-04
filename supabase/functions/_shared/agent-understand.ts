// ============================================================================
// The slow lane: understanding.
//
// This runs ONLY when the fast lane misses, so it is allowed to be as flexible
// as it likes. It is deliberately permitted to do the thing the old router made
// impossible: answer a question in plain words without choosing any intent.
//
// Four outcomes:
//   chat     just reply. No data touched. This is what makes it a chatbot.
//   read     run a read-only goal
//   write    a change; the caller must still get a human yes
//   ask      a required slot is missing, so ask about THAT and stop
//   unclear  genuinely ambiguous; offer a guess and let the person correct it
//
// Whatever the model returns is re-validated against GOALS. A goal that does
// not exist, or a write wearing a read's name, is discarded - understanding is
// creative, execution is not.
// ============================================================================

// The groq import is DYNAMIC so this module stays loadable (and testable) in
// plain Node, which cannot resolve the https specifier. Only understand() needs
// the network, and the test suite never calls it.
import { sanitizeForPrompt } from "./sanitize.ts";
import {
  GOALS, GOAL_BY_INTENT, VALID_INTENTS, isWriteIntent, missingSlots, slotQuestion,
  type AgentIntent, type AgentParams, type AgentRequest,
} from "./agent-capabilities.ts";

export const MAX_HISTORY = 12;

export type HistoryTurn = { role: "user" | "assistant"; content: string };

/** A clarification from a previous turn that this message is probably answering. */
export type Carried = { intent: AgentIntent | null; params: AgentParams };

export type Understanding =
  | { kind: "chat"; reply: string }
  | { kind: "read"; req: AgentRequest }
  | { kind: "write"; req: AgentRequest }
  | { kind: "ask"; question: string; intent: AgentIntent; params: AgentParams }
  | { kind: "unclear"; question: string; guess?: AgentIntent }
  /**
   * They told us something about themselves or their business. Reply
   * naturally AND return the facts, so one call both answers and remembers.
   */
  | { kind: "profile"; reply: string; facts: ProfileFacts };

import { mergeParams } from "./agent-capabilities.ts";
import { cleanFacts, renderProfile, type Profile, type ProfileFacts } from "./agent-profile.ts";
import { backfillSlots } from "./agent-slots.ts";
import type { AgentAccountContext } from "./agent-account-context.ts";

const PARAM_KEYS = new Set<keyof AgentParams>(["city", "country", "company", "category", "campaignName", "query", "limit"]);
const NUMERIC = new Set<keyof AgentParams>(["limit"]);

/** Coerce model params into the exact shape the executor accepts. */
function sanitizeParams(raw: unknown): AgentParams {
  const out: AgentParams = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const key = k as keyof AgentParams;
    if (!PARAM_KEYS.has(key)) continue;
    if (NUMERIC.has(key)) {
      const n = Number(v);
      if (Number.isFinite(n)) (out as Record<string, unknown>)[key] = Math.max(1, Math.min(200, Math.trunc(n)));
    } else if (typeof v === "string") {
      const s = v.replace(/\s+/g, " ").trim().slice(0, 120);
      if (s) (out as Record<string, unknown>)[key] = s;
    }
  }
  return out;
}

/**
 * Turn the model's raw JSON into a validated Understanding, or null.
 * Every branch re-checks intent, params and write-ness against GOALS so a
 * malformed or adversarial reply cannot widen what the agent may do.
 */
export function parseUnderstanding(
  raw: string,
  message = "",
): { u: Understanding | null; cachedIntent: AgentIntent | null; cachedParams: AgentParams } | null {
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return null;
  let o: Record<string, unknown>;
  try {
    o = JSON.parse(m[0]);
  } catch {
    return null;
  }

  const kind = String(o.kind ?? "").toLowerCase();
  const intent = String(o.intent ?? "") as AgentIntent;
  const params = sanitizeParams(o.params);
  const valid = VALID_INTENTS.includes(intent);
  const summary = typeof o.summary === "string" ? o.summary.trim().slice(0, 200) : "";

  // Pure conversation. The whole point: no intent required.
  if (kind === "chat") {
    const reply = typeof o.reply === "string" ? o.reply.trim().slice(0, 1200) : "";
    if (reply) return { u: { kind: "chat", reply }, cachedIntent: null, cachedParams: {} };
    return null;
  }

  if (kind === "unclear") {
    const question = typeof o.question === "string" ? o.question.trim().slice(0, 400) : "";
    return {
      u: {
        kind: "unclear",
        question: question || "I did not catch that. Could you say it another way?",
        guess: valid ? intent : undefined,
      },
      cachedIntent: null,
      cachedParams: {},
    };
  }

  if (kind === "profile") {
    // A reply is required - without one this turn would answer nothing. Facts
    // are best-effort: losing a field is survivable, losing the reply is not.
    const reply = typeof o.reply === "string" ? o.reply.trim().slice(0, 400) : "";
    const facts = cleanFacts(o.facts);
    if (!reply) return null;
    return {
      u: { kind: "profile", reply, facts },
      cachedIntent: null,
      cachedParams: {},
    };
  }

  if (kind === "ask") {
    // A clarifying question is still useful even if the model forgot to name
    // the intent, so don't throw the whole turn away over a missing field.
    if (!valid) {
      const question = typeof o.question === "string" ? o.question.trim().slice(0, 400) : "";
      return {
        u: { kind: "unclear", question: question || "I did not catch that. Could you say it another way?" },
        cachedIntent: null,
        cachedParams: {},
      };
    }
    // Backfill here too, not only on the goal branch. When the model asks its
    // own clarifying question it hands us the slots it already read, and that
    // is exactly where "London" was being dropped - the ask was saved with no
    // city, so the follow-up ("Spring Sale") lost the original request.
    const askParams = backfillSlots(message, params);
    const goal = GOAL_BY_INTENT.get(intent)!;
    const slots = missingSlots(goal, askParams);
    const question =
      typeof o.question === "string" && o.question.trim()
        ? o.question.trim().slice(0, 400)
        : slotQuestion(intent, slots.length ? slots : goal.needs);
    // Keep the slots on the ask branch. Returning {} here used to drop "London"
    // on the floor, and the person's next message then had nothing to complete.
    return { u: { kind: "ask", question, intent, params: askParams }, cachedIntent: intent, cachedParams: askParams };
  }

  if (kind === "ask" || kind === "unclear") return null;

  // From here on we are executing something, so the intent must be real.
  if (!valid) return null;
  const goal = GOAL_BY_INTENT.get(intent)!;

  // A goal with a required slot still unfilled becomes a question, not a guess.
  // Backfill first: if the person DID say the city and only the model dropped
  // it, there is nothing left to ask about.
  const params2 = backfillSlots(message, params);
  const gaps = missingSlots(goal, params2);
  if (gaps.length) {
    return {
      u: { kind: "ask", question: slotQuestion(intent, gaps), intent, params: params2 },
      cachedIntent: intent,
      cachedParams: params2,
    };
  }

  const req: AgentRequest = { intent, params: params2, summary: summary || goal.goal };
  return {
    u: { kind: isWriteIntent(intent) ? "write" : "read", req },
    cachedIntent: intent,
    cachedParams: params2,
  };
}

function buildPrompt(
  message: string,
  history: HistoryTurn[],
  carried?: Carried,
  profile?: Profile | null,
  accountCtx?: AgentAccountContext | null,
): string {
  const goals = GOALS.map((g) => {
    const needs = g.needs.length ? `needs: ${g.needs.join(", ")}` : "needs: nothing";
    return [
      `- ${g.intent} (${g.write ? "CHANGES THINGS" : "read only"})`,
      `  goal: ${g.goal}`,
      `  ${needs}`,
      `  e.g. ${g.examples.map((e) => `"${e}"`).join(" / ")}`,
    ].join("\n");
  }).join("\n");

  const convo = history.length
    ? history.map((h) => `${h.role === "user" ? "Them" : "Assistant"}: ${sanitizeForPrompt(h.content, 400)}`).join("\n")
    : "(first message)";

  // What we were in the middle of, if we asked something last turn. Without
  // this the model sees "Q3 push" with no idea it was answering a question,
  // and re-guesses from scratch.
  const resume = carried?.intent
    ? [
        `intent: ${carried.intent}`,
        `already known: ${JSON.stringify(carried.params ?? {})}`,
        "This person is answering your previous question, not starting over. Fill in the "
          + "missing slot. Keep the details you already know - do NOT discard them, and do "
          + "NOT ask again for something already listed as known. If their answer fills the "
          + "last gap, return read/write for that intent using ALL of the known params.",
      ].join("\n")
    : "";

  const profileBlock = renderProfile(profile);

  return `You are Reach, the assistant built into the Reach cold-email platform (out-ship.com). Answer questions about yourself from this: you help run cold-email campaigns using the account's real data, your name is Reach.

Read what the person MEANS, not which words they used. Phrasings vary wildly - "I need more people to email", "get me leads" and "I'm running dry" can all mean the same goal.
${accountCtx?.account ? "\n" + accountCtx.account + "\n" : ""}
${accountCtx?.business ? "\n" + accountCtx.business + "\n" : ""}
${profileBlock ? "\n" + profileBlock + "\n" : ""}
## kind:"chat"
Use this for greetings, thanks, small talk, questions about you or your capabilities, and general cold-email advice. Reply in their language, 1-3 short sentences, plain words, no markdown or bullet lists.

FACTS YOU ALREADY HAVE - answer from these instead of choosing a goal. If THEIR ACCOUNT or BUSINESS CONTEXT above already contains the answer, reply with it directly as chat. Choosing a goal here makes the agent run a lookup for something it already holds, and produces wrong or evasive replies.
- "who am I", "what's my name", "what do I do", "what do I sell", "who do I target" -> the BUSINESS CONTEXT and WHO THEY ARE lines
- "how many leads/campaigns do I have", "how much have I sent", "am I on plan X" -> the THEIR ACCOUNT numbers
- If a number they want is genuinely NOT in those blocks, use the matching goal to look it up. Never estimate, and never answer a number that is not there.

## kind:"profile"
Use this the moment they describe themselves or their business - ownership, website, product, customer, or goals ("I own...", "my business is...", "we sell...", "our customers are...", "I want to use cold email to..."). Describe yourself or your business and you MUST use this kind, not chat.

Reply {"kind":"profile","reply":"...","facts":{"business_name":"...","website":"...","product":"...","audience":"...","goals":"...","notes":"..."}}

Copy every fact they gave into "facts" in their own words; omit keys you have nothing for. Then reply in 1-3 sentences: acknowledge their business in your own words and ask ONE useful follow-up about their ideal customer or their main obstacle. Do NOT ask them to name a campaign. If they also explicitly asked for an action, do the action with read/write instead.

## kind:"read" / kind:"write"
{"kind":"read","intent":"...","params":{}}
{"kind":"write","intent":"...","params":{},"summary":"what you will do, in plain words"}
"write" is ONLY for changing their account. Never label a read as a write to seem helpful, and never the reverse. Use suggest_targeting ONLY when they are choosing an audience or asking who to email next - not for any question that merely mentions people or emails.

## If a required slot is missing
Reply {"kind":"ask","intent":"...","params":{...},"question":"..."} naming the goal and asking ONLY for the missing part. "intent" is REQUIRED so we remember the goal once they answer. "params" must repeat EVERY slot you already learned from this same message (for example city:"London" if they said London) - leave out only what you are asking about. Returning empty "params" loses everything they already told you.

## If you genuinely cannot tell
Reply {"kind":"unclear","question":"...","guess":"...optional intent"}
Prefer asking over guessing. A wrong guess either annoys them or, worse, acts on the wrong account.

## Allowed params
city, country, company, category, campaignName, query, limit (1-200). Include a slot only if the person actually said it or clearly implied it.

## Recent conversation
${convo}
${carried ? "\n## Answering a question I just asked\n" + resume + "\n" : ""}
## Now handle this message
Person: ${sanitizeForPrompt(message, 2000)}

## Referencing things with words like "it", "that one", "the same"
When they point back at something already on screen, resolve the reference using the
conversation above and put the real name into params (e.g. campaignName). Never leave a
reference like "that" as a literal value - look up what it means first.

Reply with JSON only. No preamble, no markdown fences.

## Goals
${goals}`;
}

/**
 * Understand one message. Returns null if the model is unusable, so the caller
 * can fall back to the deterministic router instead of failing the turn.
 */
export async function understand(
  message: string,
  history: HistoryTurn[],
  userId: string,
  carried?: Carried | null,
  profile?: Profile | null,
  accountCtx?: AgentAccountContext | null,
): Promise<{ u: Understanding | null; cachedIntent: AgentIntent | null; cachedParams: AgentParams } | null> {
  try {
    const { groqChat } = await import("./groq.ts");
    const prompt = buildPrompt(message, history, carried ?? undefined, profile ?? null, accountCtx ?? null);

    // A single unparseable reply must not decide the turn. The model is
    // non-deterministic and occasionally returns prose, truncated JSON, or
    // empty content when a key is cooling down; without a retry that silently
    // degraded into the keyword router and lost every goal the router cannot
    // see. One extra call on the failure path only - the happy path is
    // unchanged and still spends a single AI call.
    // groqChat already retries up to 16x across every key x model pair, so a
    // failure here means the provider genuinely refused the call. Adding a
    // second retry loop on top doubled the request volume and made the
    // rate-limiting WORSE (live failures went 3 -> 11), so this stays single.
    const out = await groqChat(
      [{ role: "user", content: prompt }],
      { maxTokens: 700, temperature: 0.2, context: { fn: "agent", kind: "understand", user_id: userId } },
    );
    const parsed = parseUnderstanding(out ?? "", message);
    if (!parsed) return null;
    // Carry slots forward so a one-word answer COMPLETES the earlier request
    // instead of wiping it. The intent is only inherited when this turn picked
    // none of its own, because "actually pause it" legitimately changes goal.
    const inheritIntent = parsed.cachedIntent ?? carried?.intent ?? null;
    const freshParams = mergeParams(carried?.params ?? {}, parsed.cachedParams);
    return { ...parsed, cachedIntent: inheritIntent, cachedParams: freshParams };
  } catch (err) {
    console.error("agent understand failed", err);
    return null;
  }
}
