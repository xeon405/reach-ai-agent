// Area intelligence for the lead finder.
// Curated major-metro lists per country + sampled country-level searches so
// results vary per demand, plus quick Google probe scoring for "best areas".

export interface AreaRecommendation {
  city: string;
  region: string;
  businesses: number;
  with_websites: number;
  activity: number;
  score: number;
}

export interface Metro {
  city: string;
  region: string;
  query: string;
}

const US_METROS: Metro[] = [
  { city: "New York", region: "NY", query: "New York City, NY" },
  { city: "Los Angeles", region: "CA", query: "Los Angeles, CA" },
  { city: "Chicago", region: "IL", query: "Chicago, IL" },
  { city: "Houston", region: "TX", query: "Houston, TX" },
  { city: "Phoenix", region: "AZ", query: "Phoenix, AZ" },
  { city: "Philadelphia", region: "PA", query: "Philadelphia, PA" },
  { city: "San Antonio", region: "TX", query: "San Antonio, TX" },
  { city: "San Diego", region: "CA", query: "San Diego, CA" },
  { city: "Dallas", region: "TX", query: "Dallas, TX" },
  { city: "San Jose", region: "CA", query: "San Jose, CA" },
  { city: "Austin", region: "TX", query: "Austin, TX" },
  { city: "Jacksonville", region: "FL", query: "Jacksonville, FL" },
  { city: "Fort Worth", region: "TX", query: "Fort Worth, TX" },
  { city: "Columbus", region: "OH", query: "Columbus, OH" },
  { city: "Charlotte", region: "NC", query: "Charlotte, NC" },
  { city: "Indianapolis", region: "IN", query: "Indianapolis, IN" },
  { city: "San Francisco", region: "CA", query: "San Francisco, CA" },
  { city: "Seattle", region: "WA", query: "Seattle, WA" },
  { city: "Denver", region: "CO", query: "Denver, CO" },
  { city: "Washington", region: "DC", query: "Washington, DC" },
  { city: "Nashville", region: "TN", query: "Nashville, TN" },
  { city: "Miami", region: "FL", query: "Miami, FL" },
  { city: "Atlanta", region: "GA", query: "Atlanta, GA" },
  { city: "Boston", region: "MA", query: "Boston, MA" },
  { city: "Las Vegas", region: "NV", query: "Las Vegas, NV" },
  { city: "Detroit", region: "MI", query: "Detroit, MI" },
  { city: "Portland", region: "OR", query: "Portland, OR" },
  { city: "Oklahoma City", region: "OK", query: "Oklahoma City, OK" },
];

const WORLD_METROS: Record<string, Metro[]> = {
  "united states": US_METROS,
  "united kingdom": [
    { city: "London", region: "GB", query: "London, UK" },
    { city: "Manchester", region: "GB", query: "Manchester, UK" },
    { city: "Birmingham", region: "GB", query: "Birmingham, UK" },
    { city: "Leeds", region: "GB", query: "Leeds, UK" },
    { city: "Glasgow", region: "GB", query: "Glasgow, UK" },
    { city: "Edinburgh", region: "GB", query: "Edinburgh, UK" },
  ],
  canada: [
    { city: "Toronto", region: "ON", query: "Toronto, ON" },
    { city: "Vancouver", region: "BC", query: "Vancouver, BC" },
    { city: "Montreal", region: "QC", query: "Montreal, QC" },
    { city: "Calgary", region: "AB", query: "Calgary, AB" },
    { city: "Ottawa", region: "ON", query: "Ottawa, ON" },
  ],
  australia: [
    { city: "Sydney", region: "NSW", query: "Sydney, NSW" },
    { city: "Melbourne", region: "VIC", query: "Melbourne, VIC" },
    { city: "Brisbane", region: "QLD", query: "Brisbane, QLD" },
    { city: "Perth", region: "WA", query: "Perth, WA" },
    { city: "Adelaide", region: "SA", query: "Adelaide, SA" },
  ],
  india: [
    { city: "Mumbai", region: "MH", query: "Mumbai, India" },
    { city: "Delhi", region: "DL", query: "Delhi, India" },
    { city: "Bengaluru", region: "KA", query: "Bengaluru, India" },
    { city: "Hyderabad", region: "TS", query: "Hyderabad, India" },
    { city: "Chennai", region: "TN", query: "Chennai, India" },
  ],
  germany: [
    { city: "Berlin", region: "DE", query: "Berlin, Germany" },
    { city: "Munich", region: "DE", query: "Munich, Germany" },
    { city: "Hamburg", region: "DE", query: "Hamburg, Germany" },
    { city: "Frankfurt", region: "DE", query: "Frankfurt, Germany" },
  ],
};

const GLOBAL_DEFAULT: Metro[] = [
  { city: "New York", region: "US", query: "New York, NY" },
  { city: "London", region: "GB", query: "London, UK" },
  { city: "Los Angeles", region: "US", query: "Los Angeles, CA" },
  { city: "Toronto", region: "CA", query: "Toronto, ON" },
  { city: "Sydney", region: "AU", query: "Sydney, NSW" },
  { city: "Berlin", region: "DE", query: "Berlin, Germany" },
  { city: "Chicago", region: "US", query: "Chicago, IL" },
  { city: "Mumbai", region: "IN", query: "Mumbai, India" },
  { city: "Paris", region: "FR", query: "Paris, France" },
  { city: "Dubai", region: "AE", query: "Dubai, UAE" },
];

export function metrosFor(country: string): Metro[] {
  const key = String(country ?? "").toLowerCase().trim();
  return WORLD_METROS[key] ?? GLOBAL_DEFAULT;
}

export function sampleMetros(country: string, n: number): Metro[] {
  const pool = metrosFor(country);
  const copy = [...pool];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}

export function rankAreas(
  raw: Array<{ metro: Metro; businesses: number; with_websites: number; ratingSum: number }>,
): AreaRecommendation[] {
  return raw
    .filter((r) => r.businesses > 0)
    .map((r) => ({
      city: r.metro.city,
      region: r.metro.region,
      businesses: r.businesses,
      with_websites: r.with_websites,
      activity: r.ratingSum,
      // Score balances web presence, absolute saturation and review activity.
      score: r.with_websites * 3 + r.businesses + Math.round(r.ratingSum / 400),
    }))
    .sort((a, b) => b.score - a.score);
}