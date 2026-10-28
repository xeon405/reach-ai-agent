// ---------------------------------------------------------------------------
// Business + account context for AI prompts.
//
// WHY THIS FILE EXISTS
// The business facts already live in `profiles` - Settings writes them for the
// email-writing AI (business_description, offer, problem_solved,
// target_customer, cities, communication_style, dont_claim). Two functions
// were reading them through their OWN private copy of buildBIContext
// (inbox-agent, send-worker), so every fix had to be made twice, and the
// agent - which most needs this - read none of it.
//
// One shared copy now. All three callers import from here.
//
// SAFETY
// dont_claim is a hard rule the owner typed ("never promise X"). It is marked
// HARD RULES so the model treats it as a constraint, not a suggestion. It must
// never be dropped or summarised away.
// ---------------------------------------------------------------------------

import { sanitizeForPrompt } from "./groq.ts";
import { PLAN_CAPS } from "./ai-lib.ts";

/** Minimal shape of the `profiles` columns this module reads. */
export interface BusinessProfile {
  name?: string | null;
  company?: string | null;
  business_description?: string | null;
  offer?: string | null;
  problem_solved?: string | null;
  target_customer?: string | null;
  cities?: string[] | null;
  communication_style?: string | null;
  dont_claim?: string | null;
  website_url?: string | null;
  phone?: string | null;
  plan?: string | null;
}

const clean = (v: unknown, max: number): string | null => {
  if (v === null || v === undefined) return null;
  const s = sanitizeForPrompt(String(v), max).trim();
  return s.length ? s : null;
};

/**
 * Build structured business intelligence context for AI prompts.
 * Moved verbatim from inbox-agent/send-worker so behaviour cannot drift.
 * Returns "" when the owner has filled in nothing (handled, not invented).
 */
/**
 * Split a free-text city list into clean entries.
 *
 * Two separate defects live here:
 *
 * 1. Settings splits the box on "," only, so a list typed as one line round-trips
 *    as N entries but loses the line structure, and rows already in the database
 *    have neighbouring cities glued together with a country label stuck in the
 *    middle: "Miami UK: London", "Manchester Canada: Toronto".
 * 2. Those glued rows reached the prompt verbatim, wasting attention on noise.
 *
 * So: split on separators, then split again on a "Country:" prefix, dedupe
 * case-insensitively, and cap. A country label alone carries no city, so it is
 * dropped rather than rendered as if it were a place.
 */
function normaliseCities(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  // "UK: London", "US: New York", "UAE: Dubai"
  const countryPrefix = /(?:^|\s)(?:[A-Z]{2,3}|[A-Z][a-z]{2,11}):\s*/g;
  const seen = new Set<string>();
  const out: string[] = [];

  for (const entry of raw) {
    // The country label is the only thing separating two glued cities in the
    // stored rows ("Miami UK: London"), so it must become a BREAK, not a space.
    const marked = String(entry).replace(countryPrefix, "\n");
    for (const part of marked.split(/[,;\n]/)) {
      const v = sanitizeForPrompt(part, 40).trim().replace(/\s+/g, " ");
      if (!v) continue;
      const key = v.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(v);
      if (out.length >= 12) return out;
    }
  }
  return out;
}

export function buildBIContext(
  profile: Record<string, unknown>,
  opts: { sharePhone?: boolean } = {},
): string {
  const parts: string[] = [];
  // Deliberately terse. This block competes for the model's attention with the
  // shorter conversation-derived profile, and at full length the model kept
  // reaching for that tidier block instead and answering from stale memory.
  if (profile.business_description)
    parts.push(`Business: ${clean(profile.business_description, 220)}`);
  if (profile.offer) parts.push(`Product/Service: ${clean(profile.offer, 220)}`);
  if (profile.target_customer) parts.push(`Ideal customer: ${clean(profile.target_customer, 240)}`);
  if (profile.problem_solved) parts.push(`Problem we solve: ${clean(profile.problem_solved, 200)}`);
  const cities = normaliseCities(profile.cities);
  if (cities.length) parts.push(`Cities they sell in: ${cities.join(", ")}`);
  if (profile.website_url) parts.push(`Their website: ${clean(profile.website_url, 100)}`);
  // Only surfaced on live lead replies (opt-in), never in cold-email generation,
  // and it is the ONLY phone the reply AI is ever allowed to write.
  if (opts.sharePhone && profile.phone)
    parts.push(`Owner's direct phone (the ONLY number you may ever share, and only when the lead asks to call or asks for a number): ${clean(profile.phone, 40)}`);
  if (profile.autopilot_niche) parts.push(`Chosen niche: ${clean(profile.autopilot_niche, 70)}`);
  if (profile.communication_style)
    parts.push(`Tone & style: ${clean(profile.communication_style, 160)}`);
  // A hard rule the model can skim past is worse than a short one it obeys, so
  // this keeps the leading rules and the owner's own summary line.
  if (profile.dont_claim) {
    const rules = clean(profile.dont_claim, 420);
    if (rules) parts.push(`HARD RULES — never say or promise: ${rules}`);
  }
  const usable = parts.filter((p): p is string => typeof p === "string" && p.length > 0);
  if (usable.length === 0) return "";
  return `BUSINESS CONTEXT (saved by the owner in Settings — this is the source of truth about their business; these are NOT facts about the lead/recipient. "Ideal customer", "Cities they sell in" and "Chosen niche" describe who the sender TARGETS — never state or imply them about the recipient):\n${usable.join("\n")}\n\n`;
}

