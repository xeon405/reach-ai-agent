// 0a nightly reputation report. Sole writer of sender_health.
// Deterministic brakes — no AI, no product-team judgment in the hot path:
//   bounce_rate_7d  > 3%  -> recovery, cap halved (floor 5)
//   unsub_rate_7d   > 1%  -> recovery, cap floored at 5 (complaint proxy;
//                            one-click unsubscribes are voluntary so the
//                            threshold is far more lenient than raw complaints)
//   healthy         7 days -> cap stairs back toward the warm ramp (+10%/night)
// Missing/zero sends are not a reputation event: rows with no signal just get
// their freshness stamp refreshed so well-behaved mailboxes never go stale.
// Consumers (send-worker) read this table; if the row is missing or stale they
// fall back to the plain warm ramp, so a broken cron can never block or raise.
//
// OBSERVABILITY (Stage 9): cron.job_run_details "succeeded" only proves the
// net.http_post dispatch — NOT that this function ran. Every invocation audits
// its own outcome: health.report.run on success (with per-mailbox errors), or
// health.report.error on a fatal crash. A lost dispatch (request never reaching
// the runtime) still looks like cron success but leaves NO health.report.run
// row and the sender_health freshness stamp stops advancing — the health-check
// staleness tripwire (30h) then raises the alarm loudly. Per-mailbox upserts
// are isolated so one bad profile can no longer abort the whole batch silently.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { insertAudit } from "../_shared/audit.ts";
import { effectivePlan } from "../_shared/effective-plan.ts";
import { warmCap, computeHealthUpdate, measureRates, BRAKES } from "../_shared/sender-health.ts";

const PLAN_LIMITS: Record<string, { dailyEmails: number }> = {
  free: { dailyEmails: 10 },
  starter: { dailyEmails: 50 },
  growth: { dailyEmails: 200 },
  agency: { dailyEmails: 500 },
};

const now = () => new Date().toISOString();
const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString();

