// supabase/functions/_shared/intelligence-reads.ts
var LEAD_SCORE_MAX_AGE_MS = 24 * 3600 * 1e3;
var CAMPAIGN_LEARNING_MAX_AGE_MS = 36 * 3600 * 1e3;
async function getKillSwitch(db, key, scope) {
  try {
    const { data } = await db.from("agent_config").select("scope, scope_id, value, enabled").eq("key", key).eq("enabled", true);
    const rows = data ?? [];
    const pick = (s, id) => rows.find((r) => r.scope === s && r.scope_id === id);
    const glob = pick("glob", null);
    const user = scope.userId ? pick("user", scope.userId) : void 0;
    const campaign = scope.campaignId ? pick("campaign", scope.campaignId) : void 0;
    const eff = campaign ?? user ?? glob;
    if (!eff) return false;
    return eff.value === true || eff.value === "true";
  } catch {
    return false;
  }
}
async function getLeadScore(db, opts) {
  const enabled = await getKillSwitch(db, "lead_score.enabled", opts);
  if (!enabled) return null;
  try {
    const { data } = await db.from("lead_score").select("lead_id, score, tier, score_version, computed_at, expires_at, features").eq("lead_id", opts.leadId).maybeSingle();
    if (!data) return null;
    const computed = data.computed_at ? new Date(data.computed_at).getTime() : 0;
    if (computed && Date.now() - computed > LEAD_SCORE_MAX_AGE_MS) return null;
    const expires = data.expires_at ? new Date(data.expires_at).getTime() : 0;
    if (expires && expires < Date.now()) return null;
    return {
      score: Number(data.score) || 0,
      tier: String(data.tier ?? "D"),
      score_version: Number(data.score_version) || 1,
      computed_at: String(data.computed_at ?? ""),
      expires_at: String(data.expires_at ?? ""),
      features: data.features ?? {}
    };
  } catch {
    return null;
  }
}
async function readCampaignLearning(db, campaignId) {
  try {
    const { data } = await db.from("campaign_learning").select("campaign_id, state, version, updated_at").eq("campaign_id", campaignId).maybeSingle();
    if (!data) return null;
    const at = data.updated_at ? new Date(data.updated_at).getTime() : 0;
    if (!at || Date.now() - at > CAMPAIGN_LEARNING_MAX_AGE_MS) return null;
    return data;
  } catch {
    return null;
  }
}
function stringHint(value) {
  if (typeof value !== "string") return null;
  const h = value.trim();
  return h ? h : null;
}
async function getReplyStyleHint(db, campaignId) {
  const enabled = await getKillSwitch(db, "campaign_learning.enabled", { campaignId });
  if (!enabled) return null;
  const row = await readCampaignLearning(db, campaignId);
  if (!row) return null;
  const hint = stringHint(row.state?.reply_style_hint);
  if (!hint) return null;
  return { hint, version: Number(row.version) || 0, updated_at: row.updated_at };
}
async function getNextSequenceHint(db, campaignId) {
  const enabled = await getKillSwitch(db, "campaign_learning.enabled", { campaignId });
  if (!enabled) return null;
  const row = await readCampaignLearning(db, campaignId);
  if (!row) return null;
  const hint = stringHint(row.state?.next_sequence_hint);
  if (!hint) return null;
  return { hint, version: Number(row.version) || 0, updated_at: row.updated_at };
}
function strategyRef(campaignId, version) {
  return `campaign_learning:${campaignId}@v${version}`;
}
function replyStyleSuffix(hint) {
  const h = String(hint ?? "").trim().slice(0, 180);
  if (!h) return "";
  return `
STYLE HINT (from this campaign's tracked outcomes \u2014 apply it only where it does not contradict the explicit rules above): ${h}`;
}
function sequenceHintSuffix(hint) {
  const h = String(hint ?? "").trim().slice(0, 180);
  if (!h) return "";
  return `
SEQUENCE HINT (this campaign's tracked outcomes \u2014 apply it ONLY where it does not contradict the explicit rules above): ${h}`;
}
function capPriority(base, score, cap) {
  const band = Math.max(0, Math.min(base, cap));
  if (score == null || !Number.isFinite(Number(score))) return band;
  const p = Math.min(1, Math.max(0, Number(score)));
  return Math.min(band, Math.round(band * p));
}
export {
  CAMPAIGN_LEARNING_MAX_AGE_MS,
  LEAD_SCORE_MAX_AGE_MS,
  capPriority,
  getKillSwitch,
  getLeadScore,
  getNextSequenceHint,
  getReplyStyleHint,
  replyStyleSuffix,
  sequenceHintSuffix,
  strategyRef
};
