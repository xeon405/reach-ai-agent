/**
 * What the agent has learned about the user's business, kept between visits.
 *
 * This is the difference between an assistant and a chatbot that repeats
 * itself. Someone explains their product once, and every later reply can
 * actually use it instead of asking the same setup questions again.
 */

export type ProfileFacts = {
  business_name?: string;
  website?: string;
  product?: string;
  audience?: string;
  goals?: string;
  notes?: string;
};

export type Profile = ProfileFacts & { updated_at?: string };

const FIELDS: (keyof ProfileFacts)[] = ["business_name", "website", "product", "audience", "goals", "notes"];

/** Fields a setup conversation should try to fill, in the order that helps most. */
const GAPS: (keyof ProfileFacts)[] = ["product", "audience", "goals"];

const CAP: Record<keyof ProfileFacts, number> = {
  business_name: 120,
  website: 120,
  product: 400,
  audience: 400,
  goals: 400,
  notes: 600,
};

export function cleanFacts(raw: unknown): ProfileFacts {
  const out: ProfileFacts = {};
  if (!raw || typeof raw !== "object") return out;
  for (const k of FIELDS) {
    const v = (raw as Record<string, unknown>)[k];
    if (typeof v !== "string") continue;
    const t = v.trim().slice(0, CAP[k]);
    // An empty string, "n/a" or "unknown" is not knowledge. Storing those would
    // make the agent believe it had asked and been told nothing, and it would
    // stop asking.
    if (!t || /^(n\/?a|none|unknown|tbd|\?+|not sure)$/i.test(t)) continue;
    out[k] = t;
  }
  return out;
}

/** True when this turn actually taught us something new. */
export function hasFacts(f: ProfileFacts): boolean {
  return FIELDS.some((k) => typeof f[k] === "string" && f[k]!.length > 0);
}

export function isEmpty(p: Profile | null | undefined): boolean {
  return !hasFacts(p ?? {});
}

/**
 * The first setup question worth asking, or null once we know enough.
 *
 * Used to open a helpful conversation on a brand-new account instead of
 * waiting to be prodded, and to notice when someone has told us nothing yet.
 */
export function nextGap(p: Profile | null | undefined): keyof ProfileFacts | null {
  if (!p) return GAPS[0];
  return GAPS.find((k) => !p[k]) ?? null;
}

export async function loadProfile(db: any, userId: string): Promise<Profile | null> {
  const { data, error } = await db
    .from("agent_profile")
    .select("business_name, website, product, audience, goals, notes, updated_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return null;
  return data as Profile;
}

/**
 * Merge new facts over what we already know and persist.
 *
 * Merge, not replace: someone correcting one detail ("actually it's B2B")
 * must not erase everything else they told us. Empty values are ignored so a
 * blank field can never wipe a good one.
 */
export async function saveProfileFacts(
  db: any,
  userId: string,
  facts: ProfileFacts,
): Promise<Profile | null> {
  const clean = cleanFacts(facts);
  if (!hasFacts(clean)) return null;

  const current = (await loadProfile(db, userId)) ?? {};
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const k of FIELDS) if (clean[k]) patch[k] = clean[k];

  const { data, error } = await db
    .from("agent_profile")
    .upsert({ user_id: userId, ...current, ...patch }, { onConflict: "user_id" })
    .select("business_name, website, product, audience, goals, notes, updated_at")
    .single();
  if (error || !data) return null;
  return data as Profile;
}

export async function clearProfile(db: any, userId: string): Promise<boolean> {
  const { error } = await db.from("agent_profile").delete().eq("user_id", userId);
  return !error;
}

/**
 * Render the profile for the prompt.
 *
 * Written as plain assertions under a heading, and flagged as the operator's
 * own words, because the difference between "here is what I know about you" and
 * "here is what you told me" is what stops the model treating it as something
 * it invented.
 */
export function renderProfile(p: Profile | null | undefined): string {
  if (!p) return "";
  const lines: string[] = [];
  const push = (label: string, v: string | undefined) => {
    if (v) lines.push(`- ${label}: ${v}`);
  };
  push("Business name", p.business_name);
  push("Website", p.website);
  push("What they sell", p.product);
  push("Who they sell to", p.audience);
  push("What they are trying to achieve", p.goals);
  push("Other notes", p.notes);
  if (!lines.length) return "";
  return "## What this person has told me about their business\n"
    + "Their own words from earlier in the conversation. Trust it and use it. "
    + "Never contradict it, and never ask again for something already on this list.\n"
    + lines.join("\n");
}