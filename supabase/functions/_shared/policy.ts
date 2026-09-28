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
  reason: string;            // one-line evidence: WHY this label, what the lead's words showed
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

  // 5. Requires-human flag → hand off before burning a turn. This is reserved
  // for REAL commitments (refund/money movement, contract, breach report, explicit
  // "let me speak to a human"). Ambiguity alone must never set it — the AI answers
  // unclear-but-warm replies with a thank-you and a gentle question instead.
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

  // 7b. Unclear but NOT hostile and NOT an opt-out: the lead is still talking to
  // us. Silence here is what loses warm deals ("its cool" / "here is
  // conversation?"). Answer with a warm acknowledgement + gentle question. This
  // runs even in AI_ASSISTED mode because not answering at all is strictly worse
  // than a kind, low-risk acknowledgement.
  if (c.intent === "unclear" && c.sentiment !== "NOT_INTERESTED" && !c.unsubscribe) {
    return ctx.conv_mode === "HUMAN" || ctx.conv_mode === "AI_OVERRIDDEN"
      ? { action: "DO_NOTHING", reason: "human_owns_thread" }
      : { action: "AUTO_REPLY" };
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
    '"reason":"one short phrase quoting the evidence from their words",' +
    '"suggested_action":"suppress|notify_owner_booking|auto_reply|alert_owner|handoff|do_nothing|continue_conversation"}\n' +
    "Intent rules:\n" +
    "- interested: genuine interest, wants to learn more\n" +
    "- not_interested: clear rejection\n" +
    "- unsubscribe: any stop/opt-out/remove request\n" +
    "- booking: meeting/calendar/schedule request\n" +
    "- question: asks about product, service, or process\n" +
    "- objection: pushback on price, timing, relevance, or value but NOT a rejection. ALSO treat as objection: annoyed or dismissive messages, repeated questions, pushback against something previously suggested by the sender (e.g. 'why do I need booking when everything is on your website?', 'how is this any different', 'I already told you', 'stop asking me about calls'). These are OBJECTIONS — not plain questions, and not human-only.\n" +
    "- unclear: message is too short or ambiguous to determine intent\n" +
    "- autoresponder: automated out-of-office or vacation reply\n" +
    "- other: none of the above\n\n" +
    "=== AI HANDLES EVERYTHING (requires_human=false) ===\n" +
    "You are a competent, warm assistant. The human owner is BUSY and will not read routine email. " +
    "Answer all of these yourself, calmly and politely, using only facts already published on the company website (supplied in the knowledge base):\n" +
    "- PRICING/COST ('how much?', 'what does it cost?', 'too expensive', 'any discount?'). Our price is FIXED and CANNOT be changed or negotiated by you. State the published price, briefly re-state the value, and hold the line politely. NEVER invent a price, discount, or custom quote.\n" +
    "- ANGRY / DISSATISFIED / COMPLAINING customers. Stay calm, empathetic and professional. Acknowledge the frustration genuinely, apologise once without grovelling, explain what is true from the knowledge base, and offer the concrete next step. NEVER be defensive, sarcastic, or argue. NEVER blame the customer. NEVER promise a refund or a credit — if they explicitly demand money back, that is requires_human=true.\n" +
    "- SECURITY / PRIVACY / DATA questions ('is my data safe?', 'do you sell my data?', 'GDPR?', 'who can see my emails?'). Answer factually ONLY from the published privacy/security text in the knowledge base. If the knowledge base does not state it, say honestly that you will get it confirmed and offer a point of contact — never guess.\n" +
    "- LEGAL / CONTRACT / TERMS questions. Summarise only what is actually published. Never give legal advice, never interpret terms in the customer's favour, never promise an outcome. If it is a request to sign, agree to terms, or be legally bound, that is requires_human=true.\n" +
    "- AMBIGUOUS but WARM or POSITIVE short replies ('its cool', 'nice', 'wow', 'sounds good', 'ok', 'thanks', 'here is conversation?'). Treat these as INTERESTED/positive engagement. Never treat a short, positive, ambiguous message as requires_human. The correct action is to thank them warmly, acknowledge what they said, and invite the next step. Confidence may be modest (0.5-0.7) — that is fine, keep requires_human=false.\n" +
    "- Short gibberish or unclear text that is NOT hostile and NOT an opt-out: lean interested=MAYBE and requires_human=false. Reply warmly and ask a gentle clarifying question.\n\n" +
    "=== ONLY THESE GO TO THE HUMAN (requires_human=true) ===\n" +
    "Set requires_human=true ONLY when answering would create a real, irreversible commitment or a specific liability:\n" +
    "1. A demand for money to move: refund, credit, chargeback, payment reversal, or a custom/discounted price.\n" +
    "2. Legal commitment: signing, agreeing to terms, accepting liability, or a contract.\n" +
    "3. Account/data deletion, or a breach/security-incident report.\n" +
    "4. An explicit request to speak to a human ('let me talk to a person/manager/owner').\n" +
    "5. Genuinely hostile threats, or a threat of legal action against the business.\n" +
    "Note what is NOT in that list: ordinary pricing questions, ordinary complaints, ordinary angry messages, security/privacy/legal INFORMATION questions, and unclear-but-warm replies. All of those are yours to answer.\n\n" +
    "Any meeting/time/calendar request => booking_intent=true. " +
    "Any stop/remove/opt-out request => unsubscribe=true.\n\n" +
    CLASSIFICATION_FEWSHOTS
  );
}

