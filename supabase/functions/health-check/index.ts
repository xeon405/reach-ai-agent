// ============================================================
// HEALTH-CHECK — Stage 9 infra watchdog (cron, hourly).
//
// One function, five probes, one reuse-everything design:
//   1. Gmail OAuth validity  -> real token mint via _shared/gmail.ts
//   2. send_queue age        -> oldest pending / orphaned processing
//   3. cron last-run         -> pg_cron's own ledger via health_last_cron_runs()
//      (includes ITSELF in the staleness scan — its own quiet/crash surfaces)
//   4. sender_health         -> recovery phase / red rates / stale measurement
//   5. ai cost drift         -> re-sum ai_spend_ledger vs ai_cost_state cache
//
// Alerts: owner_alerts kind='system' priority='high' -> the existing
// trg_alerts_to_push -> push_queue -> push-drainer Web Push channel.
// Dedup: health_state rows (engine in _shared/health-engine.ts).
// Liveness: pings HEALTHCHECKS_PING_URL (dead-man's switch) on success and
// <url>/fail on fatal, so a total Supabase outage still pages the owner.
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getAccessToken } from "../_shared/gmail.ts";
import { insertAudit } from "../_shared/audit.ts";
import {
  alertBody,
  alertTitle,
  cronProblems,
  driftProblems,
  evaluateHealth,
  pingDeadMan,
  queueProblems,
  SENDER_STALE_MS,
  SENDER_BOUNCE_RED,
  SENDER_COMPLAINT_RED,
  type HealthProblem,
  type HealthState,
} from "../_shared/health-engine.ts";

