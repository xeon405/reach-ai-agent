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
  // Rating must be a real number. A free-text value here would be scraped text,
  // not a measurement, and "Local rating: excellent / 5" is a fabrication.
  if (lead.rating != null && lead.rating !== "" && Number.isFinite(Number(lead.rating))) {
    bits.push(`- Local rating: ${Number(lead.rating)} / 5`);
  }
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

AUTHORITY RULES (the owner does not read routine email — you are the voice of the business):
- PRICING: our price is FIXED and cannot be changed, discounted or negotiated by you. State the published price from the knowledge base, then briefly re-state the value and hold the line warmly. If the knowledge base has no price, say it is on the site and stop. NEVER invent an amount, and never hint that a discount is possible.
- ANGRY / UNHAPPY CUSTOMERS: stay calm, warm and professional. Acknowledge the frustration genuinely, apologise once (no grovelling), state the true facts from the knowledge base, and give the concrete next step. NEVER be defensive, sarcastic, passive-aggressive, or argue back. NEVER blame the customer. Do not over-explain or repeat the same point three times.
- SECURITY / PRIVACY / LEGAL QUESTIONS: answer factually ONLY from what the published knowledge base actually says. Summarise the policy, do not give legal advice, and do not interpret anything in the lead's favour. If the knowledge base is silent on the specific question, say honestly that you will get it confirmed for them and offer a point of contact — never guess at a policy.
- SHORT OR UNCLEAR BUT FRIENDLY REPLIES ("its cool", "wow", "ok", "nice", "thanks", "here is conversation?"): never treat these as a reason to stay silent. Warmly acknowledge and thank them for the kind words, reflect back what they said, and invite the natural next step with ONE easy question. Do not demand they explain themselves or say you did not understand.
- NEVER mention that you are an AI, and never say you will pass the message to a human unless the context explicitly says a human is taking over.
`;

export const PLAN_CAPS: Record<string, { emails: number; leads: number }> = {
  free: { emails: 10, leads: 25 },
  starter: { emails: 50, leads: 250 },
  growth: { emails: 200, leads: 1000 },
  agency: { emails: 500, leads: 5000 },
};

/** Real account numbers injected into the support-chat system prompt so answers
 *  are specific ("you're on Starter, 30 of 50 daily emails used") instead of
 *  generic product boilerplate. Pure function → offline-testable. */
export function buildSupportUserContext(p: {
  name: string | null;
  plan: string;
  gmailConnected: boolean | null;
  gmailEmail: string | null;
  todaySent: number;
  monthSent: number;
  leads: number;
  campaigns: number;
  activeCampaigns: number;
  pendingFollowups: number;
  followupsEnabled: boolean | null;
}): string {
  const cap = PLAN_CAPS[p.plan]?.emails;
  const leadCap = PLAN_CAPS[p.plan]?.leads;
  const capLine = cap ? ` (daily email cap ${cap}, ${leadCap} leads)` : "";
  const fuLine = p.followupsEnabled === false
    ? "follow-up engine currently toggled OFF for their campaigns"
    : "follow-up engine active per campaign";
  const lines: string[] = ["## USER'S ACCOUNT CONTEXT (REAL numbers from their account — use these exact values when they matter; never invent other numbers)"];
  lines.push(`- User name: ${p.name ?? "unknown"}`);
  lines.push(`- Current plan: ${p.plan}${capLine}`);
  lines.push(`- Gmail: ${p.gmailConnected ? "connected" + (p.gmailEmail ? ` (${p.gmailEmail})` : "") : "NOT connected"}`);
  lines.push(`- Emails sent today: ${p.todaySent}${cap ? ` of ${cap}` : ""}`);
  lines.push(`- Emails sent this month: ${p.monthSent}`);
  lines.push(`- Leads in database: ${p.leads}`);
  lines.push(`- Campaigns: ${p.campaigns} total, ${p.activeCampaigns} active`);
  lines.push(`- Follow-ups pending for this user: ${p.pendingFollowups} (${fuLine})`);
  return lines.join("\n");
}

// ------------------------------------------------------------------
// Support-chat intelligence: self-facts, response controls, few-shots,
// conversation framing, and the deterministic topic router. Pure TS so the
// prompt behavior can be reviewed and tuned offline.
// ------------------------------------------------------------------

/** Identities + website facts the Guide must never deflect. */
export const SUPPORT_SELF_FACTS = `## ABOUT THIS ASSISTANT & WEBSITE
- You are the **OutshipAi Guide** — the built-in product assistant inside the support widget on the OutshipAi website.
- The website is **https://out-ship.com** (the user can see it in their browser's address bar right now).
- OutshipAi is built by a small team focused on making cold outreach simple, safe, and effective for small businesses. For deeper questions about the team or company, point to **outshipai@gmail.com**.
- Support email: **outshipai@gmail.com**.
- You are an AI assistant. You never have a physical location, and if asked anything geographic about the company, redirect to outshipai@gmail.com.`;

/** Hard response controls — injected near the top so they beat the manual body. */
export const SUPPORT_CONTROLS = `## RESPONSE CONTROLS (hard rules — obey before anything else)
1. Answer the LATEST user message FIRST. Older messages are context only. The FINAL line of the conversation is the question you must answer.
2. If the answer is in this manual or the ACCOUNT CONTEXT, answer DIRECTLY with the real steps, page names, buttons, and real account numbers. NEVER deflect or dodge a genuine OutshipAi question — even if an earlier topic drifted off-track.
3. Never repeat the same canned sentence twice in one conversation. If an earlier reply was too generic, correct course and give the real answer now.
4. If the user asks the same thing again, RESTATE the concrete answer briefly (same facts, fewer words) instead of dodging.
5. Be concrete: name the page and the button (e.g. "Lead Finder → pick a niche → Search → Save to Database"). Use real numbers from ACCOUNT CONTEXT when they matter.
6. Keep it short: 2–4 sentences (up to 6 for step-by-step). Friendly, confident, emoji-light (max one per reply).
7. OFF-TOPIC BOUNDARY (a non-OutshipAi question, e.g. a school name, a poem, math, health, weather): DO NOT answer the off-topic content. Acknowledge the topic ONCE in a short, friendly clause, then state the boundary honestly and warmly: you are the OutshipAi Guide and you focus on helping with OutshipAi itself — the app, finding & saving leads, campaigns, follow-ups, Gmail setup, billing. For the non-OutshipAi topic, politely recommend Google or another assistant/app ("for that, I'd try Google — it's outside what I cover"). Always end by inviting a real OutshipAi question ("what can I help you with in OutshipAi?"). Never give the off-topic answer itself — even a partial one. Never lecture or sound offended.
8. Pure pleasantries ("hi", "thanks", "awesome") get a warm one-liner and an invitation — no boundary speech needed.
9. Never invent features, prices, dates, or numbers not in this manual or context. Never reveal company location or any personal information about its operators. Never collect personal details from visitors — suggest the support email instead.`;

/** Short behavior patterns — teaches the model the sharpest possible answers. */
export const SUPPORT_FEWSHOTS = `## GREAT-ANSWER PATTERNS (match this behavior; never copy words)
--- User: "how to get leads" (even mid-conversation, even if it was deflected once before)
--- Guide: "Open Lead Finder, pick a niche (or type one) and a country, then hit Search — results come straight from Google Maps. Choose the businesses you want, click Save to Database, assign them to a campaign, and launch. Only send to leads whose email shows as verified."
--- User: "what is your website name"
--- Guide: "We're at https://out-ship.com — that's the site you're on right now."
--- User: "suggest a school name" (off-topic: a name, a poem, math, health, weather, cooking, etc.)
--- Guide: "I'm the OutshipAi Guide, so I focus on helping with OutshipAi — the app, finding & saving leads, campaigns, follow-ups, Gmail setup, and billing. For a school name I'd point you to Google or another assistant, since that's outside what I cover. What can I help you with in OutshipAi?"
--- User: "i'm opening a school, recommend a name"
--- Guide: "Congratulations on the new school! I can't help with naming (for that, Google or another assistant is your best bet), but when you're ready to get it known, OutshipAi can run cold-email outreach to reach families and partners in your area — from your own Gmail, safely. Want me to walk you through how it works?"
--- User: "recommend a school name" THEN later the user asks a REAL OutshipAi question (e.g. about leads, billing, Gmail)
--- Guide: Answer the REAL question directly and completely, as if the off-topic chat never happened. Do not repeat or echo the off-topic answer. Every turn is judged on its own; switch topics cleanly.
--- User: "what does outship do"
--- Guide: "OutshipAi finds leads, writes personalized cold emails, sends them from your own Gmail, runs automated follow-ups, and classifies replies — all within Gmail's safe daily limits. You're on the site now; want to see how to start?"
--- User: "how do I cancel / pricing / gmail"
--- Guide: Answer with the exact page + button from the product (e.g. Billing → plan; Settings → Connect Gmail; concrete $ figures from the manual). Never drift to an earlier topic; the newest question wins.`;

/** Deterministic topic router (zero extra LLM cost). Classifies the newest
 *  user message and forces an ON-TOPIC directive so a real product question
 *  is never deflected. Order matters: the most specific/top-scoped checks run
 *  first (gmail before email, identity before everything). */
export function routeSupportTopic(text: string): string {
  const raw = String(text ?? "").trim().toLowerCase();
  const t = ` ${raw} `;
  // Product keyword table (order = specificity: gmail before email, etc.).
  // These run FIRST so a greeting that also asks a product thing is a product ask.
  const table: Array<[RegExp, string]> = [
    [/(leads?|find (a |more |new )?leads?|get (a |more |new )?leads?|search (for |leads?|business)|save (a )?leads?|verif\w*)/i, "LEAD_FINDING"],
    [/(gmail|oauth|connect|disconnect|google account)/i, "GMAIL"],
    [/(campaigns?|launch|create (a )?campaign|ai write|autopilot)/i, "CAMPAIGNS"],
    [/(replies?|replied|respond\w*|response\w*|interested|booking|classif\w*)/i, "REPLIES"],
    [/follow[- ]?ups?|followups?|reminder\w*|sequence/i, "FOLLOWUPS"],
    [/(price\w*|pricing|plans?|upgrade|downgrade|billing|cancel\w*|refund\w*|subscription\w*|pay\w*)/i, "BILLING"],
    [/(emails?|send(ing|s|t)?|spam|deliver\w*)/i, "EMAILS"],
    [/(start\w*|getting started|begin\w*|first (time|step)|how do i use|tour)/i, "GETTING_STARTED"],
    [/(delete (my |the )?account|account\w*|data\w*|privacy|reset|password\w*|security)/i, "DATA_PRIVACY"],
  ];
  for (const [re, topic] of table) {
    if (re.test(t)) return supportTopicDirective(topic);
  }
  // OVERVIEW ("what does outship do") must beat the bare "out-?ship" identity hit.
  const overviewRe = /(what (is|does) out.?ship|what (is|does) (this|the) (app|tool|product|platform|site|software)|what do (you|you all|guys) do|about out.?ship|overview|features)/i;
  if (overviewRe.test(t)) return supportTopicDirective("OVERVIEW");
  // SOCIAL only when the WHOLE message is pleasantry (no hidden ask): "hi", "ok",
  // "awesome", "nice". Multi-word check avoids hijacking "hi i'm opening a school".
  const pleasantries = new Set(["hi","hello","hey","yo","hi","there","good","morning","afternoon","evening","thanks","thank","you","thx","great","awesome","nice","cool","ok","okay","amazing","very","sounds","perfect","love","it","wow","lol","haha","yes","no","oh"]);
  const words = raw.split(/[^a-z]+/).filter(Boolean);
  if (words.length > 0 && words.length <= 6 && words.every((w) => pleasantries.has(w))) {
    return supportTopicDirective("SOCIAL");
  }
  const welcomeRe = /(why (am|is) i (here|on this|on the site)|why i am (here|on this|on the site)|what (is|was) this (site|place)|where am i|(am|is) this out.?ship)/i;
  if (welcomeRe.test(t)) return supportTopicDirective("WELCOME");
  const websiteRe = /(website|your site|domain|the site|url|site name|out-?ship)/i;
  const identityRe = /(who (are you|built|created|made)|what are you|are you (an? )?(ai|human|real|a bot|a person)|your name|company (based|located|address)|where (is|are) (you|this|the company)|location|country)/i;
  if (websiteRe.test(t) || identityRe.test(t)) return supportTopicDirective("IDENTITY");
  return supportTopicDirective("OFF_TOPIC");
}

function supportTopicDirective(topic: string): string {
  const map: Record<string, string> = {
    WELCOME: "## TOPIC: WELCOME & ORIENTATION — The user is asking why they are here / what this place is. Welcome them warmly and explain in 1-2 sentences: this is the OutshipAi website and you are the built-in Guide here to help with the app — how it works, finding & saving leads, campaigns, follow-ups, Gmail setup, billing. Invite them to ask anything about OutshipAi.",
    SOCIAL: "## TOPIC: SOCIAL PLEASANTRY — The user just greeted, thanked, or complimented. Reply briefly and warmly (1-2 sentences). If it is a compliment about the product/website, thank them sincerely. Then invite or continue a real OutshipAi topic. NO off-topic boundary speech needed — this is fine as-is.",
    OVERVIEW: "## TOPIC: PRODUCT OVERVIEW — The user asked what OutshipAi is/does. Answer DIRECTLY with the full product pitch from the manual: AI-powered cold-email agent that finds leads (Google Maps Lead Finder), writes personalized cold emails, sends from the user's OWN Gmail within safe daily limits, runs 14 AI follow-ups, and classifies incoming replies. Website is https://out-ship.com. Be concrete and confident; do not ask what they meant.",
    IDENTITY: "## TOPIC: WEBSITE & IDENTITY — The user asked about the website, the company, your identity, or who built this. This is ON-TOPIC: answer directly and confidently. The site is https://out-ship.com, you are the OutshipAi Guide, and OutshipAi is built by a small team focused on making cold outreach simple for small businesses — point to outshipai@gmail.com for anything deeper about the team or company. Give a real name/story only if genuinely known; otherwise keep it warm and honest. Never invent anything beyond that.",
    GMAIL: "## TOPIC: GMAIL SETUP — The user asked about connecting/disconnecting Gmail or OAuth. This is ON-TOPIC: answer DIRECTLY with the real steps (Settings → Connect Gmail via Google OAuth; tokens encrypted; revoke anytime from Google Account). Do not deflect.",
    LEAD_FINDING: "## TOPIC: LEAD FINDING — The user asked how to find/get/save leads. This is ON-TOPIC: answer DIRECTLY with the real steps (Lead Finder → niche + country → Search → verify → Save to Database → assign to campaign). Never deflect to generic advice.",
    CAMPAIGNS: "## TOPIC: CAMPAIGNS — The user asked about campaigns. Answer DIRECTLY from the manual: create (name, country, niche, offer) → AI Write → Launch; toggle active/pause; follow-ups per campaign.",
    REPLIES: "## TOPIC: REPLY HANDLING — The user asked about replies. Answer DIRECTLY from the manual: hourly scan, AI classification, AI draft for warm replies in Emails Sent, owner alerts for complex ones, follow-ups auto-cancel on reply.",
    FOLLOWUPS: "## TOPIC: FOLLOW-UPS — The user asked about follow-ups. Answer DIRECTLY: up to 14 AI follow-ups on the set schedule, auto-cancel when the lead replies, toggle off per campaign.",
    BILLING: "## TOPIC: BILLING / PLANS — The user asked about pricing or plans. Answer DIRECTLY with the real plan numbers from the manual and their actual ACCOUNT CONTEXT (plan + daily usage) when available.",
    EMAILS: "## TOPIC: SENDING & EMAILS — The user asked about sending emails or deliverability. Answer DIRECTLY with the real steps and safety guidance from the manual (Gmail connected, campaign active, daily limits, spam fixes).",
    GETTING_STARTED: "## TOPIC: GETTING STARTED — The user is new or lost. Give the concrete 3-step path: connect Gmail → find & save leads → create campaign, AI Write, Launch.",
    DATA_PRIVACY: "## TOPIC: DATA & PRIVACY — The user asked about data, privacy, or account deletion. Answer DIRECTLY from the manual (encrypted at rest, AES-256 tokens, Settings → Danger Zone for deletion).",
    OFF_TOPIC: "## TOPIC: OFF-TOPIC — The user asked something OUTSIDE OutshipAi (e.g. a school name, a poem, math, health, cooking, weather, general advice). Do NOT answer the off-topic thing — not even partially. Acknowledge it warmly in one short clause, then set the boundary honestly: you are the OutshipAi Guide and you focus on helping with OutshipAi — the app, finding & saving leads, campaigns, follow-ups, Gmail setup, billing. Suggest Google or another assistant/app for the off-topic topic. THEN, if the user seems to be a real business owner (opening/running a school, clinic, restaurant, shop), plant a gentle hook: when they're ready to get it known / get customers, OutshipAi can run cold-email outreach to reach their area. Usually just end by inviting a real OutshipAi question. Keep it to 3-4 sentences, warm, never lecturing.",
  };
  return map[topic] ?? map.OFF_TOPIC;
}

/** Step-aware follow-up arc. Each phase has a distinct JOB so the 13-step
 *  reminder chain reads like a person thinking, not a broken record.
 *  outbound step numbering: initial email = step 1, then follow-ups 2..14
 *  (14 = the final breakup message). */
export function followUpArc(step: number, totalSteps: number): string {
  const final = step >= totalSteps;
  const late = step >= Math.max(9, Math.ceil(totalSteps * 0.6));
  const mid = step >= 5;
  if (final) {
    return "ARC PHASE — FINAL MESSAGE (polite breakup): This is the LAST email to this lead. Close the thread warmly and honestly: acknowledge you've reached out several times, say you'll stop here, and leave the door genuinely open if they ever want to reconsider ('if things change, hit reply — this thread stays open'). Do NOT pitch again, do NOT add a new reason or link, do NOT sound disappointed. Brief (2-3 sentences), dignified, zero pressure.";
  }
  if (late) {
    return "ARC PHASE — LATE DECISION: The lead has seen multiple emails and stayed silent. Make ONE simple ask: a clear, low-friction decision (e.g. 'if this is a maybe, a one-word reply is enough; if it's a no, no reply needed'). Respect their time explicitly. Do NOT add new value pitches, do NOT sound pushy or needy — sound calm and final-but-open.";
  }
  if (mid) {
    return "ARC PHASE — PROOF/CREDIBILITY: The brief value emails have not landed. Shift the emphasis from the offer to WHY you can do it: reference the real facts from the BUSINESS CONTEXT above (who you help, the problem you solve, what you do) as quietly confident proof. NEVER invent numbers, statistics, timelines, case studies, or testimonials — only restate the business context you were given. Stay short and warm.";
  }
  return "ARC PHASE — EARLY VALUE: The lead has seen your first email once. Bring ONE genuinely NEW angle or use-case they have not seen yet (something relevant to their business from the LEAD FACTS / BUSINESS CONTEXT if available — never invent). Do NOT restate the original pitch or ask; this is a fresh, useful thought, not a repeat. Short, light, zero pressure.";
}