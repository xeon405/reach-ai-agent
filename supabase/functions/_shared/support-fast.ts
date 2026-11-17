// ============================================================================
// SUPPORT FAST LANE — a small set of whole questions with one versioned answer.
//
// The contract is deliberately narrow. A message is answered here only when:
//   * it is one complete known question (not a fragment of a longer one),
//   * it contains no money, legal, privacy, account or personal-data words,
//   * it contains no digits (so no account-specific number can slip through),
//   * it is not Arabic (the AI must answer in the user's language),
//   * no "and/also/plus/or/but" adds a second question.
//
// Everything else returns null and the caller uses the cloud model. There is no
// learning here and no cached AI prose: every answer is a string in this file,
// reviewed with the product, so a product change updates one place and no stale
// answer can survive in a database.
//
// The mistakes this avoids:
//   * guessing an intent from one keyword,
//   * answering half of a two-part question,
//   * repeating an old price or plan limit,
//   * sounding confident about an account it cannot see.
//
// Pure TS: no Deno globals, no network, no I/O.
// ============================================================================
import { fixTypos } from "./typos.ts";

export interface FastAnswer {
  topic: string;
  reply: string;
}

const ANSWERS: Record<string, string> = {
  GREETING:
    "Hi! I'm the OutshipAi Guide. Ask me anything about the app — finding and saving leads, campaigns, follow-ups, Gmail setup, or your plan.",
  THANKS: "You're welcome! If anything else comes up, just ask.",
  OVERVIEW:
    "OutshipAi finds local business leads, writes personalized cold emails, sends them from your own Gmail, runs follow-ups, and classifies replies. You can start on the free plan.",
  WEBSITE: "We're at https://out-ship.com — that's the site you're on right now.",
  IDENTITY_AI:
    "Yes — I'm the OutshipAi Guide, an AI assistant. For anything about your account, email outshipai@gmail.com.",
  IDENTITY_TEAM:
    "OutshipAi is built by a small team focused on making cold outreach simple and safe for small businesses. For more about the team, email outshipai@gmail.com.",
  LEAD_FINDING:
    "Open Contacts → Find Leads with AI. Pick a niche (or type one) and a country, then click Find Leads. Results come from Google Maps. Select the businesses you want, then click Add to Campaign. Only email contacts whose address shows as verified.",
  GMAIL_SETUP:
    "Go to Settings → Connect Gmail and sign in with Google. OutshipAi gets permission to send email and to read your inbox so it can find replies to your outreach — never your password. You can disconnect anytime in Settings.",
  FOLLOWUPS:
    "By default, four follow-ups go out on day 3, 7, 14 and 21 after the first email. They stop automatically when the lead replies. You can turn them off per campaign in Campaigns → Edit → Follow-ups.",
  PAUSE_CAMPAIGN:
    "Go to Campaigns and click the pause button on the campaign. Click play to resume. Pausing stops new sends from that campaign.",
  SEE_REPLIES:
    "Go to Emails Sent to see replies. Interested and booking replies get a badge; open the thread to read the reply and send an AI draft.",
  START:
    "Three steps: (1) Settings → Connect Gmail. (2) Contacts → Find Leads with AI → pick a niche and country → Find Leads → select businesses → Add to Campaign. (3) Campaigns → Review → Preview the AI-written email → Launch.",
  BOOKING_LINK:
    "Go to Settings → Booking link and paste your Calendly (or other booking) URL. It is saved to your profile and used in your outreach.",
  WELCOME:
    "You're on the OutshipAi website. I'm the built-in Guide — ask me anything about finding leads, campaigns, follow-ups, Gmail setup, or your plan.",
};

/** Topic -> every accepted wording. Case, punctuation and extra spaces are
 *  normalised before lookup; these are the phrasing keys, not regexes. */
