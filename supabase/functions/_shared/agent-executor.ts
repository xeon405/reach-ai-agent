// ============================================================================
// AGENT EXECUTOR — turns a routed intent into a database read or write.
//
// Two rules hold everywhere in this file:
//
//  1. Every query is scoped by user_id. The caller passes a service-role
//     client, so RLS is not protecting us here -- the explicit filter is.
//  2. Nothing here sends an email, and nothing deletes a row. The agent can
//     prepare work and the user launches it from the existing screens, so the
//     agent never duplicates or bypasses the reviewed send path.
// ============================================================================

import type { AgentIntent, AgentParams, AgentRequest } from "./agent-router.ts";

type Db = { from: (t: string) => any };

/**
 * Resolve a campaign name to exactly one row, or explain why we cannot.
 *
 * This exists because the two obvious implementations are quietly wrong:
 *   maybeSingle()  ERRORS outright when two campaigns share a name.
 *   limit(1)       silently takes the first - so "pause Q3" could halt the
 *                  WRONG campaign. On a write, guessing is worse than asking.
 * So: an exact name wins outright, one partial match wins, and several
 * partial matches are handed back as a choice for the person to settle.
 */
async function resolveCampaign(
  db: Db,
  userId: string,
  name: string,
  intent: AgentIntent,
  params: AgentParams,
  opts: { activeOnly?: boolean; excludeName?: boolean } = {},
): Promise<{ ok: true; row: any } | { ok: false; outcome: AgentOutcome }> {
  let q = db.from("campaigns").select("id, name, status").eq("user_id", userId);
  if (opts.activeOnly) q = q.eq("status", "active");
  q = q.ilike("name", opts.excludeName ? name : `%${name}%`).limit(5);

  const { data, error } = await q;
  if (error) return { ok: false, outcome: { text: "I could not look up your campaigns just now." } };

  const rows: any[] = data ?? [];
  if (rows.length === 0) {
    return {
      ok: false,
      outcome: {
        text: opts.excludeName
          ? `You do not have a campaign called "${name}".`
          : `I could not find a campaign called "${name}".`,
        empty: true,
      },
    };
  }

  // An exact name is unambiguous even when other campaigns merely CONTAIN the
  // phrase, so prefer it over partial hits.
  const exact = rows.find((r) => String(r.name ?? "").trim().toLowerCase() === name.trim().toLowerCase());
  if (exact) return { ok: true, row: exact };
  if (rows.length === 1) return { ok: true, row: rows[0] };

  return {
    ok: false,
    outcome: {
      text:
        `More than one campaign matches "${name}", so I did not want to guess. `
        + `Which one did you mean: ${rows.slice(0, 5).map((r) => r.name).join(", ")}?`,
      choose: { intent, candidates: rows.slice(0, 5).map((r) => r.name), params: { ...params, campaignName: undefined } },
    },
  };
}

export interface AgentOption {
  /** Short, plain label shown on the button. */
  label: string;
  /** Sent verbatim as the next message when tapped. */
  message?: string;
  /** In-app page to open instead of sending anything. */
  href?: string;
}

export interface AgentOutcome {
  /** Plain-language result shown in the chat bubble. */
  text: string;
  /** Optional rows for the UI to render as a table. */
  rows?: { label: string; value: string }[];
  /** Set when nothing was found, so the UI can suggest what to do instead. */
  empty?: boolean;
  /**
   * Next steps the person can tap rather than work out and type. Used for the
   * two moments where a chat naturally stalls: an ambiguous name (pick one of
   * these) and an empty result (here is where to go instead).
   */
  options?: AgentOption[];
  /**
   * A SLOT is missing, not the whole goal. The caller remembers it and folds
   * the person's next answer into the same request.
   */
  need?: { intent: AgentIntent; params: AgentParams };
  /**
   * Ambiguity that no amount of remembering can fix - two campaigns genuinely
   * share a name, so only the person can choose. We list the options instead
   * of guessing, which matters most on writes.
   */
  choose?: { intent: AgentIntent; candidates: string[]; params: AgentParams };
}

const MAX_ROWS = 200;

/** How long a clarification stays live before it is treated as abandoned. */
export const PENDING_TTL_MINUTES = 15;

