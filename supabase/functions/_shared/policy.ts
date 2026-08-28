// ============================================================
// POLICY ENGINE — the ONLY component allowed to decide actions.
// AI provides structured classification; this module is deterministic.
// ============================================================

export interface Classification {
  intent: string;            // interested | not_interested | unsubscribe | booking | question | objection | unclear | autoresponder | other
  confidence: number;        // 0..1
  interested: boolean;
  booking_intent: boolean;
  unsubscribe: boolean;
  sentiment: "INTERESTED" | "MAYBE" | "NOT_INTERESTED";
  requires_human: boolean;
  suggested_action:
    | "suppress"
    | "notify_owner_booking"
    | "auto_reply"
    | "alert_owner"
    | "handoff"
    | "do_nothing"
    | "continue_conversation";
}

export interface PolicyContext {
  conv_mode: string;         // AI_AUTOPILOT | AI_ASSISTED | HUMAN | PAUSED
  campaign_autopilot: boolean;
  ai_turns: number;
  max_turns: number;
  lead_status: string;
  unsubscribed: boolean;
}

export type PolicyAction =
  | { action: "SUPPRESS"; reason: string }
  | { action: "NOTIFY_OWNER_BOOKING" }
  | { action: "AUTO_REPLY" }
  | { action: "ALERT_OWNER" }
  | { action: "HANDOFF_TO_HUMAN" }
  | { action: "DO_NOTHING"; reason: string };

/** Deterministic decision. The LLM's `suggested_action` is advisory only. */
export function decide(c: Classification, ctx: PolicyContext): PolicyAction {
  // 1. Opt-out always wins, regardless of anything the AI suggests.
  if (c.unsubscribe || /unsubscribe|opt.?out|remove me|stop emailing/i.test(c.intent)) {
    return { action: "SUPPRESS", reason: "unsubscribe_requested" };
  }

  // 2. Terminal states are immutable.
  if (ctx.unsubscribed || ["unsubscribed", "suppressed"].includes(ctx.lead_status)) {
    return { action: "DO_NOTHING", reason: "lead_suppressed" };
  }

  // 3. Human has zero-tolerance override: no AI sends in HUMAN mode.
  if (ctx.conv_mode === "HUMAN") {
    return c.booking_intent
      ? { action: "NOTIFY_OWNER_BOOKING" }
      : { action: "DO_NOTHING", reason: "human_takeover_active" };
  }

  if (ctx.conv_mode === "PAUSED") {
    return { action: "DO_NOTHING", reason: "conversation_paused" };
  }

  if (ctx.conv_mode === "AI_OVERRIDDEN") {
    return { action: "DO_NOTHING", reason: "ai_overridden_owner_must_handle" };
  }

  // 4. Booking intent escalates immediately and marks high priority.
  if (c.booking_intent) {
    return { action: "NOTIFY_OWNER_BOOKING" };
  }

  // 5. Requires-human flag → hand off before burning a turn.
  if (c.requires_human) {
    return { action: "HANDOFF_TO_HUMAN" };
  }

  // 6. Turn budget exhausted → handoff with owner alert.
  if (ctx.ai_turns >= ctx.max_turns) {
    return { action: "HANDOFF_TO_HUMAN" };
  }

  // 7. Genuine interest:
  //    AI_AUTOPILOT + campaign autopilot → send reply automatically.
  //    otherwise → owner alert only (AI_ASSISTED behaves as draft-only).
  if (c.interested || c.sentiment === "INTERESTED") {
    if (ctx.conv_mode === "AI_AUTOPILOT" && ctx.campaign_autopilot) {
      return { action: "AUTO_REPLY" };
    }
    return { action: "ALERT_OWNER" };
  }

  // 8. Everything else: routine turn — continue quietly if turns remain.
  if (ctx.conv_mode === "AI_AUTOPILOT" && ctx.campaign_autopilot && ctx.ai_turns < ctx.max_turns) {
    return { action: "AUTO_REPLY" };
  }
  return { action: "DO_NOTHING", reason: "no_action_warranted" };
}

// ---------- Conversation state machine (deterministic transitions) ----------
const ORDER = ["NEW", "CONTACTED", "REPLIED", "INTERESTED", "BOOKING", "CUSTOMER"];
const TERMINAL = ["UNSUBSCRIBED", "BOUNCED", "SUPPRESSED", "LOST", "HUMAN_TAKEOVER"];

/**
 * Returns the new lifecycle value. Terminal states never transition away.
 * Progression only moves forward through the happy path.
 */
export function nextLifecycle(current: string, event: string): string {
  if (TERMINAL.includes(current)) return current;
  switch (event) {
    case "email.sent":      return advance(current, "CONTACTED");
    case "email.replied":   return advance(current, "REPLIED");
    case "classified.interested": return advance(current, "INTERESTED");
    case "booking.detected":return advance(current, "BOOKING");
    case "deal.won":        return advance(current, "CUSTOMER");
    case "lead.unsubscribed":   return "UNSUBSCRIBED";
    case "email.bounced":       return "BOUNCED";
    case "lead.suppressed":     return "SUPPRESSED";
    case "human.takeover":      return "HUMAN_TAKEOVER";
    default: return current;
  }
}

