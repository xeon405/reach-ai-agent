// ============================================================
// COST-SWEEP — Stage 7 audit + marker writer (cron, every 5 min).
// Design: INTELLIGENCE-LAYER-DESIGN.md §6.3/§6.6.
// Runs the reconciliation drift check (durable counter vs ledger), the
// staleness heartbeat tripwire, writes the dual markers into agent_config
// (sweep is the single writer), and audits the sends-vs-ledger gap.
// It NEVER rewrites the counter values: only ai_cost_debit (reserve) and
// ai_cost_settle (meter) write counters; an absolute re-set here would race
// in-flight debits. Reconciliation is read-only + marker-writing.
//
// Marker ownership:
//   * ai_quality.mode       — written by the sweep only when no user row exists
//     (or the existing one is the default 'ai'). A row an admin set persists.
//   * ai_quality.metering_degraded — sweep-owned (single writer). Degrade heals
//     itself ≤ 5 min after the cause clears; an admin wanting persistent degrade
//     should set mode='template' instead (that row is never clobbered).
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { insertAudit } from "../_shared/audit.ts";
import {
  AI_DRIFT_TOL_AHEAD,
  AI_METER_MAX_AGE_MS,
  aiPools,
} from "../_shared/ai-cost-gate.ts";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  const secret = Deno.env.get("CRON_SECRET");
  if (!secret || req.headers.get("x-cron-secret") !== secret) return json({ error: "Unauthorized" }, 401);
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Run-marker: unconditional proof this invocation EXECUTED (health-check's
  // cron probe judges freshness on this, never on dispatch 'succeeded' alone).
  try {
    await insertAudit(supabase as any, {
      user_id: null,
      event: "cost.sweep.run",
      payload: { at: new Date().toISOString() },
    });
  } catch { /* marker is best-effort; the sweep body is authoritative */ }

  const day = new Date();
  const dayStr = day.toISOString().slice(0, 10);
  const monthStr = day.toISOString().slice(0, 7);

  // Candidate profiles: anyone with a counter row OR ledger activity today.
  const userIds = new Set<string>();
  try {
    const { data: states } = await supabase.from("ai_cost_state").select("profile_id");
    for (const s of states ?? []) userIds.add(String(s.profile_id));
  } catch { /* read failure -> run with ledger-side candidates only */ }
  try {
    const { data: ledg } = await supabase
      .from("ai_spend_ledger").select("user_id").gte("ts", `${dayStr}T00:00:00Z`);
    for (const r of ledg ?? []) if (r.user_id) userIds.add(String(r.user_id));
  } catch { /* tolerate */ }

  let scanned = 0, degraded = 0;
  for (const userId of userIds) {
    try {
      scanned++;
      const { data: profile } = await supabase.from("profiles").select("id, plan").eq("id", userId).maybeSingle();
      if (!profile) continue;
      const pools = aiPools(profile?.plan);

      const { data: state } = await supabase.from("ai_cost_state")
        .select("used_daily_usd, used_monthly_usd, last_reported_at")
        .eq("profile_id", userId).maybeSingle();
      const counterDaily = Number(state?.used_daily_usd ?? 0) || 0;
      const counterMonth = Number(state?.used_monthly_usd ?? 0) || 0;

      const { data: dayRows } = await supabase.from("ai_spend_ledger")
        .select("est_cost_usd").eq("user_id", userId).gte("ts", `${dayStr}T00:00:00Z`);
      const ledgerDaily = (dayRows ?? []).reduce((a, r) => a + (Number(r.est_cost_usd) || 0), 0);

      const { data: monthRows } = await supabase.from("ai_spend_ledger")
        .select("est_cost_usd").eq("user_id", userId).gte("ts", `${monthStr}-01T00:00:00Z`);
      const ledgerMonth = (monthRows ?? []).reduce((a, r) => a + (Number(r.est_cost_usd) || 0), 0);

      const { data: sentRows } = await supabase
        .from("audit_events").select("id").eq("user_id", userId)
        .eq("event", "email.sent").gte("created_at", `${dayStr}T00:00:00Z`);

      // Reconciliation drift (dark-ledger): durable counter ahead of what the
      // ledger logged by > tolerance while spend exists => rows lost / settle
      // without ledger => metering is degraded => conserve (§6.6).
      let isDegraded = counterDaily > 0 && counterDaily - ledgerDaily > AI_DRIFT_TOL_AHEAD;
      // Staleness heartbeat: spend with no fresh sweep heartbeat = spent-unknown.
      if (counterDaily > 0 && state?.last_reported_at) {
        const age = Date.now() - new Date(state.last_reported_at).getTime();
        if (!Number.isFinite(age) || age > AI_METER_MAX_AGE_MS) isDegraded = true;
      }
      if (counterDaily > 0 && !state?.last_reported_at) isDegraded = true;

      // Informational send-gap monitor (never trips — templates legitimately send
      // with zero AI calls, so this signal must not feed the breaker).
      const sendsToday = (sentRows ?? []).length;
      if (sendsToday > 0) {
        const aiCallsToday = (dayRows ?? []).length;
        await supabase.from("audit_events").insert({
          user_id: userId, event: "ai.metering.reconcile_send_gap",
          payload: { sends_today: sendsToday, ai_calls_today: aiCallsToday, ledger_daily_usd: ledgerDaily, counter_daily_usd: counterDaily, degraded: isDegraded },
          model_version: "meter/v1", strategy_ref: null,
        }).then(() => {}, () => {});
      }

      // Markers into agent_config (scoped user). mode: write only when absent or
      // stale-default 'ai'; metering_degraded: sweep-owned, healed on clear.
      const { data: modeRow } = await supabase.from("agent_config")
        .select("id, value, enabled").eq("key", "ai_quality.mode")
        .eq("scope", "user").eq("scope_id", userId).maybeSingle();
      const curMode = modeRow?.value;
      const computedMode = isDegraded
        ? "template"
        : counterDaily >= pools.daily || ledgerDaily >= pools.daily
          ? "template"
          : counterMonth >= pools.monthly || ledgerMonth >= pools.monthly
            ? "hard_stop"
            : "ai";
      // mode: an existing explicit (non-default) row is admin-owned and wins;
      // a stale 'ai' default is recomputed by the sweep.
      const finalMode = curMode != null && String(curMode).trim() !== "ai"
        ? String(curMode).trim()
        : computedMode;

      await supabase.rpc("set_agent_config", {
        p_key: "ai_quality.mode", p_scope: "user", p_scope_id: userId,
        p_value: finalMode, p_enabled: true, p_changed_by: "cost-sweep",
      }).then(() => {}, () => {});
      await supabase.rpc("set_agent_config", {
        p_key: "ai_quality.metering_degraded", p_scope: "user", p_scope_id: userId,
        p_value: isDegraded, p_enabled: true, p_changed_by: "cost-sweep",
      }).then(() => {}, () => {});

      // Heartbeat refresh on the counter row (sweep ran + state sane).
      if (state) {
        await supabase.from("ai_cost_state").update({ last_reported_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq("profile_id", userId).then(() => {}, () => {});
      }

      if (isDegraded) degraded++;
    } catch (err) {
      console.error(`[cost-sweep] profile ${userId}:`, err?.message ?? err);
    }
  }

  // Guest wall (support-chat visitor bucket): no profile row exists to carry the
  // per-user markers, so this sweep's only job here is keeping the bucket's
  // heartbeat fresh — a spent-unknown guest bucket conserves inside
  // openGuestAiCall exactly like a user's stale counter (§6.6 stale-unknown).
  let guestScanned = 0;
  try {
    const { data: guest } = await supabase
      .from("ai_cost_guest_state").select("id, used_daily_usd").eq("id", true).maybeSingle();
    if (guest) {
      await supabase.from("ai_cost_guest_state")
        .update({ last_reported_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", true).then(() => {}, () => {});
      guestScanned = 1;
    }
  } catch { /* tolerate */ }

  return json({ ok: true, scanned, degraded, guest_scanned: guestScanned, at: new Date().toISOString() });
});