// Few-shot reference — realistic cold-email replies with the correct verdict.
// Demonstrates how to use the conversation history ('Earlier in this thread')
// and how honest the 'reason' must be. Never copy sentences verbatim.
const CLASSIFICATION_FEWSHOTS = [
  { reply: "Sounds good — can we talk tomorrow around 3pm?", thread: "", verdict: { intent: "booking", confidence: 0.95, interested: true, booking_intent: true, unsubscribe: false, sentiment: "INTERESTED", requires_human: false, reason: "asked for a specific time (tomorrow 3pm)", suggested_action: "notify_owner_booking" } },
  { reply: "why would I need this, it sounds like every other agency", thread: "You: we automate your cold outreach\nLead: why would I need this", verdict: { intent: "objection", confidence: 0.9, interested: false, booking_intent: false, unsubscribe: false, sentiment: "MAYBE", requires_human: false, reason: "pushback on differentiation, not a rejection", suggested_action: "auto_reply" } },
  { reply: "yes", thread: "You: want a quick rundown of how it works?\nLead: yes", verdict: { intent: "interested", confidence: 0.85, interested: true, booking_intent: false, unsubscribe: false, sentiment: "INTERESTED", requires_human: false, reason: "'yes' answers my earlier question about seeing how it works", suggested_action: "auto_reply" } },
  { reply: "please remove me from your list", thread: "", verdict: { intent: "unsubscribe", confidence: 0.98, interested: false, booking_intent: false, unsubscribe: true, sentiment: "NOT_INTERESTED", requires_human: false, reason: "explicit opt-out request", suggested_action: "suppress" } },
  { reply: "not for us, thanks", thread: "", verdict: { intent: "not_interested", confidence: 0.92, interested: false, booking_intent: false, unsubscribe: false, sentiment: "NOT_INTERESTED", requires_human: false, reason: "polite but clear rejection", suggested_action: "do_nothing" } },
  { reply: "how much does this cost?", thread: "", verdict: { intent: "question", confidence: 0.9, interested: true, booking_intent: false, unsubscribe: false, sentiment: "INTERESTED", requires_human: false, reason: "direct pricing question — answerable", suggested_action: "auto_reply" } },
  { reply: "I'm out of the office until Monday", thread: "", verdict: { intent: "autoresponder", confidence: 0.95, interested: false, booking_intent: false, unsubscribe: false, sentiment: "NOT_INTERESTED", requires_human: true, reason: "automatic out-of-office reply", suggested_action: "handoff" } },
  { reply: "we already have a tool for this and it's not worth switching", thread: "", verdict: { intent: "objection", confidence: 0.88, interested: false, booking_intent: false, unsubscribe: false, sentiment: "NOT_INTERESTED", requires_human: false, reason: "claims an existing solution — pushback, not a rejection", suggested_action: "auto_reply" } },
  { reply: "ITS COOL REALLY HERE IS CONVERSATION ?", thread: "", verdict: { intent: "unclear", confidence: 0.6, interested: true, booking_intent: false, unsubscribe: false, sentiment: "INTERESTED", requires_human: false, reason: "short, positive and appreciative — engagement, not a risk", suggested_action: "auto_reply" } },
  { reply: "wow this is exactly what I needed", thread: "", verdict: { intent: "interested", confidence: 0.9, interested: true, booking_intent: false, unsubscribe: false, sentiment: "INTERESTED", requires_human: false, reason: "explicit enthusiasm", suggested_action: "auto_reply" } },
  { reply: "this is garbage, I've been waiting 3 days for a reply and nobody answers", thread: "", verdict: { intent: "objection", confidence: 0.85, interested: false, booking_intent: false, unsubscribe: false, sentiment: "NOT_INTERESTED", requires_human: false, reason: "angry about service, but no money/legal demand — de-escalate calmly", suggested_action: "auto_reply" } },
  { reply: "how much is this?", thread: "", verdict: { intent: "question", confidence: 0.92, interested: true, booking_intent: false, unsubscribe: false, sentiment: "INTERESTED", requires_human: false, reason: "price is published and fixed — answerable", suggested_action: "auto_reply" } },
  { reply: "give me a 50% discount or I'm not interested", thread: "", verdict: { intent: "objection", confidence: 0.9, interested: false, booking_intent: false, unsubscribe: false, sentiment: "NOT_INTERESTED", requires_human: true, reason: "demands a custom price — a real pricing commitment", suggested_action: "handoff" } },
  { reply: "is my data safe? do you sell my data to anyone?", thread: "", verdict: { intent: "question", confidence: 0.85, interested: true, booking_intent: false, unsubscribe: false, sentiment: "INTERESTED", requires_human: false, reason: "security/privacy information — answer from published policy", suggested_action: "auto_reply" } },
  { reply: "I want a refund for the last payment", thread: "", verdict: { intent: "other", confidence: 0.9, interested: false, booking_intent: false, unsubscribe: false, sentiment: "NOT_INTERESTED", requires_human: true, reason: "explicit refund demand — money must actually move", suggested_action: "handoff" } },
  { reply: "let me talk to a real person please", thread: "", verdict: { intent: "other", confidence: 0.95, interested: true, booking_intent: false, unsubscribe: false, sentiment: "MAYBE", requires_human: true, reason: "explicit request for a human", suggested_action: "handoff" } },
  { reply: "ok", thread: "You: happy to answer anything?\nLead: ok", verdict: { intent: "unclear", confidence: 0.55, interested: true, booking_intent: false, unsubscribe: false, sentiment: "MAYBE", requires_human: false, reason: "one-word reply that is not hostile — warm it and open a question", suggested_action: "auto_reply" } },
].map(
  (f) => `Example reply: "${f.reply}"${f.thread ? `\nEarlier in this thread:\n${f.thread}` : ""}\nCorrect verdict: ${JSON.stringify(f.verdict)}`
).join("\n\n");

