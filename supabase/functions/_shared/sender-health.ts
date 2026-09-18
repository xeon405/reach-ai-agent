// 0a shared: downstream daily-cap resolution.
// Reads gmail_tokens.connected_at for the warm-up anchor and sender_health for
// health-adjusted caps. Fail-safe: when the health ledger has no row, or its
// row is stale, behaviour is exactly today's ramp formula — a missing ledger can
// never raise a cap or block sending.
export const HEALTH_MAX_AGE_MS = 24 * 3600 * 1000;

// Deterministic brakes — the ONLY controls between reputation signals and caps.
export const BRAKES = {
  BOUNCE_RATE_RED: 0.03,  // >3% hard-bounce rate -> recovery
  UNSUR_RATE_RED: 0.01,   // >1% one-click unsubscribe rate -> recovery (complaint proxy)
  CLEAN_DAYS: 7,          // consecutive clean nights to exit recovery
  CAP_FLOOR: 5,           // absolute floor while in recovery
  RECOVERY_GROWTH: 0.1,   // +10%/night stair back toward the warm ramp
} as const;

export interface HealthMetrics {
  sends: number;
  bounces: number;
  unsubs: number;
  replies: number;
}

export interface HealthState {
  phase: "ramp" | "steady" | "recovery";
  current_cap: number;
  clean_days: number;
  bounce_rate_7d: number;
  complaint_rate_7d: number;
  reply_rate_7d: number;
}

export function measureRates(m: HealthMetrics): { bounce_rate: number; unsub_rate: number; reply_rate: number } {
  if (m.sends <= 0) return { bounce_rate: 0, unsub_rate: 0, reply_rate: 0 };
  return {
    bounce_rate: m.bounces / m.sends,
    unsub_rate: m.unsubs / m.sends,
    reply_rate: m.replies / m.sends,
  };
}

export interface HealthUpdateInput {
  prev: Pick<HealthState, "phase" | "current_cap" | "clean_days"> | null; // null = first measurement for this mailbox
  metrics: HealthMetrics;
  warm: number;   // the plan-ramp ceiling: min(plan.dailyEmails, 5 + daysWarm*5, ceiling)
  planDaily: number;
  daysWarm: number;
}

/**
 * Pure state machine for one measurement night (sends >= 5).
 * - Bounce/unsub red -> recovery: cap halves (floor 5), probation restarts.
 * - Healthy         -> cap stairs +10%/night, exits to the warm ramp after
 *   CLEAN_DAYS consecutive clean nights.
 * Guarantee: the returned current_cap can never exceed `warm`. The brake is
 * additive — it only tightens beneath the existing warm-up ramp.
 */
export function computeHealthUpdate(input: HealthUpdateInput): HealthState {
  const { prev, metrics, warm, planDaily, daysWarm } = input;
  const { bounce_rate, unsub_rate, reply_rate } = measureRates(metrics);
  const prevCap = prev?.current_cap ?? warm;
  const prevClean = prev?.clean_days ?? 0;

  const red = bounce_rate > BRAKES.BOUNCE_RATE_RED || unsub_rate > BRAKES.UNSUR_RATE_RED;
  let phase: HealthState["phase"];
  let current_cap: number;
  let clean_days: number;

  if (red) {
    // Violation night: cap halves, probation restarts.
    phase = "recovery";
    current_cap = Math.max(BRAKES.CAP_FLOOR, Math.min(Math.floor(prevCap / 2), warm));
    clean_days = 0;
  } else {
    clean_days = prevClean + 1;
    if (prev?.phase === "recovery") {
      // Exhaust probation -> step back toward the warm ramp, +10%/night.
      current_cap = Math.min(warm, Math.max(BRAKES.CAP_FLOOR, Math.ceil(prevCap * (1 + BRAKES.RECOVERY_GROWTH))));
      phase = "recovery";
      if (clean_days >= BRAKES.CLEAN_DAYS) {
        current_cap = warm;
        phase = "steady";
        clean_days = 0;
      }
    } else {
      current_cap = warm;
      phase = warm >= planDaily && daysWarm >= 7 ? "steady" : "ramp";
    }
  }

  return {
    phase,
    current_cap,
    clean_days,
    bounce_rate_7d: Math.round(bounce_rate * 10000) / 10000,
    complaint_rate_7d: Math.round(unsub_rate * 10000) / 10000,
    reply_rate_7d: Math.round(reply_rate * 10000) / 10000,
  };
}

export interface CapProfile {
  id: string;
  created_at?: string | null;
  gmail_account_type?: string | null;
}

/** Warm ramp value BEFORE health feedback (the ceiling a healthy sender can reach). */
export function warmCap(planDaily: number, daysWarm: number, ceiling: number): number {
  return Math.min(planDaily, 5 + daysWarm * 5, ceiling);
}

/**
 * Resolve the daily cap for a mailbox.
 * - Anchor: gmail_tokens.connected_at when present (mailbox connect date), else
 *   profile.created_at (legacy accounts that never reconnect).
 * - Health: if a fresh sender_health row exists, clamp to its current_cap
 *   (bounded below by 5, bounded above by the warm ramp).
 * - Otherwise: the plain warm ramp.
 */
export async function resolveDailyCap(
  db: any,
  profile: CapProfile,
  planDaily: number,
  ceiling: number,
): Promise<number> {
  const { data: anchorRow } = await db
    .from("gmail_tokens")
    .select("connected_at")
    .eq("profile_id", profile.id)
    .maybeSingle();
  const anchorMs = anchorRow?.connected_at
    ? new Date(anchorRow.connected_at).getTime()
    : new Date(profile.created_at ?? Date.now()).getTime();
  const daysWarm = Math.max(0, Math.floor((Date.now() - anchorMs) / 86400000));
  const warm = warmCap(planDaily, daysWarm, ceiling);

  const { data: sh } = await db
    .from("sender_health")
    .select("current_cap, last_measured_at")
    .eq("profile_id", profile.id)
    .maybeSingle();
  if (
    sh?.current_cap != null &&
    sh.last_measured_at &&
    Date.now() - new Date(sh.last_measured_at).getTime() < HEALTH_MAX_AGE_MS
  ) {
    return Math.max(5, Math.min(sh.current_cap, warm));
  }
  return warm;
}