serve(async (req) => {
  const secret = Deno.env.get("CRON_SECRET");
  if (!secret || req.headers.get("x-cron-secret") !== secret) {
    return new Response("Unauthorized", { status: 401 });
  }

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!serviceKey) return new Response("Service role key missing", { status: 500 });
  const db = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    serviceKey,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  try {
    const { data: tokens } = await db.from("gmail_tokens").select("profile_id, connected_at");
    const { data: profiles } = await db.from("profiles").select(
      "id, gmail_email, plan, referral_reward_plan, referral_reward_until, created_at, gmail_account_type",
    ).in("id", tokens?.map((t) => t.profile_id) ?? []);
    if (!tokens || !profiles) {
      await insertAudit(db, {
        user_id: null,
        event: "health.report.run",
        payload: { at: now(), mailboxes_measured: 0, note: "no gmail_tokens/profiles" },
      });
      return new Response("No data", { status: 200 });
    }

    const profileById = new Map(profiles.map((p: any) => [p.id, p]));
    let processed = 0;
    const errors: { profile_id: string; error: string }[] = [];

    for (const tok of tokens ?? []) {
      const uid = tok.profile_id;
      try {
        const profile = profileById.get(uid) as Record<string, any> | undefined;
        if (!profile) continue;

        const limits = PLAN_LIMITS[effectivePlan(profile)] ?? PLAN_LIMITS.starter;
        const ceiling = profile.gmail_account_type === "workspace" ? 2000 : 500;
        const anchorMs = tok.connected_at
          ? new Date(tok.connected_at).getTime()
          : new Date(profile.created_at).getTime();
        const daysWarm = Math.max(0, Math.floor((Date.now() - anchorMs) / 86400000));
        const wCap = warmCap(limits.dailyEmails, daysWarm, ceiling);

        const since = daysAgo(7);

        const { count: sends7 } = await db.from("emails_sent")
          .select("id", { count: "exact", head: true })
          .eq("user_id", uid).gte("sent_at", since);
        const { count: bounces7 } = await db.from("audit_events")
          .select("id", { count: "exact", head: true })
          .eq("user_id", uid).eq("event", "email.bounced").gte("created_at", since);
        const { count: unsubs7 } = await db.from("audit_events")
          .select("id", { count: "exact", head: true })
          .eq("user_id", uid).eq("event", "lead.unsubscribed").gte("created_at", since);
        const { count: replies7 } = await db.from("emails_sent")
          .select("id", { count: "exact", head: true })
          .eq("user_id", uid).eq("replied", true).gte("sent_at", since);

        const sends = Number(sends7 ?? 0);
        const bounces = Number(bounces7 ?? 0);
        const unsubs = Number(unsubs7 ?? 0);
        const replies = Number(replies7 ?? 0);

        const prev = await db.from("sender_health")
          .select("current_cap, phase, clean_days")
          .eq("profile_id", uid).maybeSingle();

        if (sends < 5) {
          // Not enough volume for a meaningful ratio — record "no opinion" so the
          // ledger shows a real baseline (a healthy low-volume mailbox gets its
          // ramp cap, which is a no-op for send-worker).
          const rates = measureRates({ sends, bounces, unsubs, replies });
          const base = prev?.data;
          const baseCap = base?.phase === "recovery"
            ? Math.max(BRAKES.CAP_FLOOR, base.current_cap)
            : wCap;
          const basePhase = base?.phase ?? (wCap >= limits.dailyEmails && daysWarm >= 7 ? "steady" : "ramp");
          await db.from("sender_health").upsert({
            profile_id: uid,
            gmail_email: profile.gmail_email ?? null,
            phase: basePhase,
            current_cap: baseCap,
            warm_cap: wCap,
            sends_7d: sends,
            bounces_7d: bounces,
            replies_7d: replies,
            unsubs_7d: unsubs,
            bounce_rate_7d: Math.round(rates.bounce_rate * 10000) / 10000,
            complaint_rate_7d: Math.round(rates.unsub_rate * 10000) / 10000,
            reply_rate_7d: Math.round(rates.reply_rate * 10000) / 10000,
            clean_days: base?.clean_days ?? 0,
            last_measured_at: now(),
            updated_at: now(),
          }, { onConflict: "profile_id" });
          processed++;
          continue;
        }

        const st = computeHealthUpdate({
          prev: prev?.data ?? null,
          metrics: { sends, bounces, unsubs, replies },
          warm: wCap,
          planDaily: limits.dailyEmails,
          daysWarm,
        });

        await db.from("sender_health").upsert({
          profile_id: uid,
          gmail_email: profile.gmail_email ?? null,
          phase: st.phase,
          current_cap: st.current_cap,
          warm_cap: wCap,
          sends_7d: sends,
          bounces_7d: bounces,
          replies_7d: replies,
          unsubs_7d: unsubs,
          bounce_rate_7d: st.bounce_rate_7d,
          complaint_rate_7d: st.complaint_rate_7d,
          reply_rate_7d: st.reply_rate_7d,
          clean_days: st.clean_days,
          last_measured_at: now(),
          updated_at: now(),
        }, { onConflict: "profile_id" });

        if (prev?.data?.phase !== "recovery" && st.phase === "recovery") {
          await insertAudit(db, {
            user_id: uid,
            event: "health.recovery",
            payload: {
              phase: st.phase, current_cap: st.current_cap, warm_cap: wCap,
              bounces_7d: bounces, sends_7d: sends,
              bounce_rate_7d: st.bounce_rate_7d,
              unsubs_7d: unsubs,
              note: "Deterministic reputation brake: daily cap reduced until 7 consecutive clean days.",
            },
          });
        }
        processed++;
      } catch (err) {
        errors.push({ profile_id: uid, error: err instanceof Error ? err.message : String(err) });
      }
    }

    await insertAudit(db, {
      user_id: null,
      event: "health.report.run",
      payload: {
        at: now(),
        mailboxes_measured: processed,
        errors,
      },
    });

    return new Response(JSON.stringify({ ok: true, mailboxes_measured: processed, errors }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    // Never fail silently: leave evidence, then surface a 500 (cron still logs
    // this as a dispatched call, so the health.report.error row is the source
    // of truth that this run actually failed).
    const msg = err instanceof Error ? err.message : String(err);
    try {
      await insertAudit(db, {
        user_id: null,
        event: "health.report.error",
        payload: { at: now(), error: msg, stack: err instanceof Error ? err.stack : undefined },
      });
    } catch {
      /* best-effort only */
    }
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});