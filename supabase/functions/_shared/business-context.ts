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
export function buildBIContext(profile: Record<string, unknown>): string {
  const parts: string[] = [];
  if (profile.business_description) parts.push(`Business: ${sanitizeForPrompt(String(profile.business_description), 300)}`);
  if (profile.offer) parts.push(`Product/Service: ${sanitizeForPrompt(String(profile.offer), 300)}`);
  if (profile.problem_solved) parts.push(`Problem we solve: ${sanitizeForPrompt(String(profile.problem_solved), 300)}`);
  if (profile.target_customer) parts.push(`Ideal customer: ${sanitizeForPrompt(String(profile.target_customer), 300)}`);
  if (profile.communication_style) parts.push(`Tone & style: ${sanitizeForPrompt(String(profile.communication_style), 200)}`);
  if (Array.isArray(profile.cities) && profile.cities.length > 0) {
    const list = profile.cities
      .map((c) => sanitizeForPrompt(String(c), 60))
      .filter(Boolean)
      .slice(0, 12);
    if (list.length > 0) parts.push(`Cities they sell in: ${list.join(", ")}`);
  }
  if (profile.website_url) parts.push(`Their website: ${sanitizeForPrompt(String(profile.website_url), 120)}`);
  if (profile.autopilot_niche) parts.push(`Chosen niche: ${sanitizeForPrompt(String(profile.autopilot_niche), 80)}`);
  if (profile.dont_claim) parts.push(`HARD RULES — never say or promise: ${sanitizeForPrompt(String(profile.dont_claim), 300)}`);
  if (parts.length === 0) return "";
  return `BUSINESS CONTEXT:\n${parts.join("\n")}\n\n`;
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
  lines.push(who
    ? `- Who they are: ${who}`
    : "- Who they are: (account owner, name not set)");

  lines.push(`- Plan: ${a.plan}${caps ? ` (allows ${caps.emails} emails/month, ${caps.leads} leads)` : ""}`);
  lines.push(`- Gmail for sending: ${a.gmailConnected ? "connected" : "NOT connected (they cannot send yet)"}`);
  lines.push(`- Emails sent today: ${a.todaySent}`);
  lines.push(`- Emails sent this month: ${a.monthSent}${caps ? ` of ${caps.emails}` : ""}`);
  lines.push(`- Leads saved: ${a.leads}`);
  lines.push(`- Campaigns: ${a.campaigns} total, ${a.activeCampaigns} running`);

  if (typeof a.replies === "number" || typeof a.interested === "number") {
    lines.push(`- Replies received: ${a.replies ?? 0}, of which interested: ${a.interested ?? 0}`);
  }

  if (a.businessIncomplete) {
    lines.push(
      "- Business details: NOT filled in yet. They can add them in Settings. "
      + "Do NOT guess or assume what their business is — if it matters, ask them or point them to Settings.",
    );
  }

  return lines.join("\n");
}