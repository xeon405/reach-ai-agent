// ---------------------------------------------------------------------------
// Loads the OWNER + ACCOUNT facts for one agent turn.
//
// The agent used to start every reply knowing only what the person had typed
// into this chat. The support chatbot already loads a live snapshot
// (buildSupportUserContext); the agent is the one that does real work on the
// account, so it is the one that must never have to guess.
//
// Everything here is read from `profiles` / counts that Settings already
// maintains, so no user is ever asked to repeat themselves.
//
// Cost note: these are 5 cheap indexed counts, not table scans. They run once
// per turn, before the model is called.
// ---------------------------------------------------------------------------

import {
  buildAgentAccountContext,
  buildBIContext,
  type AgentAccountSnapshot,
} from "./business-context.ts";
import { effectivePlan } from "./effective-plan.ts";

type Db = { from: (t: string) => any };

const PROFILE_COLUMNS =
  "name, company, plan, referral_reward_plan, referral_reward_until, "
  + "gmail_connected, gmail_email, business_description, offer, problem_solved, "
  + "target_customer, cities, communication_style, dont_claim, website_url";

export interface AgentAccountContext {
  /** The "## THEIR ACCOUNT" block for the prompt. */
  account: string;
  /** The "BUSINESS CONTEXT" block for the prompt. */
  business: string;
  /** True when the owner has not filled in Settings. */
  businessIncomplete: boolean;
  /**
   * The same numbers, structured. The rendered blocks are written FOR THE
   * MODEL, so quoting them back to a human produces robotic filler like
   * "You are (account owner, name not set)". Having the real values lets us
   * answer from data when the model is unreachable.
   */
  facts?: AgentAccountSnapshot;
}

/**
 * Build the owner + account snapshot. Never throws: a failure here degrades to
 * "no context" rather than failing the person's question.
 */
export async function loadAgentAccountContext(
  db: Db,
  userId: string,
): Promise<AgentAccountContext> {
  const empty: AgentAccountContext = { account: "", business: "", businessIncomplete: false };
  try {
    const { data: profile } = await db
      .from("profiles")
      .select(PROFILE_COLUMNS)
      .eq("id", userId)
      .maybeSingle();

    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

    // Fire the independent reads together - serial awaits would add a full
    // round trip each and this runs on every single turn.
    const [todayRes, monthRes, leadRes, campRes, activeRes, replyRes, interestedRes] = await Promise.all([
      db.from("usage_limits").select("emails_sent_today, limit_date").eq("user_id", userId).maybeSingle(),
      db.from("emails_sent").select("*", { count: "exact", head: true })
        .eq("user_id", userId).gte("sent_at", monthStart).not("gmail_message_id", "is", null),
      db.from("leads").select("*", { count: "exact", head: true }).eq("user_id", userId),
      db.from("campaigns").select("*", { count: "exact", head: true }).eq("user_id", userId),
      db.from("campaigns").select("*", { count: "exact", head: true }).eq("user_id", userId).eq("status", "active"),
      db.from("emails_sent").select("*", { count: "exact", head: true })
        .eq("user_id", userId).eq("replied", true),
      db.from("emails_sent").select("*", { count: "exact", head: true })
        .eq("user_id", userId).eq("reply_sentiment", "INTERESTED"),
    ]);

    const todayStr = new Date().toISOString().slice(0, 10);
    const todaySent = todayRes.data && todayRes.data.limit_date === todayStr
      ? Number(todayRes.data.emails_sent_today ?? 0)
      : 0;

    const plan = effectivePlan({
      plan: profile?.plan ?? null,
      referral_reward_plan: profile?.referral_reward_plan ?? null,
      referral_reward_until: profile?.referral_reward_until ?? null,
    });

    const business = buildBIContext((profile ?? {}) as Record<string, unknown>);
    const businessIncomplete = !business.trim().length;

    const snapshot: AgentAccountSnapshot = {
      name: profile?.name ?? null,
      company: profile?.company ?? null,
      plan,
      gmailConnected: profile?.gmail_connected ?? false,
      todaySent,
      monthSent: monthRes.count ?? 0,
      leads: leadRes.count ?? 0,
      campaigns: campRes.count ?? 0,
      activeCampaigns: activeRes.count ?? 0,
      replies: replyRes.count ?? 0,
      interested: interestedRes.count ?? 0,
      businessIncomplete,
    };

    return {
      account: buildAgentAccountContext(snapshot),
      business,
      businessIncomplete,
      facts: snapshot,
    };
  } catch (err) {
    // A missing table or column must not take the whole agent down.
    console.warn("agent account context unavailable", err);
    return empty;
  }
}