export async function executeIntent(
  db: Db,
  userId: string,
  req: AgentRequest,
): Promise<AgentOutcome> {
  switch (req.intent) {
    case "list_campaigns":
      return listCampaigns(db, userId);
    case "campaign_stats":
      return campaignStats(db, userId);
    case "suggest_targeting":
      return suggestTargeting(db, userId, req);
    case "find_contacts":
      return findContacts(db, userId, req);
    case "compliance_check":
      return complianceCheck(db, userId);
    case "sender_health":
      return senderHealth(db, userId);
    case "create_campaign_draft":
      return createCampaignDraft(db, userId, req);
    case "pause_campaign":
      return pauseCampaign(db, userId, req);
    case "add_contacts_to_campaign":
      return addContactsToCampaign(db, userId, req);
    default:
      return { text: "I don't know how to do that yet." };
  }
}

async function listCampaigns(db: Db, userId: string): Promise<AgentOutcome> {
  const { data, error } = await db
    .from("campaigns")
    .select("id, name, status, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return { text: "I could not load your campaigns just now." };
  if (!data || data.length === 0) {
    return { text: "You have not created any campaigns yet.", empty: true };
  }
  const rows = data.map((c: any) => ({
    label: c.name,
    value: c.status === "active" ? "Sending" : "Paused",
  }));
  return {
    text: `You have ${data.length} campaign${data.length === 1 ? "" : "s"}.`,
    rows,
  };
}

async function campaignStats(db: Db, userId: string): Promise<AgentOutcome> {
  // Each count is scoped by user_id; none of these may fall back to global.
  //
  // "Replies received" counts emails_sent.replied, NOT ai_classifications. The
  // classifications table only holds rows for sends the AI actually triaged,
  // so counting it reported a fraction of real replies and looked like data
  // loss. "Interested" comes from reply_sentiment, the same INTERESTED value
  // daily-digest treats as hot.
  const [sent, replies, interested, contacts, active] = await Promise.all([
    db.from("emails_sent").select("id", { count: "exact", head: true }).eq("user_id", userId),
    db.from("emails_sent").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("replied", true),
    db.from("emails_sent").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("reply_sentiment", "INTERESTED"),
    db.from("leads").select("id", { count: "exact", head: true }).eq("user_id", userId),
    db.from("campaigns").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "active"),
  ]);

  const n = (r: any) => Number(r.count ?? 0);
  const sentN = n(sent), repliedN = n(replies), interestedN = n(interested);

  // The numbers belong in the sentence too. Rows are a summary panel, but the
  // chat itself is what people read, and "Here is where you are:" on its own
  // says nothing at all.
  const rate = sentN > 0 ? ` (${Math.round((repliedN / sentN) * 100)}%)` : "";
  const text = sentN === 0
    ? "Nothing has been sent yet, so there are no numbers to report. Want me to find contacts or draft a campaign first?"
    : `You have sent ${sentN} email${sentN === 1 ? "" : "s"}, got ${repliedN} repl${repliedN === 1 ? "y" : "ies"}${rate}`
      + `, and ${interestedN} of those replied interested.`
      + ` ${n(contacts)} contact${n(contacts) === 1 ? "" : "s"} saved, ${n(active)} campaign${n(active) === 1 ? "" : "s"} sending.`;

  return {
    text,
    rows: [
      { label: "Emails sent", value: String(sentN) },
      { label: "Replies received", value: String(repliedN) },
      { label: "Interested", value: String(interestedN) },
      { label: "Contacts saved", value: String(n(contacts)) },
      { label: "Campaigns sending", value: String(n(active)) },
    ],
  };
}

async function findContacts(db: Db, userId: string, req: AgentRequest): Promise<AgentOutcome> {
  const p = req.params;
  let q = db.from("leads").select("name, company, city, category, email_status").eq("user_id", userId);

  if (p.city) q = q.ilike("city", `%${p.city}%`);
  if (p.company) q = q.ilike("company", `%${p.company}%`);
  if (p.category) q = q.ilike("category", `%${p.category}%`);
  if (p.query) {
    q = q.or(`name.ilike.%${p.query}%,company.ilike.%${p.query}%,category.ilike.%${p.query}%`);
  }

  const { data, error } = await q.limit(Math.min(p.limit ?? 25, MAX_ROWS));
  if (error) return { text: "I could not search your contacts just now." };
  if (!data || data.length === 0) {
    // An empty list is a dead end unless it says where contacts come from.
    // These are only ever READ from, so the honest next step is the page that
    // adds them - not another search that would return nothing again.
    const filter = p.category ?? p.city ?? p.query;
    return {
      text: filter
        ? `You have no saved contacts matching "${filter}" yet. New contacts come from Lead Finder - search there and they will show up here.`
        : "You do not have any saved contacts yet. New contacts come from Lead Finder - search there and they will show up here.",
      empty: true,
      options: [{ label: "Open Lead Finder", href: "/lead-finder" }],
    };
  }
  const rows = data.slice(0, 25).map((l: any) => ({
    label: l.company || l.name || "Unnamed",
    value: [l.name, l.city, l.category].filter(Boolean).join(" · ") || "—",
  }));
  return {
    text: `I found ${data.length} saved contact${data.length === 1 ? "" : "s"}:`,
    rows,
  };
}

