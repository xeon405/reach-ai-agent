// Stage 4 learning-loop — the SINGLE writer for the intelligence layer.
//   lead_score         : every run (hourly)
//   campaign_learning  : the designated UTC hour (02:00) — nightly fold
//   strategy_state     : same hour, Sunday UTC only — weekly fold
// Principles (design §0, §3):
//   * Advisory, never controller. We only create state; consumers decide.
//   * Attribution before learning: outcomes carry decision_id/model_version
//     once Stage 5/6 wiring lands; until then scores/hints are methodology-v1
//     aggregates and are marked model_version explicitly, never implied.
//   * Privacy moat: strategy_state NEVER holds user/lead/campaign identity.
//     EU/UK outcomes (GDPR_COUNTRY_ISOS) and unprovable-non-EEA countries are
//     dropped before any aggregate; buckets must pass BOTH the statistical
//     noise floor (MIN_SAMPLE_AGG) and the de-identification floor
//     (MIN_PUBLISH_CELL) or they are not written.
//   * Minimum-sample gate: an A/B variant is declared winner only when every
//     variant has >= MIN_SAMPLE sent outcomes and the reply-rate lead is
//     >= MIN_DELTA ahead of the runner-up. Never before that.
//   * Fail-safe: this function only ever upserts into the three intelligence
//     tables; a broken write degrades to "no row => default" downstream.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { insertAudit } from "../_shared/audit.ts";
import { GDPR_COUNTRY_ISOS } from "../_shared/osm.ts";

// ---- gates / methodology (v1) ---------------------------------------------
const MIN_SAMPLE = 25;          // per-variant sent outcomes BEFORE any winner may be declared
const MIN_DELTA = 0.03;         // reply-rate lead (winner) vs runner-up required to declare
const MIN_SAMPLE_AGG = 30;      // statistical noise floor: minimum events before an aggregate is interpretable
const MIN_PUBLISH_CELL = 5;     // de-identification floor: never publish a count cell below this bound
const LEAD_SCORE_WINDOW_DAYS = 30;
const CAMPAIGN_WINDOW_DAYS = 60;
const STRATEGY_WINDOW_DAYS = 7;
const LEARNING_HOUR_UTC = 2;    // campaign_learning nightly fold hour
const SCORE_VERSION = 1;
const MODEL = "learning-loop/v1";

// Opener-angle gates. Deliberately looser than the A/B MIN_SAMPLE (25) because a
// campaign spreads its sends across 7 angles, so 25-per-angle would mean ~175
// sends before any learning — and stricter than "whoever replied once", because
// a single reply is noise. 15 outcomes per angle plus a 5-point lift over the
// campaign's own average is the point where acting on it beats the hash.
const OPENER_MIN_SENT = 15;
const OPENER_MIN_LIFT = 0.05;

// Exported for the synthetic-data harness (scripts/stage4-simulation.mjs) so
// the tests assert against the exact constants the fold logic runs with.
export const TEST_GATES = { MIN_SAMPLE, MIN_DELTA, MIN_SAMPLE_AGG, MIN_PUBLISH_CELL, OPENER_MIN_SENT, OPENER_MIN_LIFT };

const now = () => new Date().toISOString();
const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString();
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

// Supabase builders are consumed per-execution; pass a fresh-query factory so
// paging .range() re-executes a correctly-offset query every iteration.
async function fetchAll<T>(make: () => any, chunk = 1000): Promise<T[]> {
  const out: T[] = [];
  let start = 0;
  for (;;) {
    const { data, error } = await make().range(start, start + chunk - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < chunk) break;
    start += chunk;
  }
  return out;
}

// ---- lead_score (design §2.2) ----------------------------------------------
// Deterministic, feature-based, methodology v1. No ML, no LLM. Only leads with
// >=1 send/call-to-action in the window get a row; absent row => "no opinion".

