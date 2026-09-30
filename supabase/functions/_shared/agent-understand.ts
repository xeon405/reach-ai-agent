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

export type Understanding =
  | { kind: "chat"; reply: string }
  | { kind: "read"; req: AgentRequest }
  | { kind: "write"; req: AgentRequest }
  | { kind: "ask"; question: string; intent: AgentIntent; params: AgentParams }
  | { kind: "unclear"; question: string; guess?: AgentIntent };

const PARAM_KEYS = new Set<keyof AgentParams>(["city", "company", "category", "campaignName", "query", "limit"]);
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
    const goal = GOAL_BY_INTENT.get(intent)!;
    const slots = missingSlots(goal, params);
    const question =
      typeof o.question === "string" && o.question.trim()
        ? o.question.trim().slice(0, 400)
        : slotQuestion(intent, slots.length ? slots : goal.needs);
    return { u: { kind: "ask", question, intent, params }, cachedIntent: intent, cachedParams: {} };
  }

  if (kind === "ask" || kind === "unclear") return null;

  // From here on we are executing something, so the intent must be real.
  if (!valid) return null;
  const goal = GOAL_BY_INTENT.get(intent)!;

  // A goal with a required slot still unfilled becomes a question, not a guess.
  const gaps = missingSlots(goal, params);
  if (gaps.length) {
    return {
      u: { kind: "ask", question: slotQuestion(intent, gaps), intent, params },
      cachedIntent: null,
      cachedParams: {},
    };
  }

  const req: AgentRequest = { intent, params, summary: summary || goal.goal };
  return {
    u: { kind: isWriteIntent(intent) ? "write" : "read", req },
    cachedIntent: intent,
    cachedParams: params,
  };
}

function buildPrompt(message: string, history: HistoryTurn[]): string {
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

  return `You are the assistant inside a small cold-email tool. You read what the person MEANS, not which words they used. Phrasings vary wildly - "I need more people to email", "get me leads" and "I'm running dry" can all mean the same goal.

## Most messages need NO goal
The majority of messages are just conversation or questions ABOUT you. For those, reply with:
{"kind":"chat","reply":"..."}
This includes: what you can do, how you work, greetings, thanks, small talk, advice about cold email in general, and anything you cannot actually look up. Answer in the same language they used, in 1-3 short sentences, plain words, no markdown, no bullet lists. Never invent numbers about their account - if they ask for a figure, use a goal or say you need to look it up.

## When there IS a goal
Reply with one of:
{"kind":"read","intent":"...","params":{}}
{"kind":"write","intent":"...","params":{},"summary":"what you will do, in plain words"}
- "write" is ONLY for changing their account. Never label a read as a write to seem helpful, and never the reverse.

## If a required slot is missing
Reply {"kind":"ask","intent":"...","params":{},"question":"..."} naming the goal and asking ONLY for the missing part. The "intent" is REQUIRED here so we remember what you were trying to do once they answer. Do not invent a value for the missing part.

## If you genuinely cannot tell
Reply {"kind":"unclear","question":"...","guess":"...optional intent"}
Prefer asking over guessing. A wrong guess either annoys them or, worse, acts on the wrong account.

## Allowed params
city, company, category, campaignName, query, limit (1-200). Include a slot only if the person actually said it or clearly implied it.

## Recent conversation
${convo}

## Now handle this message
Person: ${sanitizeForPrompt(message, 2000)}

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
): Promise<{ u: Understanding | null; cachedIntent: AgentIntent | null; cachedParams: AgentParams } | null> {
  try {
    const { groqChat } = await import("./groq.ts");
    const out = await groqChat(
      [{ role: "user", content: buildPrompt(message, history) }],
      { maxTokens: 400, temperature: 0.2, context: { fn: "agent", kind: "understand", user_id: userId } },
    );
    return parseUnderstanding(out ?? "");
  } catch (err) {
    console.error("agent understand failed", err);
    return null;
  }
}