async function complianceCheck(db: Db, userId: string): Promise<AgentOutcome> {
  const { data, error } = await db
    .from("leads")
    .select("id, unsubscribed, status, lifecycle, company, name")
    .eq("user_id", userId)
    .or("unsubscribed.eq.true,status.eq.unsubscribed,lifecycle.eq.UNSUBSCRIBED,status.eq.suppressed,lifecycle.eq.SUPPRESSED,status.eq.bounced,lifecycle.eq.BOUNCED")
    .limit(100);
  if (error) return { text: "I could not check your unsubscribes just now." };
  if (!data || data.length === 0) {
    return { text: "Nobody has unsubscribed or bounced. You are clear.", empty: true };
  }
  return {
    text: `${data.length} contact${data.length === 1 ? " is" : "s are"} blocked and will never be emailed again:`,
    rows: data.slice(0, 25).map((l: any) => ({ label: l.company || l.name || "Unnamed", value: l.status || l.lifecycle || "blocked" })),
  };
}

async function senderHealth(db: Db, userId: string): Promise<AgentOutcome> {
  const [bounced, sent] = await Promise.all([
    db.from("leads").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "bounced"),
    db.from("emails_sent").select("id", { count: "exact", head: true }).eq("user_id", userId),
  ]);
  const total = sent.count ?? 0;
  const bad = bounced.count ?? 0;
  const rate = total > 0 ? ((bad / total) * 100).toFixed(1) : "0.0";
  const verdict =
    total === 0 ? "You have not sent anything yet, so there is nothing to judge."
      : bad / total < 0.02 ? "This looks healthy. Keep the daily volume steady."
      : bad / total < 0.05 ? "A little high. Sending a bit more slowly would help."
      : "This is high. Pause and fix your list before sending more.";
  return {
    text: "Here is your sending health:",
    rows: [
      { label: "Emails sent", value: String(total) },
      { label: "Bounced", value: String(bad) },
      { label: "Bounce rate", value: `${rate}%` },
    ],
  };
}

// ---- writes. Only ever reached after a server-side confirmation. ----------

async function createCampaignDraft(db: Db, userId: string, req: AgentRequest): Promise<AgentOutcome> {
  const name = req.params.campaignName?.trim();
  if (!name) {
    // The goal is known even though the name is not, so this is a SLOT the
    // next message can fill, not a dead end.
    return {
      text: "What should the campaign be called?",
      need: { intent: "create_campaign_draft", params: { ...req.params, campaignName: undefined } },
    };
  }
  // existsAs is an exact-name check (not a substring search) so "Spring Sale"
  // does not collide with "Spring Sale v2". maybeSingle is safe here: the
  // equality filter can return at most one row.
  const { data: existing } = await db
    .from("campaigns")
    .select("id")
    .eq("user_id", userId)
    .ilike("name", name)
    .limit(1);
  if (existing && existing.length > 0) {
    return { text: `You already have a campaign called "${name}".`, empty: true };
  }
  const { data, error } = await db
    .from("campaigns")
    .insert({ user_id: userId, name, status: "paused" })
    .select("id, name, status")
    .single();
  if (error || !data) return { text: "I could not create that campaign." };
  return {
    text: `Created "${data.name}". It is paused, so nothing is sending yet. Open it to add contacts, then start it when you are ready.`,
    rows: [{ label: data.name, value: "Paused" }],
  };
}

/**
 * Work out WHICH campaign a pause request means, without changing anything.
 *
 * Split out from pauseCampaign so the same logic can run as a preflight,
 * before the confirmation prompt. Both callers share it, so "can we even name
 * a target?" and "execute it" can never disagree about what the user meant.
 */