export function scoreLead(replies: number, aiTurns: number, opens: number,
  daysSinceActivity: number, intent: number): { score: number; tier: string } {
  const replyEng = clamp(replies / 3, 0, 1);
  const aiEng = clamp(aiTurns / 4, 0, 1);
  const open = clamp(opens / 2, 0, 1);
  const recency = clamp(1 - daysSinceActivity / LEAD_SCORE_WINDOW_DAYS, 0, 1);
  const score = Math.round((0.30 * recency + 0.35 * replyEng + 0.15 * aiEng + 0.10 * open + 0.10 * intent) * 1000) / 1000;
  const tier = score >= 0.55 ? "A" : score >= 0.35 ? "B" : score >= 0.15 ? "C" : "D";
  return { score, tier };
}

export async function foldLeadScores(db: any): Promise<number> {
  const since = daysAgo(LEAD_SCORE_WINDOW_DAYS);
  const [emails, classifications, bounces] = await Promise.all([
    fetchAll<any>(() => db.from("emails_sent").select(
      "lead_id, replied, opened, ai_turns, sent_at, last_lead_msg_at",
    ).not("lead_id", "is", null).gte("sent_at", since)),
    fetchAll<any>(() => db.from("ai_classifications").select(
      "lead_id, interested, booking_intent, created_at",
    ).gte("created_at", since)),
    fetchAll<any>(() => db.from("audit_events").select(
      "lead_id",
    ).eq("event", "email.bounced").not("lead_id", "is", null).gte("created_at", since)),
  ]);

  const bounced = new Set((bounces ?? []).map((b: any) => b.lead_id));
  const intentByLead = new Map<string, number>();
  for (const c of classifications ?? []) {
    if (!c.lead_id) continue;
    const v = c.booking_intent ? 1 : c.interested ? 0.5 : 0;
    intentByLead.set(c.lead_id, Math.max(intentByLead.get(c.lead_id) ?? 0, v));
  }

  const rows = new Map<string, any>();
  for (const e of emails ?? []) {
    const cur = rows.get(e.lead_id) ?? { lead_id: e.lead_id, replies: 0, opens: 0, ai_turns: 0, activity: new Date(e.sent_at).getTime() };
    if (e.replied) cur.replies++;
    if (e.opened) cur.opens++;
    cur.ai_turns = Math.max(cur.ai_turns, Number(e.ai_turns) || 0);
    const recent = e.last_lead_msg_at ? new Date(e.last_lead_msg_at).getTime() : new Date(e.sent_at).getTime();
    cur.activity = Math.max(cur.activity, recent);
    rows.set(e.lead_id, cur);
  }

  const scored: any[] = [];
  for (const r of rows.values()) {
    const daysSince = clamp((Date.now() - r.activity) / 86400000, 0, LEAD_SCORE_WINDOW_DAYS);
    const intent = intentByLead.get(r.lead_id) ?? 0;
    const { score, tier } = scoreLead(r.replies, r.ai_turns, r.opens, daysSince, intent);
    scored.push({
      lead_id: r.lead_id,
      score,
      tier,
      score_version: SCORE_VERSION,
      features: {
        replies_received: r.replies,
        ai_turns: r.ai_turns,
        opens: r.opens,
        days_since_last_activity: Math.round(daysSince),
        intent,
        bounced: bounced.has(r.lead_id),
      },
      computed_at: now(),
      expires_at: new Date(Date.now() + 86400000).toISOString(),
    });
  }

  for (let i = 0; i < scored.length; i += 100) {
    const { error } = await db.from("lead_score").upsert(scored.slice(i, i + 100), { onConflict: "lead_id" });
    if (error) throw new Error(`lead_score upsert: ${error.message}`);
  }
  return scored.length;
}

