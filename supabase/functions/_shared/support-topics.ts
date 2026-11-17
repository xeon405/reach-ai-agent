// ============================================================================
// SUPPORT TOPIC ROUTER — pure, deterministic, zero model calls.
//
// It answers "which parts of the product manual does this message touch?", not
// "what does the user mean?". That distinction is the safety property: a
// multi-topic message returns every topic so no half of the question is dropped,
// and anything unrecognised returns OFF_TOPIC so the caller uses the full manual
// and the model instead of a thin guess.
//
// Pure TS: no imports beyond the pure capability boundary, no Deno globals, no
// network. The Node suite runs this exact file.
// ============================================================================
import { isPersonalContactRequest } from "./support-boundary.ts";

/** Deterministic topic router (zero extra LLM cost). Classifies the newest
 *  user message and forces an ON-TOPIC directive so a real product question
 *  is never deflected. Order matters: the most specific/top-scoped checks run
 *  first (personal-data boundary, gmail before email, identity before all).
 *
 *  Returns EVERY topic the message touches, not just the first. A message like
 *  "my campaign is not sending" is a campaign question AND a sending question;
 *  answering only one half is a wrong answer even when each half is correct. */
export function supportTopicHits(text: string): string[] {
  const raw = String(text ?? "").trim().toLowerCase();
  const t = ` ${raw} `;
  // The capability boundary runs before every keyword rule. A message that
  // asks for private people's contact data must never be re-read as a
  // sending question just because it contains the word "emails".
  if (isPersonalContactRequest(raw)) return ["PERSONAL_DATA"];
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
    [/(\bstart(ed|ing)?\b|\bbegin(ner|ning)?\b|getting started|first (time|step)|how do i use|\btour\b)/i, "GETTING_STARTED"],
    [/(delete (my |the )?account|account\w*|data\w*|privacy|reset|password\w*|security)/i, "DATA_PRIVACY"],
  ];
  const hits: string[] = [];
  for (const [re, topic] of table) {
    if (re.test(t) && !hits.includes(topic)) hits.push(topic);
  }
  if (hits.length) return hits;
  // OVERVIEW ("what does outship do") must beat the bare "out-?ship" identity hit.
  const overviewRe = /(what (is|does) out.?ship|what (is|does) (this|the) (app|tool|product|platform|site|software)|what do (you|you all|guys) do|about out.?ship|overview|features)/i;
  if (overviewRe.test(t)) return ["OVERVIEW"];
  // SOCIAL only when the WHOLE message is pleasantry (no hidden ask): "hi", "ok",
  // "awesome", "nice". Multi-word check avoids hijacking "hi i'm opening a school".
  const pleasantries = new Set(["hi","hello","hey","yo","hi","there","good","morning","afternoon","evening","thanks","thank","you","thx","great","awesome","nice","cool","ok","okay","amazing","very","sounds","perfect","love","it","wow","lol","haha","yes","no","oh"]);
  const words = raw.split(/[^a-z]+/).filter(Boolean);
  if (words.length > 0 && words.length <= 6 && words.every((w) => pleasantries.has(w))) {
    return ["SOCIAL"];
  }
  const welcomeRe = /(why (am|is) i (here|on this|on the site)|why i am (here|on this|on the site)|what (is|was) this (site|place)|where am i|(am|is) this out.?ship)/i;
  if (welcomeRe.test(t)) return ["WELCOME"];
  const websiteRe = /(website|your site|domain|the site|url|site name|out-?ship)/i;
  const identityRe = /(who (are you|built|created|made)|what are you|are you (an? )?(ai|human|real|a bot|a person)|your name|company (based|located|address)|where (is|are) (you|this|the company)|location|country)/i;
  if (websiteRe.test(t) || identityRe.test(t)) return ["IDENTITY"];
  return ["OFF_TOPIC"];
}

export function routeSupportTopic(text: string): string {
  return supportTopicDirective(supportTopicHits(text)[0] ?? "OFF_TOPIC");
}

