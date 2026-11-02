/**
 * Mirrors public.is_plausible_business_address(text) in Postgres
 * (supabase/migrations/20261101000005_require_street_address.sql).
 *
 * The database is the real gate — this copy exists so the form can explain the
 * problem before saving, instead of accepting "India" and then silently blocking
 * every send. Keep the two in step; a mismatch shows up as a user who can save
 * but cannot send.
 */

/** Street-type words, in English and the other languages the product supports. */
const STREET_WORD =
  /\b(street|st|road|rd|avenue|ave|lane|ln|drive|dr|boulevard|blvd|way|close|court|ct|place|pl|terrace|square|sq|highway|hwy|parkway|pkwy|route|rte|unit|suite|floor|building|bldg|block|sector|industrial|estate|park|plaza|centre|center|nagar|colony|marg|chowk|bazaar|via|calle|rue|strasse|straße|weg|platz|gasse|ring|allee|ulica|callejón|bulevar)\b/i;

export const ADDRESS_EXAMPLE = "12 Market Street, Leeds, LS1 1AA";

/**
 * Returns null when the value looks like a street-level address, or a short
 * plain-English sentence explaining what is missing.
 */
export function addressProblem(raw: string | null | undefined): string | null {
  const a = (raw ?? "").trim().replace(/\s+/g, " ");

  if (!a) return "Enter your business address — a street and a city.";
  if (!/\p{L}/u.test(a)) return "That's only numbers. Include the street name too.";

  // Same acceptance test as the database: long enough, and showing either a
  // building number or a street-type word.
  if (a.length >= 12 && (/\d/.test(a) || STREET_WORD.test(a))) return null;

  return `A country or city on its own isn't enough. Add the street and building number, e.g. ${ADDRESS_EXAMPLE}.`;
}

export function isPlausibleAddress(raw: string | null | undefined): boolean {
  return addressProblem(raw) === null;
}