// ---------------------------------------------------------------------------
// Agent account snapshot.
//
// The support chatbot already does this for its own lane (buildSupportUserContext
// in ai-lib.ts). The agent had no equivalent: it had to run a mid-answer lookup
// for every number, and answered with "I don't know" far more often than the
// support bot sitting next to it.
//
// Same principle, same wording rule: these are REAL values, so use exactly
// these and never invent another number.
// ---------------------------------------------------------------------------

export interface AgentAccountSnapshot {
  name?: string | null;
  company?: string | null;
  plan: string;
  gmailConnected?: boolean | null;
  todaySent: number;
  monthSent: number;
  leads: number;
  campaigns: number;
  activeCampaigns: number;
  replies?: number;
  interested?: number;
  businessIncomplete?: boolean;
}

/**
 * Render the account snapshot for the agent prompt.
 *
 * `businessIncomplete` marks an owner who has NOT filled in Settings. That is
 * reported honestly and answered with a pointer to Settings - the agent must
 * never guess a business it was never told.
 */
export function buildAgentAccountContext(a: AgentAccountSnapshot): string {
  const caps = PLAN_CAPS[a.plan];
  const lines: string[] = [
    "## THEIR ACCOUNT (real values, read just now — use exactly these, never invent another number)",
  ];

  const who = [clean(a.name, 80), clean(a.company, 120)].filter(Boolean).join(", runs ");
  lines.push(who ? `- Who they are: ${who}` : "- Who they are: (account owner, name not set)");

  lines.push(
    `- Plan: ${a.plan}${caps ? ` (allows ${caps.emails} emails/month, ${caps.leads} leads)` : ""}`,
  );
  lines.push(
    `- Gmail for sending: ${a.gmailConnected ? "connected" : "NOT connected (they cannot send yet)"}`,
  );
  lines.push(`- Emails sent today: ${a.todaySent}`);
  lines.push(`- Emails sent this month: ${a.monthSent}${caps ? ` of ${caps.emails}` : ""}`);
  lines.push(`- Leads saved: ${a.leads}`);
  lines.push(`- Campaigns: ${a.campaigns} total, ${a.activeCampaigns} running`);

  if (typeof a.replies === "number" || typeof a.interested === "number") {
    lines.push(`- Replies received: ${a.replies ?? 0}, of which interested: ${a.interested ?? 0}`);
  }

  if (a.businessIncomplete) {
    lines.push(
      "- Business details: NOT filled in yet. They can add them in Settings. " +
        "Do NOT guess or assume what their business is — if it matters, ask them or point them to Settings.",
    );
  }

  return lines.join("\n");
}

/**
 * A useful answer built with zero AI calls, for the rare turn where the model
 * is unreachable.
 *
 * The previous line here was "I could not work that out just now." It was the
 * worst possible reply: the agent already holds this user's plan, lead count
 * and campaign count, so it was refusing to answer a question it could partly
 * answer, and it read like a form rejection.
 *
 * Two rules keep this honest rather than a fake answer:
 *   - Say plainly that the model is unreachable. Never imply we understood the
 *     question we could not read.
 *   - Report only real numbers from the snapshot.
 *
 * Kept deliberately short. This path fires during an incident; a long canned
 * paragraph would be its own kind of failure.
 */
export function degradedReply(facts?: AgentAccountSnapshot | null): string {
  if (!facts) {
    return "I can't reach my language model right now, so I won't guess at your question. Give me a moment and ask me again.";
  }

  // Deliberately not addressing them by name. Taking a first name out of a full
  // name turns "Health Check" into "Health," and "Mary Jane Watson" into "Mary",
  // which reads as broken at exactly the moment we can least afford to look
  // broken. The numbers below identify them fine.
  const opener = "I can't reach my language model right now, so I won't guess at your question.";

  const sentences: string[] = [];
  const plan = (facts.plan || "").trim();
  if (plan) sentences.push(`You're on the ${plan} plan.`);

  const bits: string[] = [];
  if (facts.leads > 0) bits.push(`${facts.leads} saved ${facts.leads === 1 ? "lead" : "leads"}`);
  if (facts.activeCampaigns > 0) {
    bits.push(
      `${facts.activeCampaigns} live ${facts.activeCampaigns === 1 ? "campaign" : "campaigns"}`,
    );
  }
  if (facts.replies) bits.push(`${facts.replies} repl${facts.replies === 1 ? "y" : "ies"}`);
  // Replies outrank send volume: what came back matters more than what went out.
  if (facts.monthSent > 0) {
    bits.push(`${facts.monthSent} email${facts.monthSent === 1 ? "" : "s"} sent this month`);
  }

  if (bits.length) sentences.push(`Right now you have ${bits.slice(0, 3).join(", ")}.`);
  else
    sentences.push("There's nothing saved on the account yet, so we'd be starting from scratch.");

  return `${opener} ${sentences.join(" ")} Give me a moment and ask me again.`;
}
