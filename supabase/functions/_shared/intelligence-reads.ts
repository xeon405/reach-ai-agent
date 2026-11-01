// ============================================================
// INTELLIGENCE-READS — Stage 5 request-time consumer contract.
// Design: INTELLIGENCE-LAYER-DESIGN.md §2.2, §2.3, §2.5, §3.
// Principles enforced HERE, in one place:
//   * Staleness = "no opinion": lead_score is advisory only within 24h of
//     computed_at (and before expires_at); campaign_learning advice within 36h
//     of updated_at. Stale/missing/disabled => null; the caller then runs today's
//     deterministic behavior — never blocks, never invents.
//   * Kill-switch = a config row, not a code path. getKillSwitch reads the
//     scoped agent_config toggle (glob -> user -> campaign, most specific wins).
//     A disabled row, a missing row, OR a read failure returns false (feature
//     off = today's behavior). The seeded glob=true rows (migration
//     20260908000004) are what turn the reads on in production.
//   * Advisory, never controller: capPriority can only shape ORDER within the
//     queue's existing band; daily send VOLUME stays owned by reserve_send_slot
//     + sender_health at reserve time. A hot lead can be sent sooner, never more.
// This module is dependency-free (no supabase runtime import): consumers pass a
// structural db, which keeps it testable from the Node harness and by tsc.
// ============================================================

// Staleness bounds (design §2.2 / §2.3).
export const LEAD_SCORE_MAX_AGE_MS = 24 * 3600 * 1000;
export const CAMPAIGN_LEARNING_MAX_AGE_MS = 36 * 3600 * 1000;

export type IntelligenceToggleKey = "campaign_learning.enabled" | "lead_score.enabled";

type Db = { from: (table: string) => any };

export interface KillSwitchScope {
  userId?: string | null;
  campaignId?: string | null;
}

// ------------------------------------------------------------------
// Kill-switch (design §2.5). Most specific configured scope wins.
// Anything ambiguous (missing row, disabled row, read failure, unparseable
// value) => false => consumers behave exactly as before intelligence existed.
// ------------------------------------------------------------------
export async function getKillSwitch(
  db: Db,
  key: IntelligenceToggleKey,
  scope: KillSwitchScope,
): Promise<boolean> {
  try {
    const { data } = await db
      .from("agent_config")
      .select("scope, scope_id, value, enabled")
      .eq("key", key)
      .eq("enabled", true);
    const rows = (data ?? []) as Array<{
      scope: string;
      scope_id: string | null;
      value: unknown;
      enabled: boolean;
    }>;
    const pick = (s: string, id: string | null) =>
      rows.find((r) => r.scope === s && r.scope_id === id);
    const glob = pick("glob", null);
    const user = scope.userId ? pick("user", scope.userId) : undefined;
    const campaign = scope.campaignId ? pick("campaign", scope.campaignId) : undefined;
    const eff = campaign ?? user ?? glob; // most specific wins
    if (!eff) return false; // no row for this scope chain -> feature off
    return eff.value === true || eff.value === "true"; // anything else -> off
  } catch {
    return false; // read failure -> feature off (zero-blocking)
  }
}

// ------------------------------------------------------------------
// lead_score (design §2.2) — "how valuable is this lead right now".
// Fresh only when computed within 24h AND not past expires_at.
// ------------------------------------------------------------------
export interface LeadScoreRead {
  score: number;
  tier: string;
  score_version: number;
  computed_at: string;
  expires_at: string;
  features: Record<string, unknown>;
}

export async function getLeadScore(
  db: Db,
  opts: KillSwitchScope & { leadId: string },
): Promise<LeadScoreRead | null> {
  const enabled = await getKillSwitch(db, "lead_score.enabled", opts);
  if (!enabled) return null;
  try {
    const { data } = await db
      .from("lead_score")
      .select("lead_id, score, tier, score_version, computed_at, expires_at, features")
      .eq("lead_id", opts.leadId)
      .maybeSingle();
    if (!data) return null;
    const computed = data.computed_at ? new Date(data.computed_at).getTime() : 0;
    if (computed && Date.now() - computed > LEAD_SCORE_MAX_AGE_MS) return null; // stale
    const expires = data.expires_at ? new Date(data.expires_at).getTime() : 0;
    if (expires && expires < Date.now()) return null; // past expires_at
    return {
      score: Number(data.score) || 0,
      tier: String(data.tier ?? "D"),
      score_version: Number(data.score_version) || 1,
      computed_at: String(data.computed_at ?? ""),
      expires_at: String(data.expires_at ?? ""),
      features: (data.features as Record<string, unknown>) ?? {},
    };
  } catch {
    return null; // read failure -> no opinion, caller uses default
  }
}

