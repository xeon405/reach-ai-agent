/**
 * Deterministic slot extraction, used when the model forgets a slot it should
 * have picked up.
 *
 * The model reliably identifies the GOAL but drops slots often enough to matter:
 * "add my London dentists to a campaign" came back with params:{} and the
 * person then had to repeat themselves. Guessing is not acceptable, but
 * copying a capitalised word the person actually typed is not guessing.
 *
 * Only ever ADDS a slot the model left empty. It never overwrites a value the
 * model chose, so it can never contradict an explicit instruction.
 */

import type { AgentParams } from "./agent-router.ts";

// Words that are capitalised for grammar, not because they name a place.
const NOT_A_SLOT = new Set([
  "I", "Im", "Id", "My", "Please", "Can", "Could", "Would", "Should", "Will",
  "What", "Which", "Who", "How", "When", "Where", "Why", "Do", "Does", "Did",
  "Is", "Are", "Am", "The", "A", "An", "And", "But", "So", "If", "Then",
  "Thanks", "Thank", "Hi", "Hello", "Hey", "Yes", "No", "Ok", "Okay",
  "Get", "Give", "Show", "List", "Find", "Pause", "Stop", "Create", "Add",
  "Send", "Make", "Run", "Set", "Start", "Use", "Help", "Please",
]);

/** Capitals mid-sentence are the strongest signal of a proper noun. */
export function extractProperNouns(message: string): string[] {
  const tokens = message.split(/[\s,.;!?:"'()\[\]]+/).filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const raw = tokens[i];
    const t = raw.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, "");
    if (t.length < 3) continue;
    if (i === 0) continue;               // sentence-initial capital is grammar
    if (!/^[A-Z][a-z]/.test(t)) continue; // Title Case only
    if (NOT_A_SLOT.has(t)) continue;
    if (out.some((o) => o.toLowerCase() === t.toLowerCase())) continue;
    out.push(t);
  }
  return out;
}

/** Country names worth treating as a country slot rather than a city. */
const COUNTRIES = new Set([
  "uk", "united kingdom", "england", "scotland", "wales", "ireland",
  "usa", "us", "united states", "america", "canada", "australia", "new zealand",
  "germany", "france", "spain", "italy", "netherlands", "belgium", "ireland",
  "uae", "dubai", "abu dhabi", "saudi arabia", "qatar", "kuwait", "bahrain",
  "oman", "india", "pakistan", "bangladesh", "philippines", "singapore",
  "malaysia", "indonesia", "thailand", "vietnam", "japan", "china", "australia",
  "brazil", "mexico", "argentina", "colombia", "south africa", "nigeria",
  "kenya", "egypt", "morocco", "turkey", "poland", "sweden", "norway",
  "denmark", "finland", "portugal", "greece", "austria", "switzerland",
]);

/**
 * Fill in city/country/category from proper nouns, when the model left them
 * blank. Conservative: at most one city and one country, and only when the
 * model supplied neither.
 */
export function backfillSlots(message: string, params: AgentParams): AgentParams {
  // Per-slot, NOT all-or-nothing. Bailing out because the model already set
  // category:"dentists" threw away the city in the very case this exists for
  // ("add my London dentists to a campaign") - the model reliably captures the
  // trade and misses the place, so those two arrive independently.
  if (params.city && params.country) return params;

  const nouns = extractProperNouns(message);
  if (!nouns.length) return params;

  const rest = nouns.filter((n) => !COUNTRIES.has(n.toLowerCase()));

  if (!params.country) {
    const country = nouns.find((n) => COUNTRIES.has(n.toLowerCase()));
    if (country) return { ...params, country };
  }

  // Only guess a city when the model gave none AND exactly one non-country
  // proper noun is left. Two or more could be a city plus a company name,
  // and guessing wrong is worse than asking.
  if (!params.city && rest.length === 1) {
    return { ...params, city: rest[0] };
  }
  return params;
}