async function resolvePauseTarget(
  db: Db,
  userId: string,
  req: AgentRequest,
): Promise<{ ok: true; row: any } | { ok: false; outcome: AgentOutcome }> {
  const name = req.params.campaignName?.trim();
  if (!name) {
    // "stop that campaign" with nothing to go on: ask, and remember we were
    // heading for this goal so the answer completes it.
    const { data: active } = await db
      .from("campaigns")
      .select("id, name")
      .eq("user_id", userId)
      .eq("status", "active")
      .limit(10);
    const names = (active ?? []).map((c: any) => c.name).filter(Boolean);
    if (names.length === 1) {
      // Exactly one is sending, so "that one" is not ambiguous.
      return { ok: true, row: (active as any[])[0] };
    }
    if (names.length > 1) {
      return {
        ok: false,
        outcome: {
          text: `You have ${names.length} campaigns sending: ${names.join(", ")}, so I did not want to guess which one to stop. Which should I pause?`,
          choose: { intent: "pause_campaign", candidates: names, params: { ...req.params, campaignName: undefined } },
        },
      };
    }
    return { ok: false, outcome: { text: "You have no campaigns currently sending.", empty: true } };
  }

  // activeOnly matters: pausing must never target something already paused.
  return resolveCampaign(db, userId, name, "pause_campaign", req.params, { activeOnly: true });
}

async function pauseCampaign(db: Db, userId: string, req: AgentRequest): Promise<AgentOutcome> {
  const target = await resolvePauseTarget(db, userId, req);
  if (!target.ok) return target.outcome;
  return pauseRow(db, userId, target.row);
}

async function pauseRow(db: Db, userId: string, target: any): Promise<AgentOutcome> {
  const { error: upErr } = await db
    .from("campaigns")
    .update({ status: "paused" })
    .eq("id", target.id)
    .eq("user_id", userId);
  if (upErr) return { text: "I could not pause that campaign." };
  return { text: `Paused "${target.name}". It will stop sending.` };
}

/** Work out WHICH campaign the contacts belong to, without changing anything. */
async function resolveAddTarget(
  db: Db,
  userId: string,
  req: AgentRequest,
): Promise<{ ok: true; row: any } | { ok: false; outcome: AgentOutcome }> {
  const campName = req.params.campaignName?.trim();
  if (!campName) {
    // Missing only the campaign: remember the contacts filter (city/company/
    // query) that came with the original request so the answer can complete it.
    return {
      ok: false,
      outcome: {
        text: "Which campaign should I add them to?",
        need: { intent: "add_contacts_to_campaign", params: { ...req.params, campaignName: undefined } },
      },
    };
  }
  const resolved = await resolveCampaign(db, userId, campName, "add_contacts_to_campaign", req.params);
  if (resolved.ok) return resolved;

  // Name the contacts back so the reply is about THEIR request, not just a
  // missing campaign. "I could not find a campaign called Spring Sale" on its
  // own reads like the agent forgot they were talking about London dentists.
  if (resolved.outcome.empty) {
    return {
      ok: false,
      outcome: {
        ...resolved.outcome,
        text: `${resolved.outcome.text} I did not add ${describeContacts(req.params)}.`,
      },
    };
  }
  return resolved;
}

/** Render a contact filter back to the person who typed it. */
/**
 * Drop audience slots that were clearly lifted out of the campaign name.
 *
 * "Spring Sale" was answering "which campaign?", but the model also copied
 * "Sale" into an audience slot - so the agent reported "contacts in Sale" (or
 * "the Sale dentists") instead of the London dentists actually asked for. The
 * model is non-deterministic about WHICH slot it leaks into, so every
 * audience-identifying slot is checked, not just category.
 *
 * A slot whose words all come from the campaign name is describing the
 * campaign, not the audience.
 */
function withoutCampaignNameLeak(p: AgentParams): AgentParams {
  const camp = (p.campaignName ?? "").toLowerCase().trim();
  if (!camp) return p;
  const campWords = new Set(camp.split(/[^a-z0-9]+/).filter(Boolean));
  if (campWords.size === 0) return p;

  const leaked = (value: unknown): boolean => {
    if (typeof value !== "string") return false;
    const words = value.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    return words.length > 0 && words.every((w) => campWords.has(w));
  };

  const out: AgentParams = { ...p };
  for (const slot of ["city", "category", "query"] as const) {
    if (leaked(out[slot])) delete out[slot];
  }
  return out;
}

