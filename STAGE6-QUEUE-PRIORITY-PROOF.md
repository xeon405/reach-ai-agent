# Stage 6 — Queue Priority: Kill-Switch–Gated Lead-Score Ordering (Proof Report)

**Date:** 2026-09-09
**Status:** implemented, deployed, live-verified, closed
**Scope:** live proof that `send-campaign` fills `send_queue.priority` only while the
`lead_score.enabled` kill-switch is on; off = pure FIFO (all 0.5). Starvation bound,
harness suite, and production behavior are covered below.

---

## 1. What shipped

| Piece | Where | Notes |
|---|---|---|
| `send_queue.priority` column | `20260908000006_queue_priority.sql` | `numeric NOT NULL DEFAULT 0.5 CHECK (0..1)`, index `idx_queue_status_priority_created (status, priority desc, created_at)` |
| Claim-time aging clamp | same migration | `claim_queue_jobs_v2` orders `case when created_at < now() − interval '2 days' then 1.0 else priority end desc, created_at` — guarantees a 0.5 lead is never starved by a hot (1.0) stream: worst case 2 days + one pass |
| Kill-switch gating (Q-B fix) | `send-campaign/index.ts` | checks `getKillSwitch(…, "lead_score.enabled", { userId, campaignId })` **before** reading any scores; off ⇒ no score reads at all ⇒ every job 0.5 ⇒ pure FIFO |
| Priority fill | `send-campaign/index.ts` | per-row `priority: clamp01(score) ?? 0.5`; insert returns `id, priority`; `email.queued` audit carries `priority` + `score_advised` (true only when a score actually shaped the row) |
| Sequence-hint wiring (Stage 6 consumer) | `send-worker` / `inbox-agent` / `intelligence-reads.ts` | `sequenceHintSuffix()` appended to AI email/follow-up generation; `model_version: campaign_learning/v1` + `strategy_ref` on applied sends |
| Guard-residual marker | `inbox-agent` | `own_ids_unavailable: true` in `human.takeover` audit when own-id knowledge was unavailable at decision time |

---

## 2. Harness suite (simulation, before any live signal)

`scripts/build-stage6-test.mjs` + `scripts/stage6-simulation.mjs` — **22/22 assertions pass**:

- **A** — suffix/strategyRef present on generated emails; advisory framing, 180-char cap.
- **B** — guard predicate mirror incl. the honest residual (own-ids-unavailable marker).
- **C** — claim order = `priority desc, created_at`; volume cap 50 unchanged.
- **D** — starvation is real under `priority desc, created_at` (0.5 lead still UNSENT after 30
  days); with the aging clamp it is claimed at day **2.00**; pure FIFO baseline = day 0.00.
- **E** — kill-switch off ⇒ priority 0.5 even when a fresh score exists.
- Stage-5 harness regression: all pass.

## 3. Live proof — same campaign, kill-switch on vs off

Campaign `c3772e1f` ("Test", `instant`), owner `39b65a0f`. Each run: real seeds + a **real**
deployed `send-campaign` POST (cron-secret path), then audit. Zero real emails guaranteed by
construction: test leads were `conv_mode=HUMAN` (worker cancels via `human_takeover`) **and**
the campaign was flipped to `paused` immediately after enqueue (worker cancels via
`campaign_not_active`).

### RUN 1 — kill-switch ON (campaign-scoped `value=true`)

| Lead | Fresh `lead_score` | `send_queue.priority` | `email.queued` audit |
|---|---|---|---|
| `11111111…` | 0.9 (tier A) | **0.9** | `score_advised: true` |
| `22222222…` | 0.4 (tier C) | **0.4** | `score_advised: true` |
| `33333333…` | 0.1 (tier D) | **0.1** | `score_advised: true` |
| `44444444…` | (no row) | **0.5** | `score_advised: false` |

Function response: `{"queued":4,"message":"4 emails queued — sending now","remainingToday":46}`

### RUN 2 — kill-switch OFF (same campaign, `value=false`), fresh scores still present (0.95/0.8/0.7/0.6)

| Lead | Fresh `lead_score` (present but ignored) | `send_queue.priority` | `email.queued` audit |
|---|---|---|---|
| `55555555…` | 0.95 | **0.5** | `score_advised: false` |
| `66666666…` | 0.8 | **0.5** | `score_advised: false` |
| `77777777…` | 0.7 | **0.5** | `score_advised: false` |
| `88888888…` | 0.6 | **0.5** | `score_advised: false` |

Function response: `{"queued":4,"message":"4 emails queued — sending now","remainingToday":46}`

### Secondary evidence

- `score_advised=true` occurs **only** on the three run-1 scored jobs (job-id scoped); the
  off-run performed **zero** score reads — the audit stays truthful under the gate.
- `email.queued` audit preserves the exact `priority` written to `send_queue`.
- Migration live: `priority NOT NULL DEFAULT 0.5`, index present, and
  `claim_queue_jobs_v2` `prosrc` contains the aging `case … interval '2 days' … desc, created_at`.

### Cleanup (all verified PASS)

- Test sends issued at enqueue time: none; worker cancelled them deterministically
  (`campaign_not_active` / `human_takeover`). Owner daily counters untouched (`remainingToday` 46→46).
- Removed: test leads, `send_queue` jobs, `lead_score` rows, campaign-scoped toggle rows.
- Campaign restored to `active`; zero leftover jobs for `stage6.*` leads.

---

## 4. Operational note — CRON_SECRET and the live proof (answered)

1. **Why rotation happened:** the Proof must call the *deployed* `send-campaign`, whose only
   sessionless auth is `x-cron-secret == CRON_SECRET env`. The CLI exposes secrets only as
   fingerprints (proof: it returned a 64-hex hash for `SUPABASE_URL`), so the plaintext was
   unrecoverable → rotate to a known value and call with it via `scripts/.stage6/.cron_secret`.
2. **`scripts/.stage6/.cron_secret` is gitignored** (`.gitignore` line `scripts/.stage6/.cron_secret`),
   never tracked.
3. **Cron was never broken — verified empirically, not assumed.** The schedules are pg_cron
   jobs that bake a **literal** `x-cron-secret` (`cron.job` rows 8–17:
   `oai_cron_6a2e…`). SHA-256 of that literal == the original `CRON_SECRET` fingerprint. Only
   `send-campaign` was redeployed after the rotation, and `send-campaign` is **not** in
   `cron.job` — every cron-targeted function still held the original env. Edge-function logs
   show the minutely `inbox-agent` scans and hourly `claim_queue_jobs_v2` calls returning **200
   through and after** the rotation window.
4. **Restored:** `CRON_SECRET` set back to the original `oai_cron_6a2e…`; `send-campaign`
   redeployed to carry it; re-verified cron ticks still 200 at 01:41/01:42 UTC. Reference file
   updated to the canonical value.

Net: the current secret, the baked cron header, and all deployed function envs are consistent
again, and no scheduled job was affected at any point.

---

## 5. Stage 7 ramp (next)

Personalization engine + intent radar, with **cost-per-send ceiling** (a hard spend/compute
guard, `sender_health`-adjacent) and a **circuit breaker** (auto-disable per-campaign/global on
hot thresholds) as first-class requirements in the design — not retrofitted after.