// ---- campaign_learning (design §2.3) ---------------------------------------
// Winners are declared ONLY past MIN_SAMPLE per variant + MIN_DELTA margin.
export function foldCampaigns(campaigns: Map<string, any>, meetings: Map<string, Set<string>>, bounces: Map<string, number>) {
  const folded = new Map<string, any>();
  for (const [cid, emails] of campaigns) {
    const variants = new Map<string, any>();
    for (const e of emails) {
      const key = e.variant ? `v:${e.variant}` : e.subject ? `s:${e.subject}` : "default";
      const v = variants.get(key) ?? { key, sent: 0, replied: 0, opened: 0 };
      v.sent++;
      if (e.replied) v.replied++;
      if (e.opened) v.opened++;
      variants.set(key, v);
    }
    for (const v of variants.values()) {
      v.reply_rate = v.sent ? Math.round((v.replied / v.sent) * 10000) / 10000 : 0;
      v.open_rate = v.sent ? Math.round((v.opened / v.sent) * 10000) / 10000 : 0;
      v.meets = meetings.get(cid)?.size ?? 0;
      v.bounces = bounces.get(cid) ?? 0;
    }

    const list = [...variants.values()];
    const gateMet = list.length >= 2 && list.every((v) => v.sent >= MIN_SAMPLE);
    let winner: any = null;
    if (gateMet) {
      const sorted = [...list].sort((a, b) => b.reply_rate - a.reply_rate);
      const delta = sorted[0].reply_rate - sorted[1].reply_rate;
      if (sorted[0].reply_rate > 0 && delta >= MIN_DELTA) {
        winner = {
          key: sorted[0].key,
          sent: sorted[0].sent,
          replied: sorted[0].replied,
          reply_rate: sorted[0].reply_rate,
          delta: Math.round(delta * 10000) / 10000,
        };
      }
    }

    // ---- opener angle (the one signal we were throwing away) ---------------
    // Every send carries the attention angle the model was told to open with.
    // Two conditions must hold before we act on it:
    //   * each angle has OPENER_MIN_SENT outcomes (small samples lie), and
    //   * the leader beats this campaign's own average by OPENER_MIN_LIFT
    //     (a win against yourself is the only comparison that isn't confounded
    //     by the audience, the offer, and the season).
    // Below either gate we publish the counts but NO hint, so production keeps
    // the unchanged hash-selected baseline.
    const openerRows = new Map<string, { key: string; sent: number; replied: number }>();
    let openerSent = 0;
    let openerReplied = 0;
    for (const e of emails) {
      const k = typeof e.opener_key === "string" ? e.opener_key.trim() : "";
      if (!k) continue;
      const o = openerRows.get(k) ?? { key: k, sent: 0, replied: 0 };
      o.sent++;
      openerSent++;
      if (e.replied) { o.replied++; openerReplied++; }
      openerRows.set(k, o);
    }
    const openerList = [...openerRows.values()]
      .map((o) => ({
        ...o,
        reply_rate: o.sent ? Math.round((o.replied / o.sent) * 10000) / 10000 : 0,
      }))
      .sort((a, b) => b.reply_rate - a.reply_rate || b.sent - a.sent);
    const openerAvg = openerSent ? openerReplied / openerSent : 0;
    const qualifiedOpeners = openerList.filter((o) => o.sent >= OPENER_MIN_SENT);
    const openerLeader = qualifiedOpeners[0] ?? null;
    const openerWinner =
      openerLeader && qualifiedOpeners.length >= 2 && openerLeader.reply_rate >= openerAvg + OPENER_MIN_LIFT
        ? openerLeader
        : null;

    const pct = (x: number) => `${Math.round(x * 1000) / 10}%`;
    const openerHint = openerWinner
      ? `The "${openerWinner.key}" opening angle replies best for this audience (${openerWinner.replied} of ${openerWinner.sent} sends, ${pct(openerWinner.reply_rate)}, versus ${pct(openerAvg)} across the campaign). Lead with that angle.`
      : null;

    folded.set(cid, {
      variants: Object.fromEntries(list.map((v) => [v.key, v])),
      winner_variant: winner,
      min_sample: { required: MIN_SAMPLE, note: "A/B winner declared only when every variant has >= required sent outcomes and the reply-rate lead is >= min_delta ahead." },
      min_delta: MIN_DELTA,
      last_folded_at: now(),
      // Opener learning — LIVE. This is the one producer the fold ships today,
      // because the signal is recorded per email and the gate compares the
      // campaign against itself. Consumed by send-worker (getOpenerHint) for
      // first emails in this campaign only.
      opener_hint: openerHint,
      opener_winner: openerWinner?.key ?? null,
      opener_sample: {
        min_sent: OPENER_MIN_SENT,
        min_lift: OPENER_MIN_LIFT,
        campaign_reply_rate: Math.round(openerAvg * 10000) / 10000,
        angles: Object.fromEntries(openerList.map((o) => [o.key, o])),
      },
      // Still DEFERRED (audit-2026-09-12): next_sequence_hint / reply_style_hint
      // are reserved keys. Their consumers exist and are gated behind
      // agent_config toggles, but no producer ships yet, so all reply and
      // follow-up prompts remain the unlearned baseline on purpose.
      next_sequence_hint: null,
      reply_style_hint: null,
    });
  }
  return folded;
}