function describeContacts(raw: AgentParams): string {
  const p = withoutCampaignNameLeak(raw);
  if (p.city && p.category) return `the ${p.city} ${p.category}`;
  if (p.city) return `contacts in ${p.city}`;
  if (p.category) return `${p.category} contacts`;
  if (p.company) return `contacts at ${p.company}`;
  if (p.query) return `contacts matching "${p.query}"`;
  return "any contacts";
}

async function addContactsToCampaign(db: Db, userId: string, req: AgentRequest): Promise<AgentOutcome> {
  const target = await resolveAddTarget(db, userId, req);
  if (!target.ok) return target.outcome;
  const camp = target.row;

  const p = withoutCampaignNameLeak(req.params);
  let q = db.from("leads").select("id").eq("user_id", userId).is("campaign_id", null);
  if (p.query) q = q.or(`company.ilike.%${p.query}%,category.ilike.%${p.query}%,city.ilike.%${p.query}%`);
  const { data: contacts, error } = await q.limit(200);
  if (error) return { text: "I could not look up your contacts." };
  if (!contacts || contacts.length === 0) {
    return { text: "I could not find any unassigned contacts to add.", empty: true };
  }
  const ids = contacts.map((c: any) => c.id);
  const { error: upErr } = await db
    .from("leads")
    .update({ campaign_id: camp.id })
    .in("id", ids)
    .eq("user_id", userId);
  if (upErr) return { text: "I could not add those contacts." };
  return { text: `Added ${ids.length} contact${ids.length === 1 ? "" : "s"} to "${camp.name}". Nothing is sending until you start it.` };
}

/**
 * Read-only safety check for a write that has NOT been confirmed yet.
 *
 * Returns null when the request names exactly one real target, so the caller
 * can go ahead and ask for confirmation.
 *
 * Returns an outcome when asking for confirmation would be wrong or useless:
 *   - need   -> a required slot is missing, so ask a question instead
 *   - choose -> the name matched more than one campaign, so only the person can
 *               pick; listing the options is the honest move
 *   - empty  -> there is nothing to act on at all
 *
 * This matters because confirmation happens BEFORE execution. Without this,
 * "pause Q3" would first ask "Can I pause Q3?" and only afterwards discover
 * that two campaigns match - making the user confirm a write that then refuses
 * to run. Resolve first, confirm second.
 */
export async function preflightWrite(
  db: Db,
  userId: string,
  req: AgentRequest,
): Promise<AgentOutcome | null> {
  if (req.intent === "pause_campaign") {
    const target = await resolvePauseTarget(db, userId, req);
    return target.ok ? null : target.outcome;
  }
  if (req.intent === "add_contacts_to_campaign") {
    const target = await resolveAddTarget(db, userId, req);
    return target.ok ? null : target.outcome;
  }
  return null;
}

/**
 * Fill in campaignName from the user's REAL campaigns when the model left it
 * out. Runs before preflight, so it can only ever name a campaign that exists.
 *
 * The model is good at "pause my campaign" but inconsistent at "pause Q3 push"
 * - it sometimes hands back no name at all, which used to look like "no name
 * given" and produced "which of your 3 campaigns should I pause?". Matching
 * against actual rows is deterministic and cannot invent a target.
 *
 * Longest name first, so "Q3 push" wins over a shorter campaign that happens
 * to be a substring. Requires the name to appear as whole words.
 */
export async function hydrateCampaignName(
  db: Db,
  userId: string,
  intent: AgentIntent,
  params: AgentParams,
  message: string,
): Promise<AgentParams> {
  if (params.campaignName?.trim()) return params;
  if (intent !== "pause_campaign" && intent !== "add_contacts_to_campaign") return params;

  const { data } = await db
    .from("campaigns")
    .select("name")
    .eq("user_id", userId)
    .limit(200);
  const names = (data ?? []).map((c: any) => c.name).filter(Boolean) as string[];
  if (!names.length) return params;

  const hay = message.toLowerCase();
  const matches: string[] = [];
  for (const n of names) {
    const needle = n.toLowerCase().trim();
    if (!needle) continue;
    const at = hay.indexOf(needle);
    if (at < 0) continue;
    const before = hay[at - 1];
    const after = hay[at + needle.length];
    const boundary = (c: string | undefined) => c === undefined || /[^a-z0-9]/.test(c);
    if (boundary(before) && boundary(after)) matches.push(n);
  }
  // Longest first to be deterministic
  matches.sort((a, b) => b.length - a.length);
  // Only hydrate if there's exactly one unambiguous match. If multiple match
  // (e.g. "Q3" matches "Q3 push" and "Q3 launch"), we MUST leave it ambiguous
  // so the resolver can ask the person which one they meant.
  if (matches.length === 1) return { ...params, campaignName: matches[0] };
  return params;
}

