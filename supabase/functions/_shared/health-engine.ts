// Pure decision engine for the hourly health-check. No Deno, no DB.
// Shared by supabase/functions/health-check/index.ts (runtime) and
// scripts/.ops/prove-health-sim.mjs (simulation proof) so the proof exercises
// the exact code shipped to production.

// ---- thresholds ----------------------------------------------------------
// send-worker cadence is hourly -> pending jobs get 2x cadence (~2h), NOT a
// flat 30 min (a 30-min pending job is normal on the hour boundary). A
// 'processing' job was CLAIMED by a worker; >15 min means the worker died
// mid-send (orphaned claim) — different signal, kept tight.
export const PENDING_STALE_MS = 2 * 60 * 60 * 1000; // 2h
export const PROCESSING_ORPHAN_MS = 15 * 60 * 1000; // 15m
export const STALE_FLOOR_MIN = 30; // no job ever waits less than 30 min
export const DRIFT_EPSILON_USD = 0.005; // ai_cost_state cache vs ledger
export const SENDER_STALE_MS = 30 * 60 * 60 * 1000; // last_measured_at > 30h
export const SENDER_BOUNCE_RED = 0.03; // mirrors sender-health.ts BRAKES
export const SENDER_COMPLAINT_RED = 0.01;

export const CRON_CADENCE_MIN: Record<string, number> = {
  "cost-sweep": 5,
  "outreachai_push_drainer_minutely": 1,
  "outreachai_inbox_agent_hourly": 1,
  "outreachai_send_worker_hourly": 60,
  "learning-hourly": 60,
  "health-hourly": 60,
  "outreachai_daily_digest": 1440,
  "outreachai_warm_areas_daily": 1440,
  "reputation-nightly": 1440,
};

// OUTCOME-FIRST cron evidence (Stage 9 hardening, see reputation-report fix):
// cron.job_run_details 'succeeded' only proves net.http_post DISPATCHED the
// request — the async edge invocation can be lost without a trace (the 09-09
// reputation-nightly incident). Every cron target therefore writes an
// UNCONDITIONAL run-marker audit row on each executed invocation, and the
// probe judges freshness on THAT first. A stale marker is red even when
// pg_cron still shows fresh dispatches; a missing marker falls back to
// dispatch evidence only during the pre-rollout window.
export const CRON_RUN_EVENT: Record<string, string> = {
  "cost-sweep": "cost.sweep.run",
  "outreachai_push_drainer_minutely": "push.drain.run",
  "outreachai_inbox_agent_hourly": "inbox.run",
  "outreachai_send_worker_hourly": "send.worker.run",
  "learning-hourly": "learning.fold",
  "health-hourly": "health.run",
  "outreachai_daily_digest": "digest.run",
  "outreachai_warm_areas_daily": "warm.run",
  "reputation-nightly": "health.report.run",
};

export interface HealthProblem {
  key: string; // stable dedup key, e.g. cron:outreachai_warm_areas_daily
  title: string;
  body: string;
  userId?: string; // resolved alert owner for per-mailbox problems
}

export interface HealthState {
  check_key: string;
  active_since: string | null;
  last_alerted_at: string | null;
  last_seen_at: string | null;
  resolved_at: string | null;
  escalated_at: string | null;
  alert_count: number;
}

export interface HealthDecision {
  problem: HealthProblem;
  state: HealthState;
  alert: "initial" | "escalation" | null;
}

export interface CronRunRow {
  jobname: string;
  schedule?: string;
  last_start?: string | null;
  last_success?: string | null;
  failed_runs?: number;
  /** Name of the run-marker audit event for this job (informational). */
  last_run_event?: string | null;
  /** ISO timestamp of the target function's last unconditional run-marker
   *  audit row (proof of EXECUTION, not dispatch). null = never confirmed. */
  last_run_event_at?: string | null;
}

