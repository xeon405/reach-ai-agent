export type PlanId = "free" | "starter" | "growth" | "agency";

export interface PlanLimits {
  /** Emails a user may send per day (hard stop, enforced in send-worker). */
  dailyEmails: number;
  /** Emails a plan may ever send in total, or null for unlimited (enforced in reserve_send_slot). */
  lifetimeEmails: number | null;
  /** Total leads a user may hold, or null for unlimited (enforced by DB trigger). */
  leads: number | null;
  /** Active campaigns a user may run at once, or null for unlimited (enforced by DB trigger). */
  campaigns: number | null;
}

/**
 * Mirrors public.plan_limits in the database
 * (supabase/migrations/20261009000001_plan_limits.sql and
 * 20261101000001_anti_abuse_mvp.sql).
 * Keep both in sync.
 */
export const PLAN_LIMITS: Record<PlanId, PlanLimits> = {
  free: { dailyEmails: 10, lifetimeEmails: 50, leads: 25, campaigns: 1 },
  starter: { dailyEmails: 50, lifetimeEmails: null, leads: 250, campaigns: 1 },
  growth: { dailyEmails: 200, lifetimeEmails: null, leads: 1000, campaigns: 5 },
  agency: { dailyEmails: 500, lifetimeEmails: null, leads: 5000, campaigns: null },
};

export const PLAN_ORDER: PlanId[] = ["free", "starter", "growth", "agency"];

function count(n: number | null, unit: string): string {
  if (n === null) return `Unlimited ${unit}`;
  return `${n.toLocaleString()} ${unit}`;
}

/** One-line description of everything a plan unlocks, e.g. for the billing page. */
export function planSummary(plan: PlanId): string {
  const l = PLAN_LIMITS[plan];
  const campaigns =
    l.campaigns === null
      ? "unlimited campaigns"
      : `${l.campaigns} campaign${l.campaigns === 1 ? "" : "s"} at a time`;
  const emails =
    l.lifetimeEmails === null
      ? count(l.dailyEmails, "emails/day")
      : `${l.dailyEmails}/day, ${l.lifetimeEmails} total`;
  return `${emails} · ${count(l.leads, "leads")} · ${campaigns}`;
}