/**
 * Recommend a target segment from the user's OWN data.
 *
 * "Who should I target?" used to be answered with advice in the abstract,
 * which helps nobody. This counts the segments that actually exist in their
 * contacts, cross-references which of those segments have actually replied,
 * and returns the real ones with counts. If they have no contacts yet it says
 * so plainly instead of inventing a persona.
 */
/**
 * Build a concrete "who should I target" answer out of the owner's own
 * Settings, so the agent proposes instead of asking them to name a category
 * they have already admitted they do not know.
 *
 * Returns null when the profile genuinely says nothing, so the caller can fall
 * back rather than invent a persona.
 */
async function proposeSegmentsFromProfile(db: Db, userId: string): Promise<string | null> {
  const { data } = await db
    .from("profiles")
    .select("business_description, offer, target_customer, cities, website_url")
    .eq("id", userId)
    .maybeSingle();
  if (!data) return null;

  const brief = (v: unknown): string | null => {
    const s = typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "";
    if (!s) return null;
    // First sentence is usually the actual summary; the rest is usually detail.
    const first = s.split(/(?<=[.!?])\s/)[0] ?? s;
    const text = first.length >= 12 ? first : s;
    if (text.length <= 110) return text.replace(/[.,;]+$/, "");
    // Too long to read mid-answer: cut back to the last natural break so we
    // never end on a dangling fragment like "that need a steady flow".
    const head = text.slice(0, 110);
    const cut = Math.max(head.lastIndexOf(","), head.lastIndexOf(" and "), head.lastIndexOf(" that "));
    const trimmed = cut > 40 ? head.slice(0, cut) : head;
    return trimmed.replace(/[.,;]+$/, "").trim();
  };

  // "Our ideal customers are agencies and consultants" is a whole sentence
  // describing WHO, not something you can prefix with "You sell". Strip the
  // leading clause so the phrase can be dropped into a sentence.
  const asNounPhrase = (s: string): string => s
    .replace(/^(our|my|the)\s+(ideal\s+|target\s+|primary\s+|core\s+)?(customers?|audience|clients?|market|buyers?|niche|segment)\s+(are|is|include[sd]?|includes?)\s+/i, "")
    .replace(/^(we|our business)\s+(sell to|serves?|targets?|sells? to)\s+/i, "")
    .replace(/^(our customers?|our clients?)\s+(are|is)\s+/i, "")
    .replace(/[.,;]+$/, "")
    .trim();

  const raw = brief(data.target_customer) ?? brief(data.offer) ?? brief(data.business_description);
  if (!raw) return null;
  const who = asNounPhrase(raw);
  if (!who) return null;

  const CITY_SPLIT = /[,;\n]/;
  const CITY_PREFIX = /(?:^|\s)(?:[A-Z]{2,3}|[A-Z][a-z]{2,11}):\s*/g;
  const cities = Array.isArray(data.cities)
    ? data.cities
        .flatMap((c: unknown) => String(c).split(CITY_SPLIT))
        .map((c: string) => c.replace(CITY_PREFIX, " ").replace(/\s+/g, " ").trim())
        .filter(Boolean)
        .slice(0, 4)
    : [];

  const where = cities.length ? ` Start with ${cities.slice(0, 3).join(", ")}.` : "";
  // The audience phrase appears exactly once. The earlier template printed it
  // twice ("You sell X ... the X") and read as broken.
  return `From your Settings, the people you already sell to are ${lowerFirst(who)}. Those are the safest group to email first, because they are the customers you already know work.${where} Tell me which of those to pull, or name a different type of company and I will find that instead.`;
}

function lowerFirst(s: string): string {
  // Leave acronyms and proper nouns alone; only soften an opening capital.
  if (/^[A-Z]{2,}/.test(s)) return s;
  return s.charAt(0).toLowerCase() + s.slice(1);
}