function advance(current: string, target: string): string {
  const from = ORDER.indexOf(current);
  const to = ORDER.indexOf(target);
  if (to > from) return target;
  return current;
}

// ---------- Structured classification via LLM ----------
export function classificationSystemPrompt(): string {
  return (
    "You classify replies to cold outreach emails. Respond with ONLY a JSON object, no prose, matching exactly:\n" +
    '{"intent":"interested|not_interested|unsubscribe|booking|question|objection|unclear|autoresponder|other",' +
    '"confidence":0.0-1.0,' +
    '"interested":true|false,' +
    '"booking_intent":true|false,' +
    '"unsubscribe":true|false,' +
    '"sentiment":"INTERESTED|MAYBE|NOT_INTERESTED",' +
    '"requires_human":true|false,' +
    '"suggested_action":"suppress|notify_owner_booking|auto_reply|alert_owner|handoff|do_nothing|continue_conversation"}\n' +
    "Intent rules:\n" +
    "- interested: genuine interest, wants to learn more\n" +
    "- not_interested: clear rejection\n" +
    "- unsubscribe: any stop/opt-out/remove request\n" +
    "- booking: meeting/calendar/schedule request\n" +
    "- question: asks about product, service, or process\n" +
    "- objection: pushback on price, timing, relevance, or value but NOT a rejection\n" +
    "- unclear: message is too short or ambiguous to determine intent\n" +
    "- autoresponder: automated out-of-office or vacation reply\n" +
    "- other: none of the above\n\n" +
    "By default you answer product/service/pricing questions yourself (requires_human=false). " +
    "Set requires_human=true ONLY for: legal, contractual, invoice/payment, complaints, refunds, security/privacy, or hard price negotiation (e.g. 'too expensive'). " +
    "Set requires_human=true if you cannot determine intent at all. " +
    "Any meeting/time/calendar request => booking_intent=true. " +
    "Any stop/remove/opt-out request => unsubscribe=true."
  );
}

export function parseClassification(rawText: string, fallbackSnippet: string): Classification {
  const fallback: Classification = {
    intent: fallbackSnippet ? "question" : "other",
    confidence: 0.3,
    interested: false,
    booking_intent: /calendar|book(ing)?|\bcall\b|schedule|zoom|google meet|teams link|(mon|tue|wed|thu|fri|sat|sun)day|\b\d{1,2}(:\d{2})?\s?(am|pm)\b|what time works|i'?m free|availability/i.test(fallbackSnippet),
    unsubscribe: /unsubscribe|opt.?out|remove me|stop emailing/i.test(fallbackSnippet),
    sentiment: /not interested|pass|no thanks/i.test(fallbackSnippet)
      ? "NOT_INTERESTED"
      : /interested|sounds good|tell me more|yes/i.test(fallbackSnippet)
        ? "INTERESTED"
        : "MAYBE",
    requires_human: /legal|contract|invoice|complaint|refund|negotiat|too expensive|\bbudget\b/i.test(fallbackSnippet),
    suggested_action: "continue_conversation",
  };
  // Detect autoresponder from snippet
  if (/auto.?reply|out of office|away from|on vacation|automatic response/i.test(fallbackSnippet)) {
    fallback.intent = "autoresponder";
    fallback.confidence = 0.95;
    fallback.requires_human = true;
  }
  // Detect objection from snippet
  if (/not (the )?right time|too expensive|budget|already (have|using)|not (a )?priority|not convinced|skeptical|why should i/i.test(fallbackSnippet)) {
    fallback.intent = "objection";
    fallback.sentiment = "MAYBE";
  }
  // Detect unclear (very short messages)
  if (fallbackSnippet.trim().length < 20 && !fallback.booking_intent && !fallback.unsubscribe) {
    fallback.intent = "unclear";
    fallback.confidence = 0.25;
    fallback.requires_human = true;
  }
  try {
    const start = rawText.indexOf("{");
    const end = rawText.lastIndexOf("}");
    if (start === -1 || end <= start) return fallback;
    const obj = JSON.parse(rawText.slice(start, end + 1));
    return {
      intent: String(obj.intent ?? fallback.intent),
      confidence: Math.min(1, Math.max(0, Number(obj.confidence ?? 0.5))),
      interested: Boolean(obj.interested),
      booking_intent: Boolean(obj.booking_intent),
      unsubscribe: Boolean(obj.unsubscribe),
      sentiment: ["INTERESTED", "MAYBE", "NOT_INTERESTED"].includes(obj.sentiment)
        ? obj.sentiment
        : fallback.sentiment,
      requires_human: Boolean(obj.requires_human),
      suggested_action: obj.suggested_action ?? "continue_conversation",
    };
  } catch (_e) {
    return fallback;
  }
}