// 2x-cadence, floored at STALE_FLOOR_MIN.
export function cronLimitMs(jobname: string): number {
  const cadence = CRON_CADENCE_MIN[jobname];
  const twoX = 2 * (cadence ?? 60) * 60 * 1000;
  return Math.max(twoX, STALE_FLOOR_MIN * 60 * 1000);
}

// ---- pure probes ---------------------------------------------------------

export function cronProblems(
  runs: CronRunRow[],
  nowMs: number,
): HealthProblem[] {
  const problems: HealthProblem[] = [];
  const seen = new Set<string>();
  for (const r of runs) {
    seen.add(r.jobname);
    const limit = cronLimitMs(r.jobname);
    const markerTs = r.last_run_event_at ? new Date(r.last_run_event_at).getTime() : null;
    // OUTCOME-FIRST: a fresh run marker proves the function body actually
    // executed — dispatch evidence is not consulted. This is what catches the
    // "pg_cron says succeeded but the function never ran" failure mode.
    if (markerTs !== null && nowMs - markerTs <= limit) continue;

    const lastSuccessMs = r.last_success ? new Date(r.last_success).getTime() : null;
    const hasAttempt = !!r.last_start;
    let stale: boolean;
    let agoSuffix: string;
    if (markerTs !== null) {
      // Marker exists but is stale -> red EVEN IF dispatch is still fresh.
      stale = nowMs - markerTs > limit;
      agoSuffix = `${Math.floor((nowMs - markerTs) / 3600000)}h since confirmed execution (${lastSuccessMs && nowMs - lastSuccessMs <= limit ? "dispatch still fresh" : `last dispatch ${lastSuccessMs ? Math.floor((nowMs - lastSuccessMs) / 3600000) + "h ago" : "n/a"}`})`;
    } else {
      // No marker yet (pre-rollout or never confirmed). Fall back to dispatch evidence.
      stale = lastSuccessMs === null ? hasAttempt : nowMs - lastSuccessMs > limit;
      agoSuffix = lastSuccessMs === null
        ? "attempts but has never succeeded"
        : `${Math.floor((nowMs - lastSuccessMs) / 3600000)}h since last success`;
    }
    if (!stale) continue;
    problems.push({
      key: `cron:${r.jobname}`,
      title: `Cron quiet: ${r.jobname}`,
      body: `${r.jobname} — ${agoSuffix} (limit ${Math.round(limit / 3600000 * 10) / 10}h).`,
    });
  }
  for (const jobname of Object.keys(CRON_CADENCE_MIN)) {
    if (!seen.has(jobname)) {
      problems.push({
        key: `cron:${jobname}`,
        title: `Cron missing: ${jobname}`,
        body: `${jobname} is not registered with pg_cron anymore — the job may have been unscheduled.`,
      });
    }
  }
  return problems;
}

export function queueProblems(o: {
  pendingMax?: string | null;
  processingMax?: string | null;
  nowMs: number;
}): HealthProblem[] {
  const problems: HealthProblem[] = [];
  if (o.pendingMax) {
    const age = o.nowMs - new Date(o.pendingMax).getTime();
    if (age > PENDING_STALE_MS) {
      problems.push({
        key: "queue:pending",
        title: "Send queue stalled",
        body: `Oldest 'pending' job is ${Math.floor(age / 60000)}m old (limit ${PENDING_STALE_MS / 60000}m) — nothing is claiming jobs.`,
      });
    }
  }
  if (o.processingMax) {
    const age = o.nowMs - new Date(o.processingMax).getTime();
    if (age > PROCESSING_ORPHAN_MS) {
      problems.push({
        key: "queue:orphan",
        title: "Orphaned send claim",
        body: `A job has been 'processing' for ${Math.floor(age / 60000)}m (limit ${PROCESSING_ORPHAN_MS / 60000}m) — a worker likely died mid-send.`,
      });
    }
  }
  return problems;
}