async function suggestTargeting(db: Db, userId: string, req: AgentRequest): Promise<AgentOutcome> {
  const p = req.params;

  let pool = db
    .from("leads")
    .select("id, category, company, city, country, job_title, email_status")
    .eq("user_id", userId);
  if (p.category) pool = pool.ilike("category", `%${p.category}%`);
  if (p.city) pool = pool.ilike("city", `%${p.city}%`);
  if (p.company) pool = pool.ilike("company", `%${p.company}%`);
  if (p.query) {
    pool = pool.or(`company.ilike.%${p.query}%,category.ilike.%${p.query}%,city.ilike.%${p.query}%`);
  }
  const { data, error } = await pool.limit(1000);
  if (error) return { text: "I could not look at your contacts just now." };

  const rows = (data ?? []) as any[];
  if (rows.length === 0) {
    if (p.query || p.category || p.city) {
      return {
        text: "I could not find contacts matching that. Want me to widen the search?",
        empty: true,
      };
    }
    // No contacts AND they did not name a segment. The old reply was a pure
    // deflection - "give me a category, company or city" - which repeated
    // verbatim every time they said they did not know who to target. Their own
    // Settings already answers this: propose from what they sell and where.
    const proposal = await proposeSegmentsFromProfile(db, userId);
    return {
      text: proposal
        ?? "You have no contacts saved yet, so I cannot recommend a segment from real data. "
          + "Tell me what kind of company you sell to and I will find them for you.",
      empty: true,
    };
  }

  const tally = (key: (r: any) => string | null | undefined) => {
    const m = new Map<string, number>();
    for (const r of rows) {
      const v = key(r);
      if (!v) continue;
      const s = String(v).trim();
      if (!s) continue;
      m.set(s, (m.get(s) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };

  const categories = tally((r) => r.category);
  const cities = tally((r) => r.city);
  const titles = tally((r) => r.job_title);

  // Which segments actually get replies? Only meaningful if we have sent.
  const { data: sent } = await db
    .from("emails_sent")
    .select("lead_id, replied")
    .eq("user_id", userId)
    .eq("replied", true)
    .limit(1000);
  const repliedLeadIds = new Set((sent ?? []).map((r: any) => r.lead_id).filter(Boolean));
  const hotCategories = tally(
    (r) => (repliedLeadIds.has(r.id) ? r.category : null),
  ).filter(([, n]) => n > 0);

  // Prefer a segment that has produced replies; fall back to raw volume.
  const winner = hotCategories[0]?.[0];
  const best = winner ?? categories[0]?.[0] ?? cities[0]?.[0] ?? null;
  if (!best) {
    // They have contacts, but none carry a category or city, so there is no
    // segment to recommend. This used to emit "not segmented yet. Tell me the
    // kind of company you want" - which repeated verbatim every time they said
    // they did not know who to target, and was the single most complained-about
    // reply. Their Settings can answer it instead.
    const proposal = await proposeSegmentsFromProfile(db, userId);
    const leadNote = `Your ${rows.length} saved contact${rows.length === 1 ? "" : "s"} `
      + `${rows.length === 1 ? "has" : "have"} no category or city on ${rows.length === 1 ? "it" : "them"}, `
      + "so there is no segment to compare yet. ";
    return {
      text: proposal
        ? `${leadNote}${proposal}`
        : `${leadNote}Tell me what kind of company you sell to and I will find them for you.`,
      empty: true,
    };
  }

  const rowsOut = categories.slice(0, 5).map(([name, n]) => ({
    label: name,
    value: `${n} contact${n === 1 ? "" : "s"}${hotCategories.some(([h]) => h === name) ? " - has replied" : ""}`,
  }));

  const where = categories[0]?.[0] === best && cities.length
    ? ` (mostly ${cities.slice(0, 3).map(([c]) => c).join(", ")})`
    : "";
  const proof = winner
    ? `That one has actually replied, which is why I am suggesting it.`
    : "You have not had replies from any segment yet, so this is the largest group you already own.";

  return {
    text: `Start with ${best}${where} - ${categories.find(([n]) => n === best)?.[1] ?? 0} of your `
      + `${rows.length} contacts. ${proof} Top segments: `
      + `${categories.slice(0, 5).map(([n, c]) => `${n} (${c})`).join(", ")}.`
      + (titles[0] ? ` Typical titles there: ${titles.slice(0, 3).map(([t]) => t).join(", ")}.` : ""),
    rows: rowsOut,
  };
}