const ESCALATION_MS = 24 * 60 * 60 * 1000;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  const secret = Deno.env.get("CRON_SECRET");
  if (!secret || req.headers.get("x-cron-secret") !== secret) return json({ error: "Unauthorized" }, 401);

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const nowIso = new Date().toISOString();
  const pingUrl = Deno.env.get("HEALTHCHECKS_PING_URL");
  let systemOwner: string | undefined;

  try {
    const problems: HealthProblem[] = [];
    const alertCounts: Record<string, number> = {};

    // Owner resolution for system-wide alerts (not tied to a mailbox).
    const ownerResult = await supabase
      .from("gmail_tokens")
      .select("profile_id")
      .limit(1)
      .maybeSingle();
    let ownerId = ownerResult.data?.profile_id ?? null;
    if (!ownerId) {
      const p = await supabase.from("profiles").select("id").order("created_at", { ascending: true }).limit(1).maybeSingle();
      ownerId = p.data?.id ?? null;
    }
    systemOwner = ownerId ?? undefined;

    async function probe(name: string, body: () => Promise<HealthProblem[]>): Promise<void> {
      try {
        problems.push(...(await body()));
      } catch (err) {
        problems.push({
          key: `probe:${name}`,
          title: `Health probe failed: ${name}`,
          body: `The health-check could not run its ${name} probe: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }

    // ---- 1. Gmail OAuth validity (real token mint) ----
    await probe("gmail", async () => {
      const out: HealthProblem[] = [];
      const { data: tokens } = await supabase
        .from("gmail_tokens")
        .select("profile_id")
        .not("refresh_token", "is", null);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, gmail_email, gmail_state");
      if (!tokens?.length) return out;

      const byId = new Map((profiles ?? []).map((p: any) => [p.id, p]));
      await Promise.all(
        (tokens as { profile_id: string }[]).map(async (t) => {
          const profile = byId.get(t.profile_id) as any;
          const email = profile?.gmail_email || profile?.email || t.profile_id;
          if (profile?.gmail_state && profile.gmail_state !== "CONNECTED") {
            out.push({
              key: `token:${t.profile_id}`,
              title: "Gmail disconnected",
              body: `${email} — gmail_state=${profile.gmail_state}.`,
              userId: t.profile_id,
            });
            return;
          }
          try {
            const minted = await getAccessToken(supabase as any, t.profile_id);
            if (!minted) {
              out.push({
                key: `token:${t.profile_id}`,
                title: "Gmail token unavailable",
                body: `${email} — no credential row/refresh token.`,
                userId: t.profile_id,
              });
            }
          } catch (err) {
            out.push({
              key: `token:${t.profile_id}`,
              title: "Gmail credential failed",
              body: `${email} — ${err instanceof Error ? err.message : String(err)}. Reconnect the account.`,
              userId: t.profile_id,
            });
          }
        }),
      );
      return out;
    });

    // ---- 2. send_queue age ----
    await probe("queue", async () => {
      const [pending, orphan] = await Promise.all([
        supabase
          .from("send_queue")
          .select("created_at")
          .eq("status", "pending")
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("send_queue")
          .select("updated_at")
          .eq("status", "processing")
          .not("updated_at", "is", null)
          .order("updated_at", { ascending: true })
          .limit(1)
          .maybeSingle(),
      ]);
      return queueProblems({
        pendingMax: (pending.data as any)?.created_at ?? null,
        processingMax: (orphan.data as any)?.updated_at ?? null,
        nowMs: new Date(nowIso).getTime(),
      });
    });

    // ---- 3. cron last-run (incl. self) ----
    // Outcome-first: health_cron_evidence() returns each job's dispatch ledger
    // AND its last confirmed EXECUTION marker (audit row written by the target
    // function itself). cronProblems() judges freshness on the marker; a stale
    // marker is red even when pg_cron still shows fresh dispatches — catching
    // "dispatch succeeded but the function never ran" (the 09-09 incident).
    await probe("cron", async () => {
      const { data: runs } = await supabase.rpc("health_cron_evidence");
      return cronProblems((runs ?? []) as any[], new Date(nowIso).getTime());
    });

    // ---- 4. sender_health ----
    await probe("sender", async () => {
      const { data: rows } = await supabase
        .from("sender_health")
        .select("profile_id, phase, current_cap, warm_cap, bounces_7d, bounce_rate_7d, complaint_rate_7d, clean_days, last_measured_at");
      const out: HealthProblem[] = [];
      for (const r of (rows ?? []) as any[]) {
        const reasons: string[] = [];
        if (r.phase === "recovery") reasons.push(`phase=${r.phase}`);
        if (Number(r.bounce_rate_7d) > SENDER_BOUNCE_RED) reasons.push(`bounce${(Number(r.bounce_rate_7d) * 100).toFixed(1)}%`);
        if (Number(r.complaint_rate_7d) > SENDER_COMPLAINT_RED) reasons.push(`complaint${(Number(r.complaint_rate_7d) * 100).toFixed(1)}%`);
        if (new Date(nowIso).getTime() - new Date(r.last_measured_at).getTime() > SENDER_STALE_MS) reasons.push("stale measurement");
        if (reasons.length) {
          out.push({
            key: `sender:${r.profile_id}`,
            title: "Mailbox reputation degraded",
            body: `profile ${r.profile_id} — ${reasons.join(", ")} (cap ${r.current_cap}/${r.warm_cap}, clean ${r.clean_days}d).`,
            userId: r.profile_id,
          });
        }
      }
      return out;
    });

    // ---- 5. ai cost drift (reuse cost-sweep's re-sum) ----
    await probe("cost", async () => {
      const { data: states } = await supabase
        .from("ai_cost_state")
        .select("profile_id, window_date, window_month, used_daily_usd, used_monthly_usd");
      const rows = states as any[] ?? [];
      const sumsByProfile: Record<string, { daily: number; monthly: number }> = {};
      await Promise.all(
        rows.map(async (s) => {
          const [dayRes, monthRes] = await Promise.all([
            supabase
              .from("ai_spend_ledger")
              .select("est_cost_usd")
              .eq("user_id", s.profile_id)
              .gte("ts", `${s.window_date}T00:00:00Z`),
            supabase
              .from("ai_spend_ledger")
              .select("est_cost_usd")
              .eq("user_id", s.profile_id)
              .gte("ts", `${s.window_month}-01T00:00:00Z`),
          ]);
          sumsByProfile[s.profile_id] = {
            daily: (dayRes.data as any[] ?? []).reduce((a, r) => a + Number(r.est_cost_usd), 0),
            monthly: (monthRes.data as any[] ?? []).reduce((a, r) => a + Number(r.est_cost_usd), 0),
          };
        }),
      );
      return driftProblems(rows, sumsByProfile);
    });

    // ---- dedup / cooldown ----
    const { data: stateRows } = await supabase.from("health_state").select("check_key, active_since, last_alerted_at, last_seen_at, resolved_at, escalated_at, alert_count");
    const existing = Object.fromEntries(
      (stateRows as any[] ?? []).map((r) => [r.check_key, r as HealthState]),
    );

    const { decisions, resolveKeys } = evaluateHealth(problems, existing, nowIso, ESCALATION_MS);

    for (const d of decisions) {
      if (!d.alert) continue;
      const userId = d.problem.userId ?? systemOwner ?? null;
      if (!userId) continue;
      const body = alertBody(d.problem, d.state.alert_count);
      const title = alertTitle(d.problem, d.alert);
      const { error } = await supabase.from("owner_alerts").insert({
        user_id: userId,
        kind: "system",
        title,
        body,
        priority: "high",
      });
      if (error) throw error;
      alertCounts[d.problem.key] = (alertCounts[d.problem.key] ?? 0) + 1;
    }

    for (const d of decisions) {
      const s = d.state;
      await supabase.from("health_state").upsert(
        {
          check_key: s.check_key,
          active_since: s.active_since,
          last_alerted_at: s.last_alerted_at,
          last_seen_at: s.last_seen_at,
          resolved_at: s.resolved_at,
          escalated_at: s.escalated_at,
          alert_count: s.alert_count,
        },
        { onConflict: "check_key" },
      );
    }
    if (resolveKeys.length) {
      await supabase
        .from("health_state")
        .update({ resolved_at: nowIso })
        .in("check_key", resolveKeys)
        .is("resolved_at", null);
    }

    // ---- liveness ping (dead-man's switch) ----
    const pingOk = await pingDeadMan(pingUrl, false);

    await insertAudit(supabase as any, {
      user_id: null,
      event: "health.run",
      payload: {
        run_at: nowIso,
        problems: problems.map((p) => p.key),
        alerts: alertCounts,
        resolved: resolveKeys,
        ping_ok: pingOk,
      },
    });

    return json({ ok: true, problems: problems.map((p) => p.key), alerts: alertCounts, resolved: resolveKeys });
  } catch (err) {
    // Own failure mode: make it LOUD, not quiet.
    const msg = err instanceof Error ? err.message : String(err);
    try {
      if (systemOwner) {
        await supabase.from("owner_alerts").insert({
          user_id: systemOwner,
          kind: "system",
          title: "Health-check crashed",
          body: `${msg}`,
          priority: "high",
        });
      }
    } catch {
      /* best effort */
    }
    await pingDeadMan(pingUrl, true);
    // Rethrow so pg_cron marks this run 'failed' in job_run_details.
    throw err;
  }
});