const PHRASES: Record<string, string[]> = {
  GREETING: [
    "hi", "hello", "hey", "yo", "hi there", "hello there", "hey there",
    "good morning", "good afternoon", "good evening",
  ],
  THANKS: [
    "thanks", "thank you", "thanks a lot", "thank you so much", "thx",
    "great thanks", "perfect thanks", "awesome thanks",
  ],
  OVERVIEW: [
    "what does outship do", "what does out ship do", "what does outshipai do",
    "what does out ship ai do", "what is outship", "what is out ship",
    "what is outshipai", "what do you do", "what can you do",
    "tell me about outship", "tell me about outshipai",
    "what is this website about", "what is this site about", "what is this app about",
    "what is this product", "what is this platform",
  ],
  WEBSITE: [
    "what is your website", "what is your website name", "what is the website",
    "what is the site", "what's your website", "websit name", "website name",
    "your website", "your site",
  ],
  IDENTITY_AI: [
    "are you an ai", "are you ai", "are you a bot", "are you human",
    "are you real", "what are you",
  ],
  IDENTITY_TEAM: [
    "who built this", "who built you", "who made this", "who created this",
    "who made outship", "who built outship", "who built outshipai",
    "who made outshipai",
  ],
  LEAD_FINDING: [
    "how to get leads", "how do i get leads", "how do i find leads",
    "how to find leads", "where do i find leads", "how can i get leads",
    "how can i find leads", "get leads", "find leads",
  ],
  GMAIL_SETUP: [
    "how do i connect gmail", "how to connect gmail", "how do i connect my gmail",
    "connect gmail", "what is gmail connect", "what is gmail connection",
    "how does gmail connect work", "how do i disconnect gmail",
  ],
  FOLLOWUPS: [
    "how do follow ups work", "how do followups work", "how do the follow ups work",
    "what are follow ups", "what are followups", "how does follow up work",
    "how does followup work",
  ],
  PAUSE_CAMPAIGN: [
    "how do i pause a campaign", "how to pause a campaign",
    "how do i pause my campaign", "pause a campaign", "pause campaign",
  ],
  SEE_REPLIES: [
    "where do i see replies", "where can i see replies", "where are my replies",
    "where do i find replies", "how do i see replies", "where do i see responses",
    "where are the replies", "how do i handle replies", "how to handle replies",
  ],
  START: [
    "how do i start", "how to start", "how do i get started", "how to get started",
    "getting started", "what do i do first", "how do i begin", "where do i start",
    "how to signup", "how to sign up", "how do i signup", "how do i sign up",
    "how do i start sending", "how to start sending", "how do i start sending emails",
  ],
  BOOKING_LINK: [
    "how do i add a booking link", "how to add a booking link",
    "where do i add my booking link", "booking link",
    "how do i set up a booking link", "how do i add my calendly",
    "how to add calendly",
  ],
  WELCOME: [
    "why am i here", "what is this place", "where am i", "why i am here",
  ],
};

const TOPIC_BY_PHRASE = new Map<string, string>();
for (const [topic, phrases] of Object.entries(PHRASES)) {
  for (const phrase of phrases) TOPIC_BY_PHRASE.set(phrase, topic);
}

const TOPIC_BY_REPLY = new Map<string, string>(
  Object.entries(ANSWERS).map(([topic, reply]) => [reply.trim(), topic]),
);

/**
 * Words that mean the answer depends on money, law, private data, a specific
 * account, or a human decision. A fast answer must never touch those, even if a
 * phrase somehow matches.
 */
const BLOCK_RE =
  /\b(refund|refunds|refunded|charge|charges|charged|chargeback|billing|invoice|price|prices|pricing|plan|plans|upgrade|downgrade|cancel|subscription|payment|payments|paid|pay|money|discount|credit|legal|lawyer|sue|lawsuit|gdpr|privacy|delete|deleted|account|accounts|personal|parents?|students?|patients?|residents?|homeowners?|tenants?|consumers?|starter|growth|agency|cost|costs|how much)\b/;

const ARABIC_RE = /[\u0600-\u06FF]/;

/** Lowercase, turn typographic punctuation into plain spaces, collapse runs.
 *  Apostrophes are kept so "what's" can be listed as its own known phrase. */
function normalize(text: string): string {
  return String(text ?? "")
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[^a-z0-9'\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Remove a polite shell around the actual question: "hi, ...", "... please". */
function stripFiller(text: string): string {
  return text
    .replace(/^(?:hi|hello|hey|yo|ok|okay|so|please|and)\b[\s,]*/g, "")
    .replace(/\b(?:please|thanks|thank you|thx)$/g, "")
    .trim();
}

/**
 * The one entry point. Returns a versioned answer, or null when there is any
 * doubt. The caller must treat null as "use the AI", never as "try harder".
 */
export function fastSupportAnswer(text: string): FastAnswer | null {
  // Arabic is checked on the ORIGINAL text. Normalisation strips non-Latin
  // characters, so checking afterwards would turn "مرحبا how do i start" into
  // an English fast question and answer in the wrong language.
  const source = String(text ?? "");
  if (ARABIC_RE.test(source)) return null;
  const raw = normalize(source);
  if (!raw) return null;
  if (BLOCK_RE.test(raw)) return null;
  if (/\d/.test(raw)) return null;
  // A second question is not a fast question. "how to get leads and pricing"
  // must go to the model, which can answer both parts.
  if (/\b(and|also|plus|or|but)\b/.test(raw)) return null;

  const direct = fixTypos(raw);
  const stripped = fixTypos(stripFiller(raw));
  const topic = TOPIC_BY_PHRASE.get(direct) ?? TOPIC_BY_PHRASE.get(stripped);
  if (!topic) return null;
  return { topic, reply: ANSWERS[topic] };
}

/** Reverse lookup for rehydrated history: an assistant message is a fast answer
 *  only when its text is exactly one of the versioned strings above. */
export function fastTopicForReply(reply: string): string | null {
  return TOPIC_BY_REPLY.get(String(reply ?? "").trim()) ?? null;
}
