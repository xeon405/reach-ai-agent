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

import type { AgentIntent, AgentRequest } from "./agent-router.ts";

type Db = { from: (t: string) => any };

export interface AgentOutcome {
  /** Plain-language result shown in the chat bubble. */
  text: string;
  /** Optional rows for the UI to render as a table. */
  rows?: { label: string; value: string }[];
  /** Set when nothing was found, so the UI can suggest what to do instead. */
  empty?: boolean;
}

const MAX_ROWS = 200;

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
  const [sent, replies, contacts, active] = await Promise.all([
    db.from("emails_sent").select("id", { count: "exact", head: true }).eq("user_id", userId),
    db.from("ai_classifications").select("id", { count: "exact", head: true }).eq("user_id", userId),
    db.from("leads").select("id", { count: "exact", head: true }).eq("user_id", userId),
    db.from("campaigns").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "active"),
  ]);
  return {
    text: "Here is where you are:",
    rows: [
      { label: "Emails sent", value: String(sent.count ?? 0) },
      { label: "Replies received", value: String(replies.count ?? 0) },
      { label: "Contacts saved", value: String(contacts.count ?? 0) },
      { label: "Campaigns sending", value: String(active.count ?? 0) },
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
    return { text: `I could not find any saved contacts${p.category ? ` for ${p.category}` : ""}.`, empty: true };
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
    return { text: "What should the campaign be called?", empty: true };
  }
  const { data: existing } = await db
    .from("campaigns")
    .select("id")
    .eq("user_id", userId)
    .ilike("name", name)
    .maybeSingle();
  if (existing) {
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

async function pauseCampaign(db: Db, userId: string, req: AgentRequest): Promise<AgentOutcome> {
  const name = req.params.campaignName?.trim();
  let q = db.from("campaigns").select("id, name, status").eq("user_id", userId).eq("status", "active");
  if (name) q = q.ilike("name", `%${name}%`);
  const { data, error } = await q.limit(1);
  if (error) return { text: "I could not update your campaigns." };
  if (!data || data.length === 0) {
    return { text: name ? `No sending campaign called "${name}" was found.` : "You have no campaigns currently sending.", empty: true };
  }
  const target = data[0];
  const { error: upErr } = await db.from("campaigns").update({ status: "paused" }).eq("id", target.id).eq("user_id", userId);
  if (upErr) return { text: "I could not pause that campaign." };
  return { text: `Paused "${target.name}". It will stop sending.` };
}

async function addContactsToCampaign(db: Db, userId: string, req: AgentRequest): Promise<AgentOutcome> {
  const campName = req.params.campaignName?.trim();
  if (!campName) return { text: "Which campaign should I add them to?", empty: true };

  const { data: camp } = await db
    .from("campaigns")
    .select("id, name")
    .eq("user_id", userId)
    .ilike("name", `%${campName}%`)
    .maybeSingle();
  if (!camp) return { text: `I could not find a campaign called "${campName}".`, empty: true };

  const p = req.params;
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
