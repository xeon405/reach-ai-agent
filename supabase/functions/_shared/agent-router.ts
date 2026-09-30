// ============================================================================
// AGENT ROUTER — intent-first, deterministic, zero AI calls.
//
// This is the whole point of the design: a known request is a string match and
// a database query, not a model call. Only a request we do not recognise
// falls through to the AI, and even that is cached into this same shape
// afterwards so the same phrasing never costs a second call.
//
// Pure: no imports, no I/O, no Deno globals. That is what lets the test suite
// run it under Node and stay honest about what ships.
// ============================================================================

export type AgentIntent =
  | "list_campaigns"
  | "campaign_stats"
  | "find_contacts"
  | "add_contacts_to_campaign"
  | "create_campaign_draft"
  | "pause_campaign"
  | "compliance_check"
  | "sender_health";

/** READ intents are safe to run without asking. WRITE intents need a confirm. */
export const READ_INTENTS: readonly AgentIntent[] = [
  "list_campaigns",
  "campaign_stats",
  "find_contacts",
  "compliance_check",
  "sender_health",
];

export const WRITE_INTENTS: readonly AgentIntent[] = [
  "add_contacts_to_campaign",
  "create_campaign_draft",
  "pause_campaign",
];

export function isWriteIntent(intent: AgentIntent): boolean {
  return WRITE_INTENTS.includes(intent);
}

export interface AgentRequest {
  intent: AgentIntent;
  /** Extracted arguments. Absent ones stay undefined rather than guessed. */
  params: {
    query?: string;
    company?: string;
    city?: string;
    country?: string;
    category?: string;
    limit?: number;
    campaignName?: string;
    campaignId?: string;
  };
  /** What the user asked, restated in plain words. Shown before a write runs. */
  summary: string;
}

/** Lowercase, strip accents/punctuation, collapse whitespace. */
function norm(s: unknown): string {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const CAP: Record<string, string> = { us: "United States", usa: "United States", gb: "United Kingdom", uk: "United Kingdom", ae: "United Arab Emirates", uae: "United Arab Emirates", sa: "Saudi Arabia", qa: "Qatar", kw: "Kuwait", bh: "Bahrain", om: "Oman", eg: "Egypt", in: "India", de: "Germany", fr: "France", es: "Spain", it: "Italy", nl: "Netherlands", ca: "Canada", au: "Australia", nz: "New Zealand", ie: "Ireland", pl: "Poland", se: "Sweden", no: "Norway", dk: "Denmark" };

/** Extract a country from either a name or a 2-letter code. */
function findCountry(s: string): string | undefined {
  const countries = [
    "united states", "united kingdom", "united arab emirates", "saudi arabia",
    "new zealand", "south africa", "singapore", "australia", "canada", "germany",
    "france", "spain", "italy", "netherlands", "india", "egypt", "qatar", "kuwait",
    "bahrain", "oman", "ireland", "poland", "sweden", "norway", "denmark",
  ];
  for (const c of countries) {
    if (s.includes(c)) {
      // Matched names are stored lowercase for matching, but this value is used
      // to filter the database and shown to the user, so it must be cased
      // consistently with the 2-letter path.
      return c.replace(/\b[a-z]/g, (m) => m.toUpperCase());
    }
  }
  // A short code only counts when it is the place after "in"/"near"/"around".
  // Without that guard "find dentists in uae" reads the standalone word "in" as
  // the country code for India. Codes are 2 or 3 letters (UK, AE, UAE, USA).
  const m = s.match(/\b(?:in|near|around|within)\s+([a-z]{2,3})\b/);
  if (m && CAP[m[1]]) return CAP[m[1]];
  return undefined;
}

/** "20" / "ten" / "a dozen" -> number. Bounded so a request cannot ask for 100k rows. */
function findCount(s: string): number | undefined {
  const digits = s.match(/\b(\d{1,5})\b/);
  if (digits) return Math.min(Math.max(parseInt(digits[1], 10), 1), 200);
  const words: Record<string, number> = {
    five: 5, ten: 10, fifteen: 15, twenty: 20, thirty: 30, forty: 40,
    fifty: 50, a: 1, an: 1, couple: 2, few: 5, dozen: 12, hundred: 100,
  };
  for (const w of Object.keys(words)) {
    if (new RegExp(`\\b${w}\\b`).test(s)) return words[w];
  }
  return undefined;
}

function afterPrep(s: string, ...preps: string[]): string | undefined {
  for (const p of preps) {
    const i = s.indexOf(p);
    if (i !== -1) {
      const rest = s.slice(i + p.length).trim();
      const stop = rest.search(/\b(?:in|near|for|from|with|and|but|who|that|at)\b/);
      const val = (stop === -1 ? rest : rest.slice(0, stop)).trim();
      if (val) return val;
    }
  }
  return undefined;
}

function findCity(s: string): string | undefined {
  const v = afterPrep(s, "in ", "near ", "around ");
  if (!v) return undefined;
  const stop = v.search(/\b(?:for|from|with|and|but|who|that|at|as)\b/);
  const city = (stop === -1 ? v : v.slice(0, stop)).trim();
  return city && city.length <= 60 ? city : undefined;
}

function has(s: string, ...words: string[]): boolean {
  return words.some((w) => s.includes(w));
}

const STOP_AFTER_FIND = /\b(?:in|near|around|for|from|with|and|but|who|that|at|as|to)\b/;
const FIND_VERBS = ["find", "search", "look for", "get me", "show me", "i need", "need", "want", "give me"];

/**
 * The category is what the user asked for BEFORE any place word:
 * "find dentists in dubai" -> "dentists". Taking the text after the verb and
 * cutting at the first preposition is the only reading that works when both a
 * category and a city are present.
 */
function findCategory(s: string): string | undefined {
  for (const v of FIND_VERBS) {
    const i = s.indexOf(v);
    if (i === -1) continue;
    const rest = s.slice(i + v.length).trim();
    if (!rest) continue;
    const stop = rest.search(STOP_AFTER_FIND);
    const cat = (stop === -1 ? rest : rest.slice(0, stop)).trim();
    if (cat && cat.length <= 60) return cat;
  }
  return undefined;
}

/**
 * Campaign name, preferring an explicit "called X" / "named X".
 *
 * Matching happens on the ORIGINAL message, not the normalised one, so the name
 * keeps the capitalisation the user typed. Ask for "Spring Sale" and the
 * campaign is called "Spring Sale", not "spring sale".
 */
function campaignNameFrom(orig: string, ...verbs: string[]): string | undefined {
  const clean = (v: string) =>
    v.replace(/\s+/g, " ").trim().replace(/[.,!?;]+$/, "").trim();

  const namedVerbs = ["called ", "named ", "titled "];
  for (const nv of namedVerbs) {
    const i = orig.toLowerCase().indexOf(nv);
    if (i !== -1) {
      const val = clean(orig.slice(i + nv.length));
      if (val) return val.slice(0, 80);
    }
  }
  for (const v of verbs) {
    const i = orig.toLowerCase().indexOf(v);
    if (i === -1) continue;
    const rest = orig.slice(i + v.length);
    const stop = rest.search(/\b(?:in|for|from|with|and|but|who|that|at|as|to)\b/i);
    const val = clean(stop === -1 ? rest : rest.slice(0, stop));
    if (val) return val.slice(0, 80);
  }
  return undefined;
}

/**
 * Match a message to a known intent. Returns null when nothing matches, which
 * is the signal to fall back to the AI exactly once and then cache the result.
 */
export function routeIntent(message: string): AgentRequest | null {
  const s = norm(message);
  if (!s) return null;

  // --- compliance / unsubscribes: ask before anything else, it is unambiguous
  if (has(s, "unsubscribe", "unsubscribed", "opt out", "opt-out", "compliance", "gdpr", "spam complaint")) {
    return { intent: "compliance_check", params: {}, summary: "Check who has unsubscribed and who is blocked" };
  }

  // --- sender reputation
  if (has(s, "sender health", "sender reputation", "reputation", "bounce rate", "bounces", "deliverability", "am i banned", "blacklist")) {
    return { intent: "sender_health", params: {}, summary: "Check sending reputation and bounce rate" };
  }

  // --- pause a campaign (write)
  if (has(s, "pause") && has(s, "campaign", "campaigns")) {
    const name = campaignNameFrom(message, "pause campaign ", "pause the campaign ", "pause ");
    return {
      intent: "pause_campaign",
      params: { campaignName: name },
      summary: name ? `Pause the campaign "${name}"` : "Pause a campaign",
    };
  }

  // --- stats
  if (has(s, "how many", "stats", "statistics", "performance", "numbers", "results", "how much did", "report")) {
    return { intent: "campaign_stats", params: {}, summary: "Show sending and reply numbers" };
  }

  // --- list campaigns
  if (has(s, "list", "show", "see", "view", "what") && has(s, "campaign", "campaigns")) {
    return { intent: "list_campaigns", params: {}, summary: "List your campaigns" };
  }

  // --- add existing contacts to a campaign (write)
  if (has(s, "add", "assign", "put", "move") && has(s, "campaign") && !has(s, "find", "search", "look for", "get me")) {
    const name = campaignNameFrom(message, "to campaign called ", "to the campaign called ", "to ");
    const who = afterPrep(s, "add ", "assign ", "move ");
    return {
      intent: "add_contacts_to_campaign",
      params: { campaignName: name, query: who?.slice(0, 60) },
      summary: name ? `Add "${who ?? "matching contacts"}" to the campaign "${name}"` : "Add contacts to a campaign",
    };
  }

  // --- create a campaign draft (write)
  if (has(s, "create", "make", "new", "start", "set up", "setup") && has(s, "campaign")) {
    const name = campaignNameFrom(message, "called ", "named ");
    return {
      intent: "create_campaign_draft",
      params: { campaignName: name },
      summary: name ? `Create a draft campaign called "${name}"` : "Create a new draft campaign",
    };
  }

  // --- find contacts. "leads", "customers", "businesses" and "people" are all
  // the same ask to a customer, so all of them route identically.
  if (has(s, "find", "search", "look for", "get me", "show me", "need", "want", "i need", "give me")) {
    const company = afterPrep(s, "for ", "from ");
    const city = findCity(s);
    return {
      intent: "find_contacts",
      params: {
        company: company?.slice(0, 60),
        city,
        country: findCountry(s),
        category: findCategory(s),
        limit: findCount(s),
      },
      summary: describeFind(company, city, findCountry(s)),
    };
  }

  return null;
}

function describeFind(company?: string, city?: string, country?: string): string {
  const bits: string[] = [];
  if (company) bits.push(`at ${company}`);
  if (city) bits.push(`in ${city}`);
  if (country && !city) bits.push(`in ${country}`);
  return `Find contacts${bits.length ? " " + bits.join(" ") : ""}`;
}

/** Human-readable intent list, used to constrain the AI fallback. */
export const INTENT_DESCRIPTIONS: Record<AgentIntent, string> = {
  list_campaigns: "List the user's existing campaigns with status and counts",
  campaign_stats: "Report how many emails were sent, opened, and replied to",
  find_contacts: "Search the user's saved contacts by company, city, country, or category",
  add_contacts_to_campaign: "Attach matching saved contacts to an existing campaign",
  create_campaign_draft: "Create a new campaign in DRAFT status, ready for the user to review and launch",
  pause_campaign: "Pause an active campaign so it stops sending",
  compliance_check: "Report who has unsubscribed and is blocked from future sends",
  sender_health: "Report sending reputation, bounce rate, and mailbox warm-up state",
};