// ------------------------------------------------------------------
// campaign_learning (design §2.3) — per-campaign behavioral advice.
// Fresh only when updated_at is within 36h. Both reply_style_hint and
// next_sequence_hint share the campaign_learning row and its staleness bound.
// ------------------------------------------------------------------
interface CampaignLearningRow {
  campaign_id: string;
  state: { reply_style_hint?: unknown; next_sequence_hint?: unknown; opener_hint?: unknown; opener_winner?: unknown; winner_variant?: unknown; sequence_sample?: unknown } | null;
  version: number;
  updated_at: string;
}

export interface CampaignHint {
  hint: string;
  version: number;
  updated_at: string;
}

async function readCampaignLearning(db: Db, campaignId: string): Promise<CampaignLearningRow | null> {
  try {
    const { data } = await db
      .from("campaign_learning")
      .select("campaign_id, state, version, updated_at")
      .eq("campaign_id", campaignId)
      .maybeSingle();
    if (!data) return null;
    const at = data.updated_at ? new Date(data.updated_at).getTime() : 0;
    if (!at || Date.now() - at > CAMPAIGN_LEARNING_MAX_AGE_MS) return null; // stale
    return data as CampaignLearningRow;
  } catch {
    return null;
  }
}

function stringHint(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const h = value.trim();
  return h ? h : null;
}

/** Reply-drafting advice for this campaign (e.g. what this audience replies to).
 *  Null when kill-switch off, row missing/stale, or no hint has been folded yet. */
export async function getReplyStyleHint(db: Db, campaignId: string): Promise<CampaignHint | null> {
  const enabled = await getKillSwitch(db, "campaign_learning.enabled", { campaignId });
  if (!enabled) return null;
  const row = await readCampaignLearning(db, campaignId);
  if (!row) return null;
  const hint = stringHint(row.state?.reply_style_hint);
  if (!hint) return null;
  return { hint, version: Number(row.version) || 0, updated_at: row.updated_at };
}

/** Next-step advice for this campaign (reserved for the Stage 6 queue wiring —
 *  consumed now only by the harness to prove the read contract). */
export async function getNextSequenceHint(db: Db, campaignId: string): Promise<CampaignHint | null> {
  const enabled = await getKillSwitch(db, "campaign_learning.enabled", { campaignId });
  if (!enabled) return null;
  const row = await readCampaignLearning(db, campaignId);
  if (!row) return null;
  const hint = stringHint(row.state?.next_sequence_hint);
  if (!hint) return null;
  return { hint, version: Number(row.version) || 0, updated_at: row.updated_at };
}

/** Which opening angle wins for this campaign, when the fold has proven one.
 *  `key` is the machine-actionable part (send-worker swaps it in); `hint` is the
 *  human-readable sentence, usable as-is in a UI or an audit payload. */
export type OpenerHint = { hint: string; key: string | null; version: number; updated_at?: string };

export async function getOpenerHint(db: Db, campaignId: string): Promise<OpenerHint | null> {
  const enabled = await getKillSwitch(db, "campaign_learning.enabled", { campaignId });
  if (!enabled) return null;
  const row = await readCampaignLearning(db, campaignId);
  if (!row) return null;
  const hint = stringHint(row.state?.opener_hint);
  if (!hint) return null;
  return {
    hint,
    key: stringHint(row.state?.opener_winner),
    version: Number(row.version) || 0,
    updated_at: row.updated_at,
  };
}

/** The A/B subject winner, when the fold has proven one past MIN_SAMPLE.
 *  `variant` is the machine-actionable part: "B" = the alternate subject pool,
 *  null = the campaign's default subject. The fold already refuses to name a
 *  winner below 25 sends per variant and 3 points of lift, so this reader only
 *  ever reports a decision the data actually supports. */