export async function foldCampaignLearning(db: any): Promise<number> {
  const since = daysAgo(CAMPAIGN_WINDOW_DAYS);
  const [emails, meetings, bounces] = await Promise.all([
    fetchAll<any>(() => db.from("emails_sent").select(
      "campaign_id, lead_id, variant, subject, replied, opened, ai_paused, opener_key",
    ).not("campaign_id", "is", null).gte("sent_at", since)),
    fetchAll<any>(() => db.from("meetings").select("campaign_id, lead_id").gte("booked_at", since)),
    fetchAll<any>(() => db.from("audit_events").select("campaign_id").eq("event", "email.bounced").gte("created_at", since)),
  ]);

  const campaigns = new Map<string, any[]>();
  for (const e of emails ?? []) {
    const list = campaigns.get(e.campaign_id) ?? [];
    list.push(e);
    campaigns.set(e.campaign_id, list);
  }
  const meetingsByCid = new Map<string, Set<string>>();
  for (const m of meetings ?? []) {
    if (!m.campaign_id) continue;
    const s = meetingsByCid.get(m.campaign_id) ?? new Set<string>();
    if (m.lead_id) s.add(m.lead_id);
    meetingsByCid.set(m.campaign_id, s);
  }
  const bouncesByCid = new Map<string, number>();
  for (const b of bounces ?? []) {
    if (!b.campaign_id) continue;
    bouncesByCid.set(b.campaign_id, (bouncesByCid.get(b.campaign_id) ?? 0) + 1);
  }

  const folded = foldCampaigns(campaigns, meetingsByCid, bouncesByCid);
  let n = 0;
  for (const [cid, state] of folded) {
    const { data: prev } = await db.from("campaign_learning").select("version").eq("campaign_id", cid).maybeSingle();
    const { error } = await db.from("campaign_learning").upsert({
      campaign_id: cid,
      state,
      version: (prev?.version ?? 0) + 1,
      updated_at: now(),
      triggered_by: "learning-loop",
    }, { onConflict: "campaign_id" });
    if (error) throw new Error(`campaign_learning upsert ${cid}: ${error.message}`);
    n++;
  }
  return n;
}

// ---- strategy_state (design §2.4) — anonymized global aggregates -----------
// EU/UK-outcome exclusion is REQUIRED (open question settled). Null/unknown
// country is excluded conservatively too (cannot prove non-EEA).