export function parseClassification(rawText: string, fallbackSnippet: string): Classification {
  let fallbackReason = "fallback heuristic — confident classification impossible";
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
    requires_human: /\brefund|chargeback|money back|reimburse|sign (a|the) contract|agree to (the )?terms|talk to (a |the )?(real )?(person|human|manager|owner)/i.test(fallbackSnippet),
    reason: fallbackReason,
    suggested_action: "continue_conversation",
  };
  if (fallback.unsubscribe) fallback.reason = "explicit opt-out request";
  // Detect autoresponder from snippet
  if (/auto.?reply|out of office|away from|on vacation|automatic response/i.test(fallbackSnippet)) {
    fallback.intent = "autoresponder";
    fallback.confidence = 0.95;
    fallback.requires_human = true;
    fallback.reason = "automatic out-of-office reply";
  }
  // Detect objection from snippet (pushback on the sender's pitch, annoyance, repetitions)
  if (/not (the )?right time|too expensive|budget|already (have|using)|not (a )?priority|not convinced|skeptical|why should i|why (do|would|should) i (need|want)|how is this (different|better|any different)|already (saw|read|told|seen|offered|asked)|stop (emailing|pitching|asking)|are you (real|serious|human)|this is (annoying|ridiculous|a scam|too much)|i don'?t (need|want) another|why does everyone/i.test(fallbackSnippet)) {
    fallback.intent = "objection";
    fallback.sentiment = "MAYBE";
    fallback.reason = "pushback on the pitch, not a rejection";
  }
  // Detect unclear (very short messages)
  if (fallbackSnippet.trim().length < 20 && !fallback.booking_intent && !fallback.unsubscribe) {
    fallback.intent = "unclear";
    fallback.confidence = 0.25;
    fallback.requires_human = true;
    fallback.reason = "too short or ambiguous to decide safely";
  }
  try {
    const start = rawText.indexOf("{");
    const end = rawText.lastIndexOf("}");
    if (start === -1 || end <= start) return fallback;
    const obj = JSON.parse(rawText.slice(start, end + 1));
    const parsed: Classification = {
      intent: String(obj.intent ?? fallback.intent),
      confidence: Math.min(1, Math.max(0, Number(obj.confidence ?? 0.5))),
      interested: Boolean(obj.interested),
      booking_intent: Boolean(obj.booking_intent),
      unsubscribe: Boolean(obj.unsubscribe),
      sentiment: ["INTERESTED", "MAYBE", "NOT_INTERESTED"].includes(obj.sentiment)
        ? obj.sentiment
        : fallback.sentiment,
      requires_human: Boolean(obj.requires_human),
      reason: String(obj.reason ?? fallback.reason).slice(0, 160),
      suggested_action: obj.suggested_action ?? "continue_conversation",
    };
    // Reconciliation: deterministic objection/opt-out signals beat a flaky LLM
    // verdict, so pushback (or "why would I need this") is never misfiled as
    // 'unclear' or 'requires_human'. Human-only topics still force a handoff.
    if (parsed.unsubscribe || /unsubscribe|opt.?out|remove me|stop emailing/i.test(fallbackSnippet)) {
      parsed.intent = "other";
      parsed.requires_human = false;
      parsed.reason = "explicit opt-out request";
    } else if (/not (the )?right time|too expensive|budget|already (have|using)|not (a )?priority|not convinced|skeptical|why should i|why (do|would|should) i (need|want)|how is this (different|better|any different)|already (saw|read|told|seen|offered|asked)|stop (emailing|pitching|asking)|are you (real|serious|human)|this is (annoying|ridiculous|a scam|too much)|i don'?t (need|want) another|why does everyone/i.test(fallbackSnippet)) {
      parsed.intent = "objection";
      // Only an explicit demand for MONEY (refund/credit/discount/chargeback) is a
      // real commitment the AI must not make. Generic complaints, annoyance and
      // "too expensive" pushback stay with the AI, which de-escalates calmly.
      parsed.requires_human = /\brefund|chargeback|money back|reimburse|reverse (the )?(payment|charge)|custom price|discount/i.test(fallbackSnippet);
      parsed.reason = "reconciled: objective pushback signals override the model label";
      if (!parsed.requires_human && parsed.sentiment === "NOT_INTERESTED") parsed.sentiment = "MAYBE";
    }
    return parsed;
  } catch (_e) {
    return fallback;
  }
}