function supportTopicDirective(topic: string): string {
  const map: Record<string, string> = {
    WELCOME: "## TOPIC: WELCOME & ORIENTATION — The user is asking why they are here / what this place is. Welcome them warmly and explain in 1-2 sentences: this is the OutshipAi website and you are the built-in Guide here to help with the app — how it works, finding & saving leads, campaigns, follow-ups, Gmail setup, billing. Invite them to ask anything about OutshipAi.",
    SOCIAL: "## TOPIC: SOCIAL PLEASANTRY — The user just greeted, thanked, or complimented. Reply briefly and warmly (1-2 sentences). If it is a compliment about the product/website, thank them sincerely. Then invite or continue a real OutshipAi topic. NO off-topic boundary speech needed — this is fine as-is.",
    OVERVIEW: "## TOPIC: PRODUCT OVERVIEW — The user asked what OutshipAi is/does. Answer DIRECTLY with the full product pitch from the manual: AI-powered cold-email agent that finds leads (Google Maps Lead Finder), writes personalized cold emails, sends them from the user's OWN Gmail within safe daily limits, runs four follow-ups by default on day 3, 7, 14 and 21, and classifies incoming replies. Website is https://out-ship.com. Be concrete and confident; do not ask what they meant.",
    IDENTITY: "## TOPIC: WEBSITE & IDENTITY — The user asked about the website, the company, your identity, or who built this. This is ON-TOPIC: answer directly and confidently. The site is https://out-ship.com, you are the OutshipAi Guide, and OutshipAi is built by a small team focused on making cold outreach simple for small businesses — point to outshipai@gmail.com for anything deeper about the team or company. Give a real name/story only if genuinely known; otherwise keep it warm and honest. Never invent anything beyond that.",
    GMAIL: "## TOPIC: GMAIL SETUP — The user asked about connecting/disconnecting Gmail or OAuth. This is ON-TOPIC: answer DIRECTLY with the real steps (Settings → Connect Gmail via Google OAuth; tokens encrypted; revoke anytime from Google Account). Do not deflect.",
    LEAD_FINDING: "## TOPIC: LEAD FINDING — The user asked how to find/get/save leads. This is ON-TOPIC: answer DIRECTLY with the real steps (Contacts → Find Leads with AI → niche + country → Find Leads → select businesses → Add to Campaign; only email addresses marked verified). Never deflect to generic advice.",
    PERSONAL_DATA: `## TOPIC: PERSONAL CONTACT DATA — THE USER IS ASKING FOR PRIVATE PEOPLE'S CONTACT DETAILS (parents, students, residents, patients, individuals, consumers). This is a HARD CAPABILITY BOUNDARY. Obey exactly:
1. Answer NO in the first sentence. Never bury the refusal.
2. State the real scope: OutshipAi has BUSINESS contact addresses from public business listings (Google Maps / OpenStreetMap) and from addresses published on business websites. It has no consumer or private-person records, and does not buy, scrape or sell personal emails.
3. Never imply the Lead Finder can produce them. Never say "try searching for parents". Never offer a workaround that acquires personal data without consent.
4. Say plainly that cold-emailing individuals without consent is restricted by law in many markets (GDPR/ePrivacy in the EU/UK, CASL in Canada), and that a scraped list would damage their sending domain.
5. Then give the real alternatives: (a) email the surrounding BUSINESSES — tuition centres, coaching institutes, schools, agencies; (b) if they already hold a consented list, import it via Leads → Import CSV; (c) for parents, use opt-in channels — their own form, WhatsApp/Telegram groups, school newsletters, local groups.
6. Do not lecture. Four to eight short lines, warm and practical, ending with an offer to help with the business search.
Do NOT answer this as a sending/deliverability question. Do NOT give a Gmail setup checklist.`,
    CAMPAIGNS: "## TOPIC: CAMPAIGNS — The user asked about campaigns. Answer DIRECTLY from the manual: New Campaign → name → Create → Review → Preview the AI-written email → Launch; toggle active/pause; follow-ups per campaign.",
    REPLIES: "## TOPIC: REPLY HANDLING — The user asked about replies. Answer DIRECTLY from the manual: hourly scan, AI classification, AI draft for warm replies in Emails Sent, owner alerts for complex ones, follow-ups auto-cancel on reply.",
    FOLLOWUPS: "## TOPIC: FOLLOW-UPS — The user asked about follow-ups. Answer DIRECTLY: four follow-ups by default on day 3, 7, 14 and 21, auto-cancel when the lead replies, toggle off per campaign.",
    BILLING: "## TOPIC: BILLING / PLANS — The user asked about pricing or plans. Answer DIRECTLY with the real plan numbers from the manual and their actual ACCOUNT CONTEXT (plan + daily usage) when available. Paid checkout is currently closed while payments are being verified: the plans are listed, the buy buttons are hidden, and the user should start free or email outshipai@gmail.com. Never invent a checkout button, a billing period, or a downgrade path. When checkout is open, payment is one-time, never auto-renews, and there is no self-serve downgrade.",
    EMAILS: "## TOPIC: SENDING & EMAILS — The user asked about sending emails or deliverability. Answer DIRECTLY with the real steps and safety guidance from the manual (Gmail connected, campaign active, daily limits, spam fixes).",
    GETTING_STARTED: "## TOPIC: GETTING STARTED — The user is new or lost. Give the concrete 3-step path: connect Gmail → find & save leads → New Campaign → Review → Preview → Launch.",
    DATA_PRIVACY: "## TOPIC: DATA & PRIVACY — The user asked about data, privacy, or account deletion. Answer DIRECTLY from the manual (encrypted at rest, AES-256 tokens, Settings → Danger zone → Delete).",
    OFF_TOPIC: "## TOPIC: OFF-TOPIC — The user asked something OUTSIDE OutshipAi (e.g. a school name, a poem, math, health, cooking, weather, general advice). Do NOT answer the off-topic thing — not even partially. Acknowledge it warmly in one short clause, then set the boundary honestly: you are the OutshipAi Guide and you focus on helping with OutshipAi — the app, finding & saving leads, campaigns, follow-ups, Gmail setup, billing. Suggest Google or another assistant/app for the off-topic topic. THEN, if the user seems to be a real business owner (opening/running a school, clinic, restaurant, shop), plant a gentle hook: when they're ready to get it known / get customers, OutshipAi can run cold-email outreach to reach their area. Usually just end by inviting a real OutshipAi question. Keep it to 3-4 sentences, warm, never lecturing.",
  };
  return map[topic] ?? map.OFF_TOPIC;
}
