// scripts/.stage4/stubs/serve.ts
function serve(_handler) {
}

// scripts/.stage4/stubs/supabase-js.ts
function createClient(..._args) {
  throw new Error("createClient must not be called in Stage-4 fold tests");
}

// scripts/.stage4/stubs/audit.ts
async function insertAudit(_admin, _opts) {
}

// scripts/.stage4/stubs/osm.ts
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
var here = path.dirname(fileURLToPath(import.meta.url));
var osmPath = path.resolve(here, "../../supabase/functions/_shared/osm.ts");
var src = fs.readFileSync(osmPath, "utf8");
var seg = src.slice(src.indexOf("export const GDPR_COUNTRY_ISOS"));
var m = seg.match(/new Set\(\[([\s\S]*?)\]\)/);
if (!m) throw new Error("GDPR_COUNTRY_ISOS block not found in osm.ts");
var inner = m[1].replace(/^\s*\/\/.*$/gm, "").replace(/,\s*$/, "").trim();
var isos = JSON.parse(`[${inner}]`);
if (!Array.isArray(isos) || isos.length < 30) throw new Error("unexpected GDPR set contents");
var GDPR_COUNTRY_ISOS = new Set(isos);

// supabase/functions/learning-loop/index.ts
var MIN_SAMPLE = 25;
var MIN_DELTA = 0.03;
var MIN_SAMPLE_AGG = 30;
var MIN_PUBLISH_CELL = 5;
var LEAD_SCORE_WINDOW_DAYS = 30;
var CAMPAIGN_WINDOW_DAYS = 60;
var STRATEGY_WINDOW_DAYS = 7;
var LEARNING_HOUR_UTC = 2;
var SCORE_VERSION = 1;
var MODEL = "learning-loop/v1";
var TEST_GATES = { MIN_SAMPLE, MIN_DELTA, MIN_SAMPLE_AGG, MIN_PUBLISH_CELL };
var now = () => (/* @__PURE__ */ new Date()).toISOString();
var daysAgo = (n) => new Date(Date.now() - n * 864e5).toISOString();
var clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
async function fetchAll(make, chunk = 1e3) {
  const out = [];
  let start = 0;
  for (; ; ) {
    const { data, error } = await make().range(start, start + chunk - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < chunk) break;
    start += chunk;
  }
  return out;
}
function scoreLead(replies, aiTurns, opens, daysSinceActivity, intent) {
  const replyEng = clamp(replies / 3, 0, 1);
  const aiEng = clamp(aiTurns / 4, 0, 1);
  const open = clamp(opens / 2, 0, 1);
  const recency = clamp(1 - daysSinceActivity / LEAD_SCORE_WINDOW_DAYS, 0, 1);
  const score = Math.round((0.3 * recency + 0.35 * replyEng + 0.15 * aiEng + 0.1 * open + 0.1 * intent) * 1e3) / 1e3;
  const tier = score >= 0.55 ? "A" : score >= 0.35 ? "B" : score >= 0.15 ? "C" : "D";
  return { score, tier };
}
async function foldLeadScores(db) {
  const since = daysAgo(LEAD_SCORE_WINDOW_DAYS);
  const [emails, classifications, bounces] = await Promise.all([
    fetchAll(() => db.from("emails_sent").select(
      "lead_id, replied, opened, ai_turns, sent_at, last_lead_msg_at"
    ).not("lead_id", "is", null).gte("sent_at", since)),
    fetchAll(() => db.from("ai_classifications").select(
      "lead_id, interested, booking_intent, created_at"
    ).gte("created_at", since)),
    fetchAll(() => db.from("audit_events").select(
      "lead_id"
    ).eq("event", "email.bounced").not("lead_id", "is", null).gte("created_at", since))
  ]);
  const bounced = new Set((bounces ?? []).map((b) => b.lead_id));
  const intentByLead = /* @__PURE__ */ new Map();
  for (const c of classifications ?? []) {
    if (!c.lead_id) continue;
    const v = c.booking_intent ? 1 : c.interested ? 0.5 : 0;
    intentByLead.set(c.lead_id, Math.max(intentByLead.get(c.lead_id) ?? 0, v));
  }
  const rows = /* @__PURE__ */ new Map();
  for (const e of emails ?? []) {
    const cur = rows.get(e.lead_id) ?? { lead_id: e.lead_id, replies: 0, opens: 0, ai_turns: 0, activity: new Date(e.sent_at).getTime() };
    if (e.replied) cur.replies++;
    if (e.opened) cur.opens++;
    cur.ai_turns = Math.max(cur.ai_turns, Number(e.ai_turns) || 0);
    const recent = e.last_lead_msg_at ? new Date(e.last_lead_msg_at).getTime() : new Date(e.sent_at).getTime();
    cur.activity = Math.max(cur.activity, recent);
    rows.set(e.lead_id, cur);
  }
  const scored = [];
  for (const r of rows.values()) {
    const daysSince = clamp((Date.now() - r.activity) / 864e5, 0, LEAD_SCORE_WINDOW_DAYS);
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
        bounced: bounced.has(r.lead_id)
      },
      computed_at: now(),
      expires_at: new Date(Date.now() + 864e5).toISOString()
    });
  }
  for (let i = 0; i < scored.length; i += 100) {
    const { error } = await db.from("lead_score").upsert(scored.slice(i, i + 100), { onConflict: "lead_id" });
    if (error) throw new Error(`lead_score upsert: ${error.message}`);
  }
  return scored.length;
}
function foldCampaigns(campaigns, meetings, bounces) {
  const folded = /* @__PURE__ */ new Map();
  for (const [cid, emails] of campaigns) {
    const variants = /* @__PURE__ */ new Map();
    for (const e of emails) {
      const key = e.variant ? `v:${e.variant}` : e.subject ? `s:${e.subject}` : "default";
      const v = variants.get(key) ?? { key, sent: 0, replied: 0, opened: 0 };
      v.sent++;
      if (e.replied) v.replied++;
      if (e.opened) v.opened++;
      variants.set(key, v);
    }
    for (const v of variants.values()) {
      v.reply_rate = v.sent ? Math.round(v.replied / v.sent * 1e4) / 1e4 : 0;
      v.open_rate = v.sent ? Math.round(v.opened / v.sent * 1e4) / 1e4 : 0;
      v.meets = meetings.get(cid)?.size ?? 0;
      v.bounces = bounces.get(cid) ?? 0;
    }
    const list = [...variants.values()];
    const gateMet = list.length >= 2 && list.every((v) => v.sent >= MIN_SAMPLE);
    let winner = null;
    if (gateMet) {
      const sorted = [...list].sort((a, b) => b.reply_rate - a.reply_rate);
      const delta = sorted[0].reply_rate - sorted[1].reply_rate;
      if (sorted[0].reply_rate > 0 && delta >= MIN_DELTA) {
        winner = {
          key: sorted[0].key,
          sent: sorted[0].sent,
          replied: sorted[0].replied,
          reply_rate: sorted[0].reply_rate,
          delta: Math.round(delta * 1e4) / 1e4
        };
      }
    }
    folded.set(cid, {
      variants: Object.fromEntries(list.map((v) => [v.key, v])),
      winner_variant: winner,
      min_sample: { required: MIN_SAMPLE, note: "A/B winner declared only when every variant has >= required sent outcomes and the reply-rate lead is >= min_delta ahead." },
      min_delta: MIN_DELTA,
      last_folded_at: now(),
      // Stage 5 wires consumer hints behind agent_config toggles.
      next_sequence_hint: null,
      reply_style_hint: null
    });
  }
  return folded;
}
async function foldCampaignLearning(db) {
  const since = daysAgo(CAMPAIGN_WINDOW_DAYS);
  const [emails, meetings, bounces] = await Promise.all([
    fetchAll(() => db.from("emails_sent").select(
      "campaign_id, lead_id, variant, subject, replied, opened, ai_paused"
    ).not("campaign_id", "is", null).gte("sent_at", since)),
    fetchAll(() => db.from("meetings").select("campaign_id, lead_id").gte("booked_at", since)),
    fetchAll(() => db.from("audit_events").select("campaign_id").eq("event", "email.bounced").gte("created_at", since))
  ]);
  const campaigns = /* @__PURE__ */ new Map();
  for (const e of emails ?? []) {
    const list = campaigns.get(e.campaign_id) ?? [];
    list.push(e);
    campaigns.set(e.campaign_id, list);
  }
  const meetingsByCid = /* @__PURE__ */ new Map();
  for (const m2 of meetings ?? []) {
    if (!m2.campaign_id) continue;
    const s = meetingsByCid.get(m2.campaign_id) ?? /* @__PURE__ */ new Set();
    if (m2.lead_id) s.add(m2.lead_id);
    meetingsByCid.set(m2.campaign_id, s);
  }
  const bouncesByCid = /* @__PURE__ */ new Map();
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
      triggered_by: "learning-loop"
    }, { onConflict: "campaign_id" });
    if (error) throw new Error(`campaign_learning upsert ${cid}: ${error.message}`);
    n++;
  }
  return n;
}
function countryStatus(raw) {
  const iso = (raw ?? "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(iso)) return "unknown";
  return GDPR_COUNTRY_ISOS.has(iso) ? "gdpr" : "ok";
}
function isoWeekStart(d = /* @__PURE__ */ new Date()) {
  const s = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  s.setUTCDate(s.getUTCDate() - (s.getUTCDay() + 6) % 7);
  s.setUTCHours(0, 0, 0, 0);
  return s;
}
async function foldStrategyState(db) {
  const since = daysAgo(STRATEGY_WINDOW_DAYS);
  const [emails, leads, meetings] = await Promise.all([
    fetchAll(() => db.from("emails_sent").select("lead_id, replied").not("lead_id", "is", null).gte("sent_at", since)),
    fetchAll(() => db.from("leads").select("id, category, country")),
    fetchAll(() => db.from("meetings").select("lead_id").not("lead_id", "is", null).gte("booked_at", since))
  ]);
  const leadById = new Map((leads ?? []).map((l) => [l.id, l]));
  const met = new Set((meetings ?? []).map((m2) => m2.lead_id));
  let excluded = 0;
  const buckets = /* @__PURE__ */ new Map();
  let overallSent = 0;
  let overallReplied = 0;
  let overallMeets = 0;
  for (const e of emails ?? []) {
    const lead = leadById.get(e.lead_id);
    if (!lead) continue;
    const st = countryStatus(lead.country ?? null);
    if (st !== "ok") {
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
    if (b) {
      b.meets++;
      overallMeets++;
    }
  }
  const overallReply = overallSent ? overallReplied / overallSent : 0;
  const overallMeet = overallSent ? overallMeets / overallSent : 0;
  const windowStart = isoWeekStart();
  const windowEnd = now();
  let written = 0;
  for (const [bucket, b] of buckets) {
    if (b.sent < MIN_SAMPLE_AGG || b.sent < MIN_PUBLISH_CELL) continue;
    const deltaReply = Math.round((b.replied / b.sent - overallReply) * 1e4) / 1e4;
    const deltaMeet = Math.round((b.meets / b.sent - overallMeet) * 1e4) / 1e4;
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
      updated_at: now()
    }, { onConflict: "feature_bucket,model_version,window_start" });
    if (error) throw new Error(`strategy_state upsert ${bucket}: ${error.message}`);
    written++;
  }
  return { buckets: written, excluded };
}
serve(async (req) => {
  const secret = Deno.env.get("CRON_SECRET");
  if (!secret || req.headers.get("x-cron-secret") !== secret) {
    return new Response("Unauthorized", { status: 401 });
  }
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!serviceKey) return new Response("Service role key missing", { status: 500 });
  const db = createClient(Deno.env.get("SUPABASE_URL") ?? "", serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  let body = {};
  try {
    body = await req.json();
  } catch (_e) {
  }
  const hour = (/* @__PURE__ */ new Date()).getUTCHours();
  const force = body.force === true;
  const learningHour = hour === LEARNING_HOUR_UTC || force;
  const weekly = (/* @__PURE__ */ new Date()).getUTCDay() === 0 || force;
  const counts = { leads_scored: 0, campaigns_folded: 0, strategy_buckets: 0, gdpr_excluded: 0 };
  const errors = {};
  try {
    counts.leads_scored = await foldLeadScores(db);
  } catch (e) {
    errors.lead = e.message;
  }
  if (learningHour) {
    try {
      counts.campaigns_folded = await foldCampaignLearning(db);
    } catch (e) {
      errors.campaign = e.message;
    }
  }
  if (learningHour && weekly) {
    try {
      const r = await foldStrategyState(db);
      counts.strategy_buckets = r.buckets;
      counts.gdpr_excluded = r.excluded;
    } catch (e) {
      errors.strategy = e.message;
    }
  }
  await insertAudit(db, {
    event: "learning.fold",
    model_version: MODEL,
    payload: {
      detected_at: now(),
      hour,
      force,
      learning_hour: learningHour,
      weekly,
      ...counts,
      errors: Object.keys(errors).length ? errors : void 0
    }
  });
  return new Response(JSON.stringify({ ok: true, ...counts, errors }), {
    headers: { "Content-Type": "application/json" }
  });
});
export {
  TEST_GATES,
  countryStatus,
  foldCampaignLearning,
  foldCampaigns,
  foldLeadScores,
  foldStrategyState,
  isoWeekStart,
  scoreLead
};