export function countryStatus(raw: string | null): "gdpr" | "unknown" | "ok" {
  const iso = (raw ?? "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(iso)) return "unknown";
  return GDPR_COUNTRY_ISOS.has(iso) ? "gdpr" : "ok";
}

export function isoWeekStart(d = new Date()): Date {
  const s = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  s.setUTCDate(s.getUTCDate() - ((s.getUTCDay() + 6) % 7)); // Monday
  s.setUTCHours(0, 0, 0, 0);
  return s;
}

export async function foldStrategyState(db: any): Promise<{ buckets: number; excluded: number }> {
  const since = daysAgo(STRATEGY_WINDOW_DAYS);
  const [emails, leads, meetings] = await Promise.all([
    fetchAll<any>(() => db.from("emails_sent").select("lead_id, replied").not("lead_id", "is", null).gte("sent_at", since)),
    fetchAll<any>(() => db.from("leads").select("id, category, country")),
    fetchAll<any>(() => db.from("meetings").select("lead_id").not("lead_id", "is", null).gte("booked_at", since)),
  ]);

  const leadById = new Map((leads ?? []).map((l: any) => [l.id, l]));
  const met = new Set((meetings ?? []).map((m: any) => m.lead_id));

  let excluded = 0;
  const buckets = new Map<string, { sent: number; replied: number; meets: number }>();
  let overallSent = 0;
  let overallReplied = 0;
  let overallMeets = 0;

  for (const e of emails ?? []) {
    const lead = leadById.get(e.lead_id);
    if (!lead) continue;
    const st = countryStatus(lead.country ?? null);
    if (st !== "ok") { // gdpr OR unknown => excluded (conservative)
      excluded++;
      continue;
    }
    const bucket = lead.category ? `c:${String(lead.category).split(":")[0].trim().toLowerCase()}` : "c:unknown";
    const b = buckets.get(bucket) ?? { sent: 0, replied: 0, meets: 0 };
    b.sent++;
    if (e.replied) b.replied++;
    buckets.set(bucket, b);
    overallSent++;
    if (e.replied) overallReplied++;
  }
  for (const lid of met) {
    const lead = leadById.get(lid);
    if (!lead) continue;
    if (countryStatus(lead.country ?? null) !== "ok") continue;
    const bucket = lead.category ? `c:${String(lead.category).split(":")[0].trim().toLowerCase()}` : "c:unknown";
    const b = buckets.get(bucket);
    if (b) { b.meets++; overallMeets++; } // same population as the email-denominator buckets
  }

  const overallReply = overallSent ? overallReplied / overallSent : 0;
  const overallMeet = overallSent ? overallMeets / overallSent : 0;
  const windowStart = isoWeekStart();
  const windowEnd = now();

  let written = 0;
  for (const [bucket, b] of buckets) {
    if (b.sent < MIN_SAMPLE_AGG || b.sent < MIN_PUBLISH_CELL) continue; // noise floor AND de-identification floor
    const deltaReply = Math.round((b.replied / b.sent - overallReply) * 10000) / 10000;
    const deltaMeet = Math.round((b.meets / b.sent - overallMeet) * 10000) / 10000;
    const { error } = await db.from("strategy_state").upsert({
      feature_bucket: bucket,
      model_version: "agg/v1",
      window_start: windowStart.toISOString(),
      window_end: windowEnd,
      deltas: { delta_reply: deltaReply, delta_meet: deltaMeet },
      sent: b.sent,
      replied: b.replied,
      meets: b.meets,
      excluded_gdpr: excluded,
      updated_at: now(),
    }, { onConflict: "feature_bucket,model_version,window_start" });
    if (error) throw new Error(`strategy_state upsert ${bucket}: ${error.message}`);
    written++;
  }
  return { buckets: written, excluded };
}

// ---------------------------------------------------------------------------
serve(async (req) => {
  const secret = Deno.env.get("CRON_SECRET");
  if (!secret || req.headers.get("x-cron-secret") !== secret) {
    return new Response("Unauthorized", { status: 401 });
  }
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!serviceKey) return new Response("Service role key missing", { status: 500 });
  const db = createClient(Deno.env.get("SUPABASE_URL") ?? "", serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let body: { force?: boolean } = {};
  try { body = await req.json(); } catch (_e) { /* no body */ }

  const hour = new Date().getUTCHours();
  const force = body.force === true;
  const learningHour = hour === LEARNING_HOUR_UTC || force;
  const weekly = new Date().getUTCDay() === 0 || force;

  const counts: Record<string, number> = { leads_scored: 0, campaigns_folded: 0, strategy_buckets: 0, gdpr_excluded: 0 };
  const errors: Record<string, string> = {};

  // 1) lead_score — every run.
  try { counts.leads_scored = await foldLeadScores(db); } catch (e: any) { errors.lead = e.message; }

  // 2) campaign_learning — nightly (02:00 UTC) or forced.
  if (learningHour) {
    try { counts.campaigns_folded = await foldCampaignLearning(db); } catch (e: any) { errors.campaign = e.message; }
  }

  // 3) strategy_state — weekly (Sunday 02:00 UTC) or forced.
  if (learningHour && weekly) {
    try { const r = await foldStrategyState(db); counts.strategy_buckets = r.buckets; counts.gdpr_excluded = r.excluded; } catch (e: any) { errors.strategy = e.message; }
  }

  await insertAudit(db, {
    event: "learning.fold",
    model_version: MODEL,
    payload: {
      detected_at: now(), hour, force, learning_hour: learningHour, weekly,
      ...counts,
      errors: Object.keys(errors).length ? errors : undefined,
    },
  });

  return new Response(JSON.stringify({ ok: true, ...counts, errors }), {
    headers: { "Content-Type": "application/json" },
  });
});