export type SubjectHint = { variant: "B" | null; key: string; version: number; updated_at?: string };

export async function getSubjectHint(db: Db, campaignId: string): Promise<SubjectHint | null> {
  const enabled = await getKillSwitch(db, "campaign_learning.enabled", { campaignId });
  if (!enabled) return null;
  const row = await readCampaignLearning(db, campaignId);
  if (!row) return null;
  const w = row.state?.winner_variant as { key?: unknown } | null | undefined;
  const key = stringHint(w?.key);
  if (!key || !key.startsWith("v:")) return null;
  const letter = key.slice(2).toUpperCase();
  if (letter !== "A" && letter !== "B") return null;
  return {
    variant: letter === "B" ? "B" : null,
    key,
    version: Number(row.version) || 0,
    updated_at: row.updated_at,
  };
}

/** The step at which follow-ups stop paying off, when the fold has proven it.
 *  Only returned when a real dead tail exists (every step past it has had
 *  SEQ_DEAD_MIN_SENT sends and zero replies). Used to stop scheduling steps that
 *  cannot plausibly earn a reply — saving volume, not changing the message. */
export type SequenceCutoff = { cutoff: number; minSent: number; version: number };

export async function getSequenceCutoff(db: Db, campaignId: string): Promise<SequenceCutoff | null> {
  const enabled = await getKillSwitch(db, "campaign_learning.enabled", { campaignId });
  if (!enabled) return null;
  const row = await readCampaignLearning(db, campaignId);
  if (!row) return null;
  const hint = stringHint(row.state?.next_sequence_hint);
  if (!hint) return null;
  const sample = row.state?.sequence_sample as { last_reply_step?: unknown; dead_tail_min_sent?: unknown } | undefined;
  const last = Number(sample?.last_reply_step);
  if (!Number.isFinite(last) || last <= 0) return null;
  return {
    cutoff: last,
    minSent: Number(sample?.dead_tail_min_sent) || 0,
    version: Number(row.version) || 0,
  };
}

// ------------------------------------------------------------------
// Audit attribution (Stage 3 columns). A reply drafted UNDER a folded hint is
// reconstructible: strategy_ref points at the exact campaign_learning version
// that advised it; model_version names the advisory source.
// ------------------------------------------------------------------
export function strategyRef(campaignId: string, version: number): string {
  return `campaign_learning:${campaignId}@v${version}`;
}

/** Advisory prompt suffix for a folded reply-style hint. Length-bounded and
 *  framed as advisory so it can never override the explicit drafting rules. */
export function replyStyleSuffix(hint: string): string {
  const h = String(hint ?? "").trim().slice(0, 180);
  if (!h) return "";
  return `\nSTYLE HINT (from this campaign's tracked outcomes — apply it only where it does not contradict the explicit rules above): ${h}`;
}

/** Advisory prompt suffix for a folded next-step/sequence hint. Same framing as
 *  replyStyleSuffix: advisory-first, never able to override the explicit rules. */
export function sequenceHintSuffix(hint: string): string {
  const h = String(hint ?? "").trim().slice(0, 180);
  if (!h) return "";
  return `\nSEQUENCE HINT (this campaign's tracked outcomes — apply it ONLY where it does not contradict the explicit rules above): ${h}`;
}

// ------------------------------------------------------------------
// capPriority — the advisory-band clamp (design §3: "a score can only hold a
// value below the current default cap — never raise it").
//   * score null/stale/missing => the plain band (base, clamped to cap).
//   * an extreme score (1.0) tops out AT that same band — never above.
//   * `cap` is the sender_health-resolved daily cap, supplied so the band is
//     clamped to daily SEND capacity. Order is shaped within [0, band]; volume
//     stays owned by reserve_send_slot — priority can never raise it.
// ------------------------------------------------------------------
export function capPriority(base: number, score: number | null | undefined, cap: number): number {
  const band = Math.max(0, Math.min(base, cap));
  if (score == null || !Number.isFinite(Number(score))) return band;
  const p = Math.min(1, Math.max(0, Number(score)));
  return Math.min(band, Math.round(band * p));
}