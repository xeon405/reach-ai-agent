// === Lead-finder AI intelligence ============================================
// Uses the shared Groq client to (1) plan better search queries/locations and
// (2) curate the discovered pool into the highest-value lead list. Every call
// is optional: any failure returns null and the caller falls back to the
// deterministic flow, so the lead finder can never be broken by AI being busy.

import { groqChat, extractJson, sanitizeForPrompt } from "./groq.ts";

export function isAiConfigured(): boolean {
  return !!(Deno.env.get("GROQ_API_KEYS") ?? Deno.env.get("GROQ_API_KEY"));
}

export interface QueryPlan {
  variants: string[];
  areas?: Array<{ query: string; region?: string }>;
  note?: string;
}

const PLAN_SYSTEM =
  "You plan localized B2B lead-discovery searches for the OutShipAI lead finder. You respond ONLY with valid JSON, no markdown, no commentary.";

/** Expand one niche into several search phrases and (when no area was given)
 *  suggest strong metros for that niche in the country. Returns a QueryPlan. */
export async function planSearchQueries(input: {
  jobTitle: string;
  country: string;
  location?: string;
  limit: number;
}): Promise<QueryPlan | null> {
  try {
    const raw = await groqChat(
      [
        { role: "system", content: PLAN_SYSTEM },
        {
          role: "user",
          content: `Give me search phrase variants and (if no area provided) strong areas for finding local businesses.
INPUT:
- niche/business type: "${sanitizeForPrompt(input.jobTitle, 60)}"
- country: "${sanitizeForPrompt(input.country, 60)}"
- area: ${input.location ? `"${sanitizeForPrompt(input.location, 60)}"` : "none given — suggest areas"}
- desired leads: ${Math.max(1, Number(input.limit) || 25)}

RULES:
- "variants": 2 to 4 short lowercase phrases that would surface slightly different but legitimate businesses on Google Maps for this exact niche (synonyms, service phrasings). Each must be meaningful on its own.
- If area is none: "areas": up to 3 metros within that country that are strongest for this niche (package as "City, Region", e.g. "Austin, TX"). Otherwise omit "areas".
- "note": one short sentence on strategy.

Respond ONLY valid JSON:
{"variants": [...], "areas": [{"query":"City, Region"}], "note": "..."}`,
        },
      ],
      { maxTokens: 700, temperature: 0.3 },
    );
    const parsed = extractJson<QueryPlan>(raw);
    if (!parsed || !Array.isArray(parsed.variants)) return null;
    const variants = parsed.variants
      .map((v) => String(v).trim().toLowerCase())
      .filter((v) => v.length > 1 && v.length <= 60);
    if (variants.length === 0) return null;
    const uniqueVariants = [...new Set(variants)].slice(0, 4);
    const areas = Array.isArray(parsed.areas)
      ? parsed.areas
          .map((a) => ({ query: String(a?.query ?? "").trim(), region: a?.region ? String(a.region) : undefined }))
          .filter((a) => a.query.length > 0)
          .slice(0, 3)
      : undefined;
    return { variants: uniqueVariants, areas: areas?.length ? areas : undefined, note: sanitizeForPrompt(parsed.note, 140) };
  } catch (err) {
    console.error("[lead-ai] planSearchQueries failed:", err);
    return null;
  }
}

export interface CuratedResult {
  order: number[];
  summary: string;
}

/** Ask the AI to pick the highest-value subset of discovered leads (by niche
 *  relevance, email quality, local-independence, geographic spread) and drop
 *  obvious repeats of the same brand. Returns indices in priority order. */
export async function curateLeads(input: {
  jobTitle: string;
  country: string;
  location?: string;
  leads: Array<Record<string, unknown>>;
  limit: number;
}): Promise<CuratedResult | null> {
  try {
    const pool = input.leads.slice(0, 60);
    if (pool.length === 0) return null;
    const lines = pool
      .map((l, i) => {
        const flags = [
          l.email ? `email:${String(l.email).slice(0, 40)}` : "email:none",
          `status:${l.email_status ?? "?"}`,
          l.website ? "site:yes" : "site:no",
        ];
        return `${i}. ${sanitizeForPrompt(String(l.company ?? l.name ?? ""), 50)} | ${sanitizeForPrompt(String(l.city ?? ""), 24)} | ${flags.join(", ")}`;
      })
      .join("\n");
    const raw = await groqChat(
      [
        { role: "system", content: PLAN_SYSTEM },
        {
          role: "user",
          content: `You curate discovered local businesses into the best outreach list. Pick the best up to ${Math.max(1, Number(input.limit) || 25)} leads.
NICHE: ${sanitizeForPrompt(input.jobTitle, 60)} | COUNTRY: ${sanitizeForPrompt(input.country, 60)} | AREA: ${(input.location ?? "nationwide")}

PRIORITIES (in order):
1. Best match to the niche.
2. Businesses WITH an email (favor status "verified" then "unknown/risky" over none).
3. Local independents over giant national chains.
4. Geographic diversity (different cities/neighborhoods).
5. Drop obvious repeats of the same brand (e.g. same chain at several addresses).

POOL (index: business | city | email:status, site):
${lines}

Respond ONLY as valid JSON:
{"order":[indices in priority order, up to ${Math.max(1, Number(input.limit) || 25)}], "summary":"one short human sentence for the UI, e.g. why this set was chosen and what was dropped"}`,
        },
      ],
      { maxTokens: 600, temperature: 0.2 },
    );
    const parsed = extractJson<CuratedResult>(raw);
    if (!parsed || !Array.isArray(parsed.order)) return null;
    const order = parsed.order
      .map((x) => Number(x))
      .filter((x) => Number.isInteger(x) && x >= 0 && x < pool.length)
      .filter((_, i, a) => a.indexOf(_) === i)
      .slice(0, Math.max(1, Number(input.limit) || 25));
    if (order.length === 0) return null;
    return { order, summary: sanitizeForPrompt(parsed.summary, 200) || "" };
  } catch (err) {
    console.error("[lead-ai] curateLeads failed:", err);
    return null;
  }
}