export interface DriftRow {
  profile_id: string;
  window_date: string;
  window_month: string;
  used_daily_usd: number;
  used_monthly_usd: number;
}
export interface LedgerSums {
  daily: number;
  monthly: number;
}

export function driftProblems(
  rows: DriftRow[],
  sumsByProfile: Record<string, LedgerSums>,
): HealthProblem[] {
  const problems: HealthProblem[] = [];
  for (const r of rows) {
    const sums = sumsByProfile[r.profile_id];
    if (!sums) continue;
    const dDelta = Math.abs(sums.daily - r.used_daily_usd);
    const mDelta = Math.abs(sums.monthly - r.used_monthly_usd);
    if (dDelta > DRIFT_EPSILON_USD || mDelta > DRIFT_EPSILON_USD) {
      problems.push({
        key: `costdrift:${r.profile_id}`,
        title: "AI cost meter drift",
        body: `profile ${r.profile_id}: state\$/ledger\$ daily ${r.used_daily_usd}\/${sums.daily.toFixed(6)} (Δ${dDelta.toFixed(6)}), monthly ${r.used_monthly_usd}\/${sums.monthly.toFixed(6)} (Δ${mDelta.toFixed(6)}).`,
      });
    }
  }
  return problems;
}

// ---- dedup / cooldown state machine -------------------------------------

export function evaluateHealth(
  problems: HealthProblem[],
  existing: Record<string, HealthState>,
  nowIso: string,
  escalationMs: number,
): { decisions: HealthDecision[]; resolveKeys: string[] } {
  const nowMs = new Date(nowIso).getTime();
  const problemKeys = new Set(problems.map((p) => p.key));

  const decisions: HealthDecision[] = problems.map((problem) => {
    const prev = existing[problem.key];
    const active = !!prev && !prev.resolved_at;

    let state: HealthState;
    let alert: HealthDecision["alert"] = null;

    if (!active) {
      // New episode (or first ever) -> alert immediately.
      alert = "initial";
      state = {
        check_key: problem.key,
        active_since: nowIso,
        last_alerted_at: nowIso,
        last_seen_at: nowIso,
        resolved_at: null,
        escalated_at: null,
        alert_count: (prev?.alert_count ?? 0) + 1,
      };
    } else {
      // Continuously-broken: no re-alert; touch last_seen only.
      state = { ...prev!, last_seen_at: nowIso };
      if (
        !prev!.escalated_at &&
        nowMs - new Date(prev!.last_alerted_at!).getTime() >= escalationMs
      ) {
        // One escalation after 24h, then silence again.
        alert = "escalation";
        state = {
          ...state,
          last_alerted_at: nowIso,
          escalated_at: nowIso,
          alert_count: prev!.alert_count + 1,
        };
      }
    }

    return { problem, state, alert };
  });

  const resolveKeys: string[] = Object.keys(existing).filter(
    (key) => !existing[key].resolved_at && !problemKeys.has(key),
  );

  return { decisions, resolveKeys };
}

export function alertBody(problem: HealthProblem, episodeCount: number): string {
  return `${problem.body} [alert #${episodeCount}]`;
}

export function alertTitle(problem: HealthProblem, alertKind: "initial" | "escalation"): string {
  return alertKind === "escalation" ? `${problem.title} — still failing` : problem.title;
}

// ---- dead-man's switch ---------------------------------------------------
// Liveness ping for an external heartbeat service (healthchecks.io / cronitor
// style). GET <url> on a successful run, GET <url>/fail on a fatal crash. Any
// outage, timeout, or absent URL => false (caller decides how to treat it).
export async function pingDeadMan(
  url: string | undefined,
  fail: boolean,
  timeoutMs = 6000,
): Promise<boolean> {
  if (!url) return true;
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeoutMs);
    const res = await fetch(`${url}${fail ? "/fail" : ""}`, {
      method: "GET",
      cache: "no-store",
      signal: ctl.signal,
    });
    clearTimeout(t);
    return res.ok;
  } catch {
    return false;
  }
}