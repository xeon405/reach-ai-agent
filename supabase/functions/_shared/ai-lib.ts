// ============================================================
// AI-LIB — shared prompt intelligence for every AI surface.
// Few-shot voice examples, attention-opening playbook, lead
// language detection, and deterministic opener selection so a
// lead never receives the same angle twice across a sequence.
// Pure TS — no network, no Deno deps.
// ============================================================
import { sanitizeForPrompt } from "./groq.ts";
import { COUNTRY_ISO } from "./osm.ts";

const ARABIC_RE = /[\u0600-\u06FF]/;
const ARAB_COUNTRIES = new Set([
  "SA","AE","KW","QA","BH","OM","JO","LB","IQ","PS","YE","LY","TN","DZ","MA","SD","SY","EG",
]);

/** True when the text contains Arabic script characters. */
export function containsArabic(s: string | null | undefined): boolean {
  return !!s && ARABIC_RE.test(s);
}

/** Smarter language detection: Arabic script in the lead's name/company
 *  beats country-only matching; country and sender identity act as fallbacks. */
export function detectLeadLanguage(
  lead: Record<string, any>,
  profile: Record<string, any> | null = null
): "ar" | "en" {
  if (containsArabic(lead.name) || containsArabic(lead.company)) return "ar";
  const raw = String(lead.country ?? "").trim();
  const iso = raw.length === 2 ? raw.toUpperCase() : (COUNTRY_ISO[raw.toLowerCase()] ?? raw.toUpperCase().slice(0, 2));
  if (iso && ARAB_COUNTRIES.has(iso)) return "ar";
  if (profile && (containsArabic(profile.name) || containsArabic(profile.company))) return "ar";
  return "en";
}

/** Stable FNV-1a hash — used to pick a deterministic opener per lead+step.
 *  Same seed → same opener (retries stable); different seed → different angle. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Human attention-grabbing opener angles. The AI adapts the IDEA to the lead
 *  using only facts we feed it — the examples show energy, not copyable words. */
export const ATTENTION_OPENERS: Array<{ key: string; style: string; example: string }> = [
  {
    key: "honest_automation",
    style: "playfully honest — own that this is automated outreach and turn it into a compliment for the reader",
    example: "This is going to look like a mass email — because I automated the boring part. The line you're reading was written for you, though.",
  },
  {
    key: "specificity",
    style: "pin the lead down with the one real, specific thing that made you reach out (only use details provided — never invent)",
    example: "You were the only {category} in {city} I found that does {real detail}. So I'm skipping the generic pitch.",
  },
  {
    key: "zero_fluff",
    style: "promise brevity up front, then actually keep it",
    example: "One idea, one question, then I'm done.",
  },
  {
    key: "breakup_tease",
    style: "tease that this is (nearly) your final attempt — light and human, not needy",
    example: "Last one from me — but it's worth 20 seconds, I promise.",
  },
  {
    key: "contrast",
    style: "acknowledge they get pitched daily, then state the one-line difference you can defend",
    example: "You get pitched every day. Here's the only difference I can defend: {one concrete thing we do for their situation}.",
  },
  {
    key: "short_flex",
    style: "self-aware brevity flex",
    example: "Shorter than most emails in your inbox today. That's the point.",
  },
  {
    key: "bet",
    style: "pattern interrupt — a wry frame-flip or gentle bet",
    example: "They say cold outreach doesn't work. I'm betting on a two-line opener instead.",
  },
];

const OPENERS_BY_KEY = new Map(ATTENTION_OPENERS.map((o) => [o.key, o]));

/** Deterministic attention angle for a lead+step seed. */
export function pickOpenerDirective(seed: string): string {
  const o = OPENERS_BY_KEY.get(seed) ?? ATTENTION_OPENERS[hashString(seed) % ATTENTION_OPENERS.length];
  return `ATTENTION-GRABBING OPENER — you must use this exact angle (adapt the IDEA to the lead with the facts provided; DO NOT copy the example words):\nANGLE: ${o.style}\nEXAMPLE of the energy, not the words: ${o.example}`;
}

/** Human few-shot voice examples. The AI matches this TONE, never the words. */
export const COLD_EMAIL_FEWSHOTS = `REFERENCE VOICE EXAMPLES — match the tone (short, specific, human, a little self-aware). These demonstrate VOICE and STRUCTURE only — write your own sentences, never copy these:
--- Example A
Subject: A junior marketer for your clinic
Body: "Hi Sara, I read a few clinic sites in Amman today — yours is the only one that talks about membership plans, which is exactly what we help clinics launch. We run [pain-point] marketing for local [field] businesses. I can send you what your first month would look like — a one-word 'yes' is all it takes."
--- Example B
Subject: I work with stores like yours
Body: "Hey Omar, quick one. You run [store type], I run an outreach setup that books calls for similar stores. I'm not going to promise numbers — but I can show you one real result. Reply 'sample' and it's yours."
--- Example C
Subject: One idea for [company]
Body: "Hi, I've been following what you're building at [company]. Most [field] firms in [city] don't have [one gap]. We fix that for businesses like yours so [outcome]. Want me to send a short plan?"`;

/** Compact, safe LEAD FACTS block — only present, real fields. Never invents. */
export function buildLeadFacts(lead: Record<string, any>): string {
  const bits: string[] = [];
  if (lead.category) bits.push(`- Category/industry: ${sanitizeForPrompt(String(lead.category), 120)}`);
  if (lead.city) bits.push(`- City: ${sanitizeForPrompt(String(lead.city), 80)}`);
  if (lead.rating != null && lead.rating !== "") bits.push(`- Local rating: ${String(lead.rating)} / 5`);
  if (lead.website) bits.push(`- Has a website: ${sanitizeForPrompt(String(lead.website), 120)}`);
  if (lead.email_status === "valid") bits.push("- Email is verified real — write to the person, they actually read mail.");
  else if (lead.email_status === "risky") bits.push("- Email present but unverified — stay factual and professional.");
  if (lead.email_is_role) bits.push("- Role-based address (info/contact@) — address the human behind it, not a company.");
  if (bits.length === 0) return "";
  return `LEAD FACTS (use them; never invent anything beyond these):\n${bits.join("\n")}\n\n`;
}

/** Non-negotiable self-continuity + honesty rules for ANY reply the AI writes
 *  mid-conversation. Appended to every reply-generation prompt so the writer
 *  never contradicts itself, re-promises, or invents facts. */
export const REPLY_CONTINUITY_RULES = `
CONTINUITY RULES (non-negotiable):
- In the conversation above, lines marked "You:" are the sender's OWN previous replies. Never contradict them, never withdraw a promise or answer already given, and never change a price, capability, or commitment you already stated.
- Never repeat any link, offer, call-to-action, or answer that already appears in the conversation — refer to it as already shared ("the link I sent earlier").
- If the lead asks something already answered, briefly RESTATE the same answer (same facts, fewer words) rather than re-answering differently or dodging.
- Never invent prices, deadlines, features, availability, or facts that are not written in the knowledge base or context provided. If you don't know, say so honestly and stop — never guess.
- Match the lead's energy and length. Answer the question they actually asked before anything else.
`;