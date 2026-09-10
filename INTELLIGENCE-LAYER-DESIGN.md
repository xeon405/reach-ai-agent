# Intelligence Layer — Design (Tables + Read/Write Contract)

Status: design · Owner: AI Sales Intelligence workstream
Scope: the tables, writers, cadence, staleness and fail-safe contract for the AI Sales
Intelligence layer (lead scoring, campaign learning, next-best-action, intent radar)
plus the Stage 7 cost ceiling + circuit breaker (metred LLM spend, per-unit allowance,
degrade-to-template breaker). This doc does **not** cover Workstream 0 fixes — they live
in their own tracking, but their deployment is a prerequisite ordering constraint (see
Sequencing).

---

## 0. Design principles (non-negotiable)

1. **Advisory, never controller.** `send-worker`, `inbox-agent`, `send-reply` and the
   queue RPCs are load-bearing and keep *ownership of every send and every handoff
   decision*. The intelligence layer writes scores/strategy; the core reads them as
   inputs it can ignore. The core never calls the intelligence layer for permission.
2. **Couple by data, not by service calls.** No new HTTP fan-out between functions.
   Communication is through tables: writers upsert, consumers read rows with
   staleness bounds. This keeps the core deployable and testable in isolation.
3. **Zero-blocking on learning outages.** A missing or stale score/strategy read must
   degrade to exactly today's deterministic behavior — never block, never invent.
4. **Privacy boundary (the moat).** Global, cross-customer learning runs on anonymized
   outcome aggregates only. No lead content, no email body, no personal identifiers
   leave the customer-scoped tables. Teams that cold-email cannot be identified in the
   aggregate store.
5. **Attribution before learning.** No model output is ever trusted without a
   `decision_id` + `model_version` on the outcome that evaluates it. This is the
   prerequisite to Workstream 1; without it the learning loop is guessing.
6. **Reversibility.** Every advisory intervention is toggleable per-user/per-campaign
   via `agent_config`, and every *applied* intervention lands an `audit_events` row.

---

## 1. Workstream 0 — ship now, before the intelligence layer reads anything

These are independent risk-mitigations. They precede; the intelligence layer is built
on top of them, not in parallel.

### 0a. Reputation-feedback (ship first — standalone production risk)

Today warm-up is a scalar ramp off `profiles.created_at`:
`cap = min(plan.dailyEmails, 5 + daysWarm*5)` with a 2000/500 consumer-vs-workspace
ceiling (`send-worker`). There is **no outcome-driven brake** — a mailbox can hit its
day-N cap while bounce/complaint rate climbs, and nothing pulls back.

New table `sender_health`:
- `mailbox_key` (gmail account id or profile_id), `connected_at`, `warm_phase`
  (`ramp|steady|recovery`), `current_cap`, `last_measured_at`,
  `bounce_rate_7d`, `complaint_rate_7d`, `reply_rate_7d`, `health_pct`.
- Deterministic brake rules (no ML, no LLM — pure thresholds):
  - bounce_rate_7d > 3% → `recovery`, cap halved
  - complaint_rate_7d > 0.1% → `recovery`, cap → daily floor (5)
  - health recovers only after K clean days; ramp is floor→cap, not cap→larger cap
- Writer: nightly `reputation-report` cron (reads `tracking_events`, bounce statuses,
  Gmail query stats) + a `send_attempt` insert on every send for live rate inputs.
- Consumers: `claim_queue_jobs_v2`/`send-worker` read `current_cap` instead of computing
  `5 + daysWarm*5`. **Fail-safe = default:** no row → use current ramp formula exactly.
- Ship-first rationale: this is a current production risk; the intelligence layer's
  "faster/more" recommendations are only safe once the brake exists.

### 0b. Config-driven inbox judgment (do first — trust surface, low risk)

`inbox-agent`'s `CONFIDENCE_FLOOR = 0.55`, 3-AI-turn budget, and reply policy are
hardcoded constants/prompt strings. New `agent_config` table:
- `key`, `scope` (`glob|user|campaign`), `value jsonb`, `version`, `enabled`,
  `updated_at`, `changed_by`.
- `inbox-agent` reads per-invocation: glob → user → campaign override, local constant
  as emergency default if no rows or a read fails. **Floor is never called into
  existence by the LLM — only by config.**
- Tuning/A-B: bump `version`, ship config values, compare outcome deltas via
  `audit_events.model_version`. No deploy required to change judgment.
- Same mechanism holds `CONFIDENCE_FLOOR`, turn budget, reply-policy prompt selectors,
  and the future kill-switch for `campaign_learning` interventions.
- Traceability: `inbox-agent` attaches the effective `cfg`
  (`confidence_floor`/`turn_budget`/`reply_policy`/`max_ai_replies_per_lead_24h`)
  to every `ai.classified` and `agent.handoff` audit payload, so a decision under a
  tuned config is reconstructible. Stage 3 formalizes `decision_id`/`model_version`
  columns.

### 0c. Honesty charter note on email inference (trivial, do now)

Add to `/honesty`: "When we research leads we derive suggested work emails from each
business's public website and public sources; we label these as AI-suggested and you're
responsible for first-contact consent." One paragraph; trust doc alignment before volume
scales.

---

## 2. Workstream 1 — tables

### 2.1 `audit_events` schema change (the attribution prerequisite)

Add (nullable, indexed):
- `decision_id uuid` — groups model output → outcome trail
- `model_version text` — which config/prompt version produced the decision
- `strategy_ref text` — link to the `campaign_learning` row version that advised it

Writer: every function that makes an AI/queue decision. Backfill: no-op (null).

### 2.2 `lead_score`

Purpose: where the "how valuable is this lead right now" number lives.
- PK `lead_id`; columns: `score numeric`, `tier text`, `features jsonb`
  (**feature values only — opaque, no raw content**), `score_version`, `computed_at`,
  `expires_at`.
- Writer: `learning-loop` cron (hourly) + on-demand recompute for leads the
  inbox-agent has live threads on.
- Consumer contract: `send-worker`/`inbox-agent` may read only if
  `computed_at > now() - 24h`. Stale → ignore score, use default. A score may
  **raise** priority only within the existing caps/lease path; it can never bypass
  `sender_health`.

### 2.3 `campaign_learning`

Purpose: per-campaign state that gets smarter from that campaign's own outcomes.
- PK `campaign_id`; columns: `state jsonb` (subject-variant deltas, personalization
  amplitude by segment, timing/phase, next-best-action queue), `version int`,
  `updated_at`, `triggered_by`.
- Writers: only `learning-loop` (nightly, campaigns with ≥ N outcomes). `send-worker`
  and `inbox-agent` are **read-only** consumers.
- Staleness: `updated_at > now() - 36h` required for any behavioral advisor. Stale →
  campaign runs on current defaults (today's behavior).

### 2.4 `strategy_state` (global cross-customer, the moat)

Purpose: anonymized aggregate outcomes only.
- Columns: strategy families keyed by anonymized `feature_bucket` (e.g. industry
  coarse group, reply-pattern class), aggregate deltas (Δreply, Δmeet) per
  `model_version`, counts. **No lead id, no campaign id, no email content, no PII.**
- Writer: `learning-loop` weekly from de-identified aggregates.
- Never consultable at request-time; batch-only. This store is what makes the
  differentiator — a loop that improves from every customer's outcomes without ever
  touching a customer's data.

### 2.5 `agent_config` (Workstream 0b — reused here)

Holds scope overrides + the kill-switch:
- `campaign_learning.enabled` / `lead_score.enabled` toggles per user/campaign.
- If disabled or a read fails → deterministic defaults. Kill-switch is a config row,
  not a code path.

---

## 3. Read/write contract (the backbone)

- **Outcome events (write, immediate):** `track-open`, `track-click`,
  `inbox-agent` (per classification), `send-worker` (per send/follow-up) upsert one row
  into the existing event tables **with** `decision_id`+`model_version`. This is
  additive to current code, not a new writer service.
- **Batch fold (write, cron):** `learning-loop` reads events → updates `lead_score`,
  `campaign_learning`, `strategy_state`. Single writer → no write contention,
  version bumps are monotonic.
- **Consumers (read):**
  - `send-worker` reads `sender_health.current_cap` (0a), `lead_score`
    (max-age 24h), `campaign_learning.next_sequence_hint` (max-age 36h).
  - `inbox-agent` reads `agent_config` (0b) + `campaign_learning.reply_style_hint`
    (max-age 36h).
- **Staleness = "no opinion":** consumers treat stale/missing reads as today's default
  behavior. Never block a send or a handoff on learning availability. A stale read can
  only hold a value below the current default cap — never raise it.
- **Audit:** every applied advisory intervention writes an `audit_events` row with the
  `decision_id` of the model output + `strategy_ref`.

---

## 4. Sequencing (deployment order)

1. **0c** — honesty charter paragraph (day 0, trivial).
2. **0a** — reputation-feedback + `sender_health` + brake in
   `claim_queue_jobs_v2`/`send-worker` (this week; standalone, ship first).
3. **0b** — `agent_config` + inbox-agent reads config (this week; do first on the
   trust surface, unlocks tuning without deploys).
4. `audit_events` migration (decision_id/model_version) — cheap, do with 0a/0b.
5. `lead_score` + `campaign_learning` + `strategy_state` + `learning-loop` —
   built only after 0a and 0b are live and observed >1 week.
6. Advisor wiring in `send-worker`/`inbox-agent` behind `agent_config` toggles.

Rationale: 0a/0b change the surface the intelligence layer reads from. Building
sequencing on a cap system that can't yet protect itself would bake today's gap into
the moat. Step 4 is the only schema work that must precede model-trusting learning.

---

## 5. Open questions for the design

> Status (all three DONE — settled by owner 2026-09-08):
> - Cap interaction: **future claims only.** In-flight/leased sends finish; the
>   nightly-lowered cap applies to the next claim (reserve_send_slot is consulted
>   at reserve time; no mid-send revocation logic is added anywhere).
> - lead_score freshness by tier: **deferred.** Staleness already fails safe to
>   "no opinion → deterministic defaults" with zero blocking; per-tier refresh is
>   a tuning nicety and will not be built in this pass.
> - EU suppression from global learning: **REQUIRED.** strategy_state aggregates
>   must exclude outcomes tagged to GDPR countries. Filter set is
>   `GDPR_COUNTRY_ISOS` in `supabase/functions/_shared/osm.ts`: EEA (EU-27 + IS +
>   LI + NO) + UK (GB) = 31 countries. Learning-loop drops strategy input rows
>   where `lead.country` ∈ that set OR `lead.country` is null/unknown (can't
>   prove non-EEA → conservative exclusion). COUNTRY_ISO is a capture-time geo
>   attribute of the business being searched (Overpass `area["ISO3166-1"]`
>   boundary / Places geo-bound), not IP/timezone inference.

---

## 6. Workstream 2 — Stage 7: cost ceiling + circuit breaker (first-class)

Personalization (`gen_email`/`gen_followup`) and intent radar (inbox-agent
`classify`/`draft`/`escalate`/`reply`) are metred LLM spend. This section makes that
spend visible, capped, and breaker-managed **before** personalized volume scales. It
reuses the `sender_health` discipline verbatim: deterministic thresholds, additive
brakes, fail-safe to defaults, self-resetting.

### 6.1 Meter — single chokepoint `_shared/groq.ts groqChat()`

Every LLM call in the system crosses `groqChat`. The meter:

- Captures response `usage` (`input_tokens`/`output_tokens`, accepting the legacy
  `prompt_tokens`/`completion_tokens` names) — previously discarded.
- Writes ONE row to `ai_spend_ledger` per call, **fire-and-forget — never blocks the
  send path**. Callers may pass `opts.context = { fn, kind, user_id, campaign_id,
  lead_id, decision_id }`; absent context still yields a row with `fn/kind`
  defaults. `fn` defaults are declared per call-site as metadata, not invented.
- Computes `est_cost_usd` (6dp) from configurable token prices: ENV
  `AI_COST_PER_1M_IN`/`AI_COST_PER_1M_OUT`, defaults `$0.20`/`$0.80` (gpt-oss-120b
  ballpark). Changing rates never requires a deploy past env.
- Is **conservative when metering degrades** (no silent blind spot — Stage 5 guard
  lesson): on insert failure it buffers the row (capped), raises a visible
  `[meter]` warning, and on the next successful write emits ONE
  `ai.metering.degraded` audit row with the buffered+dropped counts.
  `ai_cost_state.last_reported_at` staleness is the system-level tripwire: a window
  with LLM activity but no fresh ledger rows = *cost unknown*, and the gate conserves
  (template mode) rather than assuming spend is zero.
- **Diff-1 status: purely observational (deployed).** No consumer reads the tables
  yet. The meter's guarantee is explicitly best-effort: the buffer is in-memory and
  lost on instance recycle, so ledger rows are lossy under outage. The GATE therefore
  never relies on ledger integrity — it relies on the durable reservation counter
  (§6.3) plus the send-count reconciliation tripwire (§6.6). The ledger is analytics
  + reconciliation only, not the gate's source of truth for the hard cap.

### 6.2 Unit-cost model (the tier-inversion decision — settled)

AI spend is a **per-unit allowance, not % of ARPU**. The 8% figure survives only as a
Starter sanity number. The binding rule is a per-email gross **margin floor after AI
≥ $0.004**.

| Tier | Price | Cap/day | $/email | Allowance | Pool/day | Pool/mo | %ARPU | Margin after AI |
|---|---|---|---|---|---|---|---|---|
| starter | $37 | 50 | $0.0250 | $0.0016/send | $0.080 | $2.40 | 6.5% | $0.0234 |
| growth | $79 | 200 | $0.0130 | $0.0016/send | $0.320 | $9.60 | 12.2% | $0.0114 |
| agency | $149 | 500 | $0.0100 | $0.0016/send | $0.800 | $24.00 | 16.1% | $0.0084 |

- COGS% rises by tier **deliberately**: unit AI cost is flat while unit email price
  falls with volume. All three tiers clear the `$0.004` floor → **no rationing
  anywhere at current pricing**.
- If a tier ever drops below the floor (price or model-cost change), that tier
  **rations proportionally** — the allowance shrinks, never the floor.
- Per-send breaker guard: `$0.0025` (~1.5× allowance). A single call over it trips
  that call to template.

### 6.3 State — `ai_cost_state` (durable gate counter) + `agent_config` (markers), ONE picker

- `ai_cost_state` mirrors `sender_health`: one row per profile, windowed
  (`window_date` UTC day, `window_month`), `used_daily_usd`, `used_monthly_usd`,
  `mode`, `trips`, `tripped_at`, `tripped_reason`, `last_reported_at`,
  `updated_at`.
- **The hard cap runs on a durable atomic reservation-debit, NOT on ledger
  SUM.** Every gated LLM call debits the counter BEFORE the call with a single
  atomic statement — rolling-window-aware, no read-modify-write race:

  ```sql
  update public.ai_cost_state
  set used_daily_usd = (case when window_date = current_date
                             then used_daily_usd + $est else $est end),
      used_monthly_usd = (case when window_month = to_char(current_date, 'YYYY-MM')
                               then used_monthly_usd + $est else $est end),
      window_date = current_date,
      window_month = to_char(current_date, 'YYYY-MM'),
      updated_at = now()
  where profile_id = $user;
  ```

  (Row missing ⇒ `INSERT ... ON CONFLICT DO NOTHING` first; rollover happens on
  the first debit of a new window in one statement, so concurrent debits can never
  double-count across a boundary.) The gate refuses the call when the post-debit
  daily counter would exceed the account pool, and a **refund** (atomic subtract,
  floored at 0) reverses the debit on payload failure. Because it is
  single-statement, debits are durable and race-free even when instances share a
  profile — the exact hole the in-memory buffer has.
- **Sweep keeps the counters honest**: periodically re-sums `ai_spend_ledger` per
  profile/window and reconciles toward the ledger (recovery and drift repair
  between the two writers). Any divergence beyond tolerance is itself a
  metering-degraded signal (§6.6).
- **Two markers live in `agent_config`, deliberately separate** — same separation
  as `own_ids_unavailable` vs a genuine mailbox takeover (Stage 5):
  - `ai_quality.mode` = `ai|template|hard_stop` (the AI-quality decision).
  - `ai_quality.metering_degraded` = bool (cost tracking itself is untrustworthy).
  Consumers read both through the existing `getKillSwitch`-style picker
  (glob→user→campaign, most-specific wins). A degraded meter is NOT a quality
  judgment (quality may be fine); a healthy meter is NOT permission to ignore an
  admin kill-switch. The two never conflate.
- Kill-switch stays a config row, never a code path: disabled/absent `mode` row
  ⇒ default `ai`; `metering_degraded` defaults false (and the gate's
  reconciliation independently re-derives it, so the config is a cache too).
- **Emergency gate kill-switch (tested, scenario E of the stage-7 harness):**
  `ai_quality.gate_enabled = false` (glob→user→campaign, most specific wins)
  bypasses the gate **entirely** — every gated call goes straight to `groqChat`
  exactly as pre-Stage-7, computed reserve and `ai_cost_debit` never happen, no
  conservation applies (it even overrides a hard-stop pool state). One row flip
  reverts every send; the gate is not consulted for a decision. The observational
  meter in `groq.ts` still logs usage. A row whose value is `true` or absent = gate
  on (default). This is the escape hatch that lets diff 2 be shipped behind a
  single reversible switch.

### 6.4 Degrade order (non-uniform — settled, first-class in diff 2)

- **L1 — new-outreach personalization only** (`gen_email`/`gen_followup`) degrades to
  deterministic templates (curated subjects already in send-worker + lead-facts body;
  deliverability regex guards still pass; cost ≈ $0). Replies and intent radar keep
  AI.
- **L2 — `reply_draft` keeps AI the longest**, via a **separate, later-tripping
  threshold, not the same L1 daily-pool check**: per-inbound reply budget (e.g.
  `$0.005`/reply — a real reply is worth more than a cold send) and reply-share of
  the monthly pool (e.g. 30% of `pool_month`, so a reply-heavy month can't eat the
  whole month). Losing a real reply to a template is expensive; keeping AI there is
  cheap at the volumes involved.
- **Reliability breaker** (LLM error rate > 40% over a 10-min window, or 5
  consecutive 429/5xx — observable in `groqChat`) uses the **same L1 path**:
  templates need no LLM. Entry hysteresis: ≥ 2 clean hours to re-arm (no flapping).
- **`hard_stop` is reserved for exactly three things**: an admin kill-switch row,
  per-account **monthly** pool at 100%, or the reliability breaker inside the L2
  window. A hard stop pauses new outreach for the affected scope only — never other
  users.
- **`metering_degraded` acts as the L1 path too** (conserve: templates for new
  outreach, replies keep AI): the degraded flag means "we cannot prove spend is
  low", and the correct response to an unknown is the lowest-cost option — except
  replies, where the L2 logic still applies. It is orthogonal to `mode` (§6.3):
  both can be set, neither overwrites the other.

### 6.5 Multi-campaign aggregation (explicit — settled)

- The **account daily pool (6.2) is the hard cap on the SUM across all
  simultaneously-active campaigns.** Campaigns can **not** each independently spend
  their own 50% ceiling.
- Per-campaign 50%-of-pool is a **proximal guard only** (stops one runaway campaign
  from eating the day early). The account gate binds the aggregate at 100%.
- **Durability asymmetry (deliberate):** the hard cap (account pool) runs on the
  durable atomic `ai_cost_state` counter (§6.3). The proximal guard (per-campaign
  50%) runs on the ledger SUM for that campaign — lossy under outage, but its only
  failure direction is *later tripping*, which the account cap absorbs. The hard cap
  can never be cheated by a lost ledger row; losing the proximal guard merely lets a
  campaign reach the account ceiling sooner.
- **Reserve-then-settle** exactly like `reserve_send_slot`/`release_send_slot`: a
  per-send reservation debits the durable counter (§6.3) checked against BOTH
  ceilings (campaign guard from ledger first, then the atomic account debit) BEFORE
  the LLM call, and is refunded on failure. The race window is bounded by the
  atomic debit — concurrent instances serialise on the row, never on sum-at-read.

### 6.6 Fail-safe contract (Stage 7)

- Metering down ⇒ **CONSERVE** (L1 templates), never spend blind, never assume zero.
- Ledger stale for a window with known LLM activity (`last_reported_at` old) ⇒
  spent-unknown ⇒ conserve.
- **Counter-vs-ledger reconciliation tripwire (first-class, as built):** the durable
  counter is the source of truth for spend, and no AI call can proceed without a
  successful `ai_cost_debit` — so *a dark/down ledger* is the attack. The sweep
  compares the durable counter to `SUM(ai_spend_ledger)` for the same window; a
  counter ahead of the ledger by more than the drift tolerance while spend exists
  ⇒ **metering_degraded = true** ⇒ conserve. A lost ledger row is *provable from
  the counter side*, and the transaction ordering (debit → LLM → ledger → settle)
  means the counter is always at or above what the ledger logged — the breach
  direction the tripwire guards is exactly the dangerous one.
  - **Refinement note:** an earlier sends×allowance design was discarded as the
    *primary* trip: legitimate template degradation sends emails with **zero** AI
    cost, so a sends-derived expectation false-trips and **locks the user into
    templates**. It survives only as an informational `ai.metering.reconcile_send_gap`
    audit row — never a trip.
- The template path inserts **no** LLM cost, writes **no** ledger row, and debits
  **no** reservation.
- Missing `ai_cost_state` row on a fresh profile is NOT spent-unknown — a missing
  row is simply "nothing spent yet" and resolves to `ai` (`no_state`); only a
  **read failure** conserves (`unreadable_state`). The durable debit still
  fails-closed (an unreachable counter is an outage, and outages conserve).
- A single per-call reservation exceeding `AI_PER_CALL_GUARD` refuses the call
  *before* any debit RPC (a runaway prompt can't burn the pool in one shot).

### 6.7 Sequencing (Stage 7)

1. Diff 1 — meter in `groq.ts` (usage capture + ledger write + degrade-marker) +
   `ai_spend_ledger`/`ai_cost_state` migration. **DONE: applied live, deployed
   across send-worker / inbox-agent / send-reply / find-leads. Purely
   observational; producing real usage data to sanity-check the `$0.0016`/send
   allowance before anything enforces on it.**
2. Diff 2 — the gate + breaker: atomic reservation-debit (§6.3, durable hard cap),
    counter-vs-ledger reconciliation tripwire (§6.6), non-uniform degrade order L1/L2
    (§6.4), dual markers in `agent_config` (§6.3), sweep that re-sums + reconciles.
    Consumers wire through the existing `getKillSwitch` picker.
     **DONE: code live, harness 43/43 + kill-switch scenario; migrations 02 (gate
     RPCs + cron) and 03 (`set_agent_config` writer for the partial-index tables)
     applied; cost-sweep / send-worker / inbox-agent deployed; CRON_SECRET literal
     confirmed live. Live-fire proof 2026-09-09: RUN0 healthy=>ai (real meter row),
     RUN1 pool ceiling=>template (counter+ledger untouched), RUN1b sweep markers
     (mode=template + metering_degraded drift), RUN2 gate_enabled=false full bypass
     (gate_disabled + real LLM ledger row), RUN3 revert=>template; zero real sends
     (dry-run cancel-before-send), all test rows/markers/counters restored.**
3. Diff 3 — live proof on campaign `c3772e1f`: run under `ai` mode, spike a
   fake-cost ledger row across L1/L2 thresholds, confirm templates + replies behave
   per §6.4, confirm the account gate binds the multi-campaign sum (§6.5), and kill
   the reconciliation tripwire path (delete ledger rows, confirm conservative
   behavior from send-side evidence). Cleanup contract identical to the Stage 6
   proof (zero real sends, all test rows removed).
    **DONE 2026-09-09: executed by `scripts/.stage7/live-prove-stage7.mjs` (21/21
    assertions). Near-cap crossing (gate resolved ai/null) proved the atomic debit
    RPC is the hard backstop; the pool-ceiling run proved the L1 gate binds first
    (template/`daily_pool`, byte-identical counter, zero ledger rows); sweep-write
    tripwire proven via `set_agent_config` RPC (partial-index-safe); kill-switch
    bypass proven (gate_disabled + real LLM row); revert proven. Zero real sends;
    all rows/markers/counters/sweep markers restored to pre-proof state.**

## 8. Workstream 3 — Stage 8: conversation memory, erasure-by-design

### 8.1 Problem framing (settled)

**The product has zero durable conversation memory today.** `fetchThreadHistory`
rebuilds the Gmail thread transcript live per scan (inbox-agent / send-reply), and
the business-intelligence prompt string (`buildBIContext`) is rebuilt from
`profiles` per request. Nothing conversation-shaped survives between scans, which
means erasure has nothing to violate today — but the AI also cannot learn across a
thread. Stage 8 makes memory durable **and** defines its deletion contract at the
same time, so the honesty-charter retrofit of the email-inference step is never
repeated.

### 8.2 Persistence map — what conversation history exists today

Durable content-bearing stores (all user-owned, all MUST cascade to forget/delete):

| Store | Holds | FK on lead delete |
|---|---|---|
| `emails_sent` | subject, body, ai_draft, reply_sentiment, ai_turns | CASCADE (leads) |
| `ai_classifications.raw` | truncated lead snippet + subject | **none — explicit** |
| `owner_alerts` | reply text, lead names | **none — explicit** |
| `audit_events.payload` | subject(80), style_hint(180), errors, URLs | **none — explicit** |
| `email_threads` | pointer/counter only (no text) | CASCADE (leads) |
| `campaign_learning.state` | variant counters; raw subject key when no variant tag | campaign-only, NOT by lead |
| `support_chat_messages` | chat transcripts | CASCADE (profiles) |
| `intro_requests.message`, `push_queue.title/body` | intro/push text | mixed/no FK |

Ephemeral by design: BI-context prompt, Gmail thread transcript.

**Live-DB audit of the runtime tables (2026-09-09, supersedes "no migration" caveat):**

| Table | Live shape (verified) | RLS | Rows | Erasure scope |
|---|---|---|---|---|
| `saved_businesses` | place_id, **`email` (inferred/derived personal datum)**, email_source(_url/status/confidence/is_role/is_disposable/verification_reason), name/company/job_title/phone/address, ratings, first/last_seen | on | 44 | **Shared discovery map; NOT conversation memory. BUT the `email` field is inferred personal data — the exact provenance-sensitive field the lead-provenance review turned on.** No contributor attribution exists today (no user FK; `saveBusinesses` writes are keyed by `place_id` and shared across all users), so forget_lead MUST add attribution: `discovered_by uuid[]` (set at write time by authenticated callers; null for cron) + `forgotten_by uuid[]`. On forget, remove this user from `discovered_by`, add to `forgotten_by`, and null `email`+`email_*` when no contributor remains — the email cell is thereby purgeable even though the business-entity part of the row stays. `findSavedLeads` must exclude rows where the requesting user `= any(forgotten_by)`. |
| `lead_finder_caches` | kind, cache_key, payload jsonb, expires_at | on | 1 | TTL'd discovery cache (12h/7d). Not per-user, not conversation memory; **bounded retention, self-expiring — out of per-user scope** |
| `lead_refresh` | niche/country/city + last_live_search_at, refreshes, query | on | 5 | Throttle cursor. No content, no identity. Out of scope |
| `refresh_usage` | day, count | on | 11 | Quota counters. Out of scope |

No user FK exists on any of the four; the delete-account cascade design is therefore
unaffected by them, and each is explicitly declared in/out of erasure scope above so
the guarantee has no hidden table.

### 8.3 Tombstone semantics — SETTLED: timestamp boundary, not "forever"

Decision: `forget_lead` erases everything at or before `forget_at` and sets a
tombstone so **strictly-later correspondence resumes as a fresh thread**. Rationale:

- **Right-to-erasure covers the personal-data record that existed; it does not ban
  future service.** New messages after `forget_at` are a new exchange with a new
  implied business relationship and are served fresh.
- A "forever" tombstone would cripple legitimate later engagement (a lead who
  re-opens after 6 months gets mis-served forever) and is over-broad — forgetting
  is not revoking consent-to-contact (that is suppression, §8.4, an independent
  signal).
- A permanent "forgotten" marker is itself a more sensitive datum resting in the DB
  forever than a timestamp boundary.
- Enforcement is double-layered so re-extraction cannot resurrect the past: (1) all
  local copies ≤ `forget_at` are deleted in the same RPC; (2) the memory builder
  hard-filters messages by Gmail `internalDate > forget_at` **before** any
  summarization, and the classifier treats the thread as a fresh start. The
  historical emails remain in the account owner's Gmail (they cannot be retracted
  from the sender's own mailbox) but are never read/stored again by this product.

`forget_at` lives on `email_threads` (one row per thread). `memory_since` is
implicit (`> forget_at`).

### 8.4 Suppression and tombstone are TWO independent signals (settled)

- **Suppression** (`suppressions` row; `leads.unsubscribed`) = consent-to-contact:
  stop mailing/replies. Authored by unsubscribe/bounce. Existing, unchanged.
- **Tombstone** (`email_threads.forget_at`, NEW) = data-retention boundary: erase
  local memory ≤ timestamp, allow strictly-after. Does NOT stop contact.
- Codomain is the 2×2, all legal:
  `(retain, served)` normal · `(retain, suppressed)` opt-out · `(forget, served)`
  fresh-start service · `(forget, suppressed)` full stop.
- `forget_lead(p_user_id, p_lead_id, p_suppress bool default false)` takes an
  explicit suppress flag; the caller decides. The schema never derives one signal
  from the other — erasure (GDPR Art.17) and consent (PECR) have different legal
  bases and must not be merged, else opt-out would force data retention and
  fact-erasure would force a permanent contact ban.

### 8.5 `thread_memory` — content boundary (settled)

New table `thread_memory(thread_id, lead_id, fact_kind, value, source_message_id,
source_ts, confidence, created_at, superseded_at)` — **facts only, never raw
message text** (the transcript stays in Gmail). Erasure cascades to it on
forget/delete (delete rows where `source_ts <= forget_at`, or all rows on delete).

Content boundary is enforced in two independent layers:
1. **Prompt-level whitelist + value governance:** the summarizer extracts ONLY
   business-relevant fact kinds: `interest_level`, `objection`, `timing_window`,
   `availability`, `decision_criteria`, `contact_role`, `next_action`,
   `commitment`. It is instructed to never extract personal/sensitive topics
   (family, health, politics, religion, identity beyond professional role), never
   infer beyond the text, and to replace-not-append on conflict. **Value
   governance (2026-09-09):** the extractor is additionally told to ABSTRACT
   sensitive-adjacent content (a stated reason, pricing headroom, budget, timeline
   constraints) into the business essence (e.g. `budget-constrained`,
   `cost-sensitive`, `needs internal approval`) rather than echo phrasing or
   figures, and to never emit direct identifiers (emails, phone numbers, full
   addresses, account/order/card numbers, exact $ amounts; rounded ranges only
   when decision-relevant).
2. **Schema-level gate + identifier backstop:** the parser drops any fact whose
   `kind` is not in the whitelist — an over-eager model cannot persist a
   non-whitelisted subject even as a summary. `value` is truncated (≤200 chars),
   per-thread fact count is capped (64), and only `source_message_id +
   source_ts` reference the raw exchange. **Identifier backstop (2026-09-09):**
   regardless of what the model echoes, `sanitizeMemoryValue` prunes direct
   identifiers from the free-text value before persist — emails, phone numbers,
   6+-digit runs (account/order/cards), comma-grouped figures, and exact $ amounts —
   so a verbatim quote can never land in `thread_memory` as-is; the generalized
   remainder (the business intent) is kept, and a value emptied by pruning is
   dropped. The whitelist protects the CATEGORY; this protects the CONTENT.

**Extraction semantics (SETTLED 2026-09-09, user-confirmed):**
- **Strict-incremental only.** The summarizer slices messages with
  `internalDate > coalesce(last_summarized_at, forget_at, 0)`, sorted ascending,
  capped to the newest 8 per scan. Whole-thread re-summarization is rejected: it
  makes the watermark pointless and multiplies cost with every reply in a long
  thread.
- **Existing facts are model context.** The thread's active (non-`superseded_at`)
  facts are passed to the extractor so a later slice can **supersede** an outdated
  fact (same kind, new value → old row marked `superseded_at`, new row inserted =
  replace-not-append) instead of duplicating or ignoring it. Same kind + same value
  is a duplicate no-op (never re-inserted). Supersede is code-enforced after the
  model emits; the model only decides *whether* a fact changed.

### 8.6 Cost routing + conserve mode for summarization (settled)

- Routing: summarization calls go through the existing `openAiCall` chokepoint with
  kind **`summarize`** — a **non-reply (L1)** kind, so it trips on the daily pool
  like new-outreach. It is metered into `ai_spend_ledger` (kind `summarize`) and
  reserves/debits `ai_cost_state` exactly like other kinds. The same
  `AI_COST_PER_1M_IN/OUT` pricing applies.
- **Conserve mode = skip-and-leave-memory-unchanged.** There is no template
  fallback for a summarizer. `mode !== 'ai'` (or a debit that trips the ceiling)
  ⇒ `run()` returns null ⇒ the memory builder writes nothing and **does not
  advance the per-thread watermark** (`email_threads.last_summarized_at`), so no
  message is ever silently skipped forever. On return to `ai` mode, processing
  resumes through the gap with a bounded batch (everything > `forget_at` and >
  `last_summarized_at`, capped per scan). Memory is only ever written after a
  successful call.
- `hard_stop` likewise yields a no-op summarizer; memory never backfills pre-
  boundary content on resume (the `> forget_at` filter holds unconditionally).
- `summarize` is explicitly an **L1 (non-reply) kind** — it is not in
  `REPLY_KINDS`, so it trips on the daily pool and `metering_degraded` like
  new-outreach; only the monthly reply share spares replies (§6.4 non-uniform
  degrade preserved).
- **Conserve acceptance criterion (SETTLED 2026-09-09, user-confirmed):** the
  proof must assert memory AND watermark are BOTH untouched on conserve (a true
  no-op, not a partial write), then flipping mode back to `ai` re-processes
  **exactly the same skipped slice** (same message ids), writes each fact once,
  and a third call is a clean `nothing_new` — proving the watermark is the single
  processing checkpoint. Proving the skip alone is not enough.
- **Dedicated memory kill-switch (2026-09-09):** `memory_builder.enabled` (scopes
  glob/user/campaign, most-specific-wins, read by `resolveScopedSwitch` in
  `agent-config.ts`) is independent of the `ai_quality.mode` cost-conserve
  marker. Off ⇒ `summarizeThreadMemory` returns `conserve`/`kill_switch` with **no
  Gmail fetch and no gate call** — zero cost, zero debit, zero write, watermark
  untouched — so memory-writing can be disabled alone without touching
  personalization/replies (those call sites never consult this key). Default is ON
  and fails open on unreadable config (availability control, matching
  `resolveAgentConfig`'s emergency-default convention; the content backstop above
  never disables on failure).

### 8.7 Learning-loop interplay (settled — the asymmetry holds)

- **`strategy_state`: NO manual un-fold.** The GDPR/EEA/UK + unprovable-unknown
  exclusion (`learning-loop` `foldStrategyState`, `GDPR_COUNTRY_ISOS`) filters
  those leads out before aggregation, buckets are `c:<category>` cells across all
  users, and the fold reads only `emails_sent(lead_id, replied)` +
  `leads(category,country)` + `meetings(lead_id)` — content-free and identity-free.
  Stored cells are **snapshots recomputed each Sunday for the same
  `(feature_bucket, model_version, window_start)`**; once a lead and its
  `emails_sent` rows are cascade-deleted, the next fold recomputes the cell without
  them. Erasure of a lead therefore self-corrects with ≤1 week lag — **accepted**,
  unless a future promise needs zero-lag, in which case force-recompute the
  affected `c:<category>` cells at erase time (one SELECT per category).
- **Required hardening from the same fold:** when removal drops a bucket below
  `MIN_SAMPLE_AGG`, `foldStrategyState` currently skips the upsert and the stale
  published row lingers — a moat violation. Stage 8 must **retire the row** (delete
  it) when a bucket fails the floor, so "buckets below the floor are never
  published" stays true after erases.
- **`campaign_learning`: eager recompute — NOT covered by the exclusion.**
  `foldCampaigns` folds all countries (no GDPR filter; it is product learning, not
  cross-customer analytics), it is keyed per campaign, and small campaigns (<25
  sample) carry the deleted lead's exact behavioral fingerprint in `state.variants`
  plus raw subject text in variant keys. `forget_lead`/`delete_lead` must
  **refresh the affected campaign's fold synchronously** (re-read surviving
  `emails_sent`/`meetings` for that campaign) — next-nightly is too slow for an
  erasure promise.
- **`lead_score`: delete the row.** Identity-keyed (`lead_id`), cascade handles it;
  `features` jsonb is numeric-only (replies, ai_turns, opens, days_since, intent,
  bounced) with no content.

### 8.8 Deletion cascade (three request types)

1. **`forget_lead(user, lead, suppress=false)` (data-subject memory erasure):**
   transactionally delete `thread_memory` (all rows for ANY thread tied to the lead),
   `ai_classifications`, `owner_alerts`, `emails_sent`, `meetings`, `tracking_events`
   (via emails), `email_threads` content snapshots, audit rows by `lead_id`,
   null/delete `ai_spend_ledger` by `lead_id`; cancel `send_queue` rows first;
   set `forget_at=now()` on **EVERY `email_threads` row with `lead_id = p_lead_id`
   (all gmail threads the lead has accumulated across campaigns/re-engagements,
   not just the current one)** — they survive as tombstones; future NEW threads are
   post-boundary by construction; purge the `saved_businesses` email attribution
   (remove user from `discovered_by`, add to `forgotten_by`, null `email`+`email_*`
   when no contributor remains); if `suppress`, also write a `suppressions` row;
   refresh the campaign's `campaign_learning` fold. Each of `ai_classifications`,
   `owner_alerts`, `audit_events` has **no FK** — these deletes are explicit and
   must not be assumed. Writes an identity-free `audit_events` erasure record
   (event, counts).
2. **`delete_lead(user, lead)` (controller-side removal):** everything in (1) PLUS
   delete the `leads` row (cascades `lead_score`, `emails_sent`, `meetings`,
   `send_queue`, `suppressions`, `email_threads`, `lead_finder` remnants),
   delete the tombstone. Cancel `send_queue` **before** the parent delete.
3. **`delete-account`** (shipped 2026-09-09 as a standalone hotfix ahead of Stage
   8): added explicit `ai_spend_ledger` and `push_queue` deletion by `user_id`,
   explicit `agent_config` user-scoped deletion, **replaced the silent
   `catch (_e) {}` swallow** with fail-before-deleteUser semantics (fetch the auth
   user is kept on partial failure so the account owner can retry; deletes are
   idempotent), and migration `20260909000004` changed
   `ai_spend_ledger.user_id` FK to `ON DELETE CASCADE` (applied + verified
   `confdeltype='c'`). Survivor orphan surfaces closed: `agent_config` user-scoped
   rows and `push_queue` (no-FK) — now both erased explicitly, no orphan-able.
   **Live-proof discovered a real bug (2026-09-09):** postgrest-js RESOLVES with
   `{ error }` on HTTP failures — it does not reject — so a `try/catch`-only loop
   silently swallowed every failing table (the SQL error later surfaced as a 500
   from `deleteUser`'s FK cascade raising the same trigger). Fixed: per-table
   `if (r.error)` check AND `break` on first failure, so the failing table and
   everything after it survive for an idempotent retry. Live proof now green:
   400 + failed-list → user+lead survive → retry 200 → user+rows gone.

### 8.9 Sequencing (Stage 8)

1. Migration `2026........_stage8_memory.sql` (fwd + rollback): `thread_memory`,
   `email_threads.forget_at`, `strategy_state` stale-bucket retirement is a
   learning-loop change (same migration family).
2. `forget_lead` / `delete_lead` RPCs (SECURITY DEFINER, service_role only, partial
   index-safe, returns row counts) — pattern of `set_agent_config`.
3. Memory builder in inbox-agent: consume `thread_memory` in prompts, write via
   `summarize` kind through `openAiCall`, enforce whitelist + timestamp boundary.
   **SHIPPED 2026-09-09:** `_shared/thread-memory.ts` (`summarizeThreadMemory`)
   wired into both inbox-agent scan paths (PHASE 1 first-reply after
   classification; PHASE 2 reply loop after the guards); existing active facts are
   added to both classify prompts via `memoryContextFor`. Reply-draft prompts still
   read thread history directly from Gmail; folding memory into them is a small
   follow-up.
4. learning-loop: bucket retirement + optional eager strategy-cell recompute hook.
5. Harness proof mirroring Stage 6/7 (no real sends, zero leakage assertions).
6. **Open questions (settled before code — 2026-09-09):**
   - per-thread `last_summarized_at` watermark location: **`email_threads`** —
     the thread row is the per-(user,lead) unit (unique(user_id,lead_id)); a
     watermark on `thread_memory` would be duplicated per fact row.
   - campaign_learning refresh inside forget/delete_lead: **SETTLED — deliberate.
     NOT an eager re-fold.** The RPCs **delete** the affected campaigns'
     `campaign_learning` rows synchronously (fingerprint can never linger; absent
     row ⇒ consumers run defaults — same fail-safe-to-no-opinion as every
     staleness path; fold rebuilds at next nightly fold from surviving
     `emails_sent`/`meetings`). A fully in-RPC re-fold is deferred so the fold
     code stays single-sourced in learning-loop (one implementation, no drift).
   - `delete_lead` purges a lead's `saved_businesses` **attribution only** —
     removes the user from `discovered_by`, adds to `forgotten_by`, nulls the
     inferred-email cell when no contributor remains; the business-entity row
     stays (shared map boundary holds).
- UI reachability of `forget_lead` vs account settings: **open — REQUIRED
      FOLLOW-UP (tracked, must not drop off the plan).** RPCs are service_role-only
      today; an authenticated/admin-invokable path (settings UI or a second
      auth-gated RPC wrapper) is a required follow-up, not a quietly deferred
      nicety. Any release notes must carry it until shipped.
- memory-builder review fixes (2026-09-09): `forget_lead`'s suppression write
      used `ON CONFLICT (user_id, lower(email))` but the live unique index is
      `uniq_suppressions_user_plain (user_id, email)` (a later migration replaced
      the expression index) → `42P10`. Fixed to `ON CONFLICT (user_id, email)` and
      re-applied. The stage-8 proof's own first C/D assertion unions were missing
      `as pass` on their first SELECT (column landed under `?column?`); fixed —
      the DB was correct throughout (debug dump proved witness rows intact).
7. **Memory-write proof — PROVEN 2026-09-09:** simulation `26/26`, live `25/25`
   (14/14 core lifecycle + SENSITIVE + KILL-SWITCH addenda).
   Live harness (`scripts/.stage8/prove-memory-live.mjs`) against prod drives the
   real module: template marker via the real `set_agent_config` writer →
   `gate:admin:template` conserve with zero memory/watermark/meter movement; marker
   off reprocesses the SAME skipped slice and writes exactly 3 facts with the
   durable meter debited for kind `summarize` in the current window (real
   `ai_cost_debit`); third call = clean `nothing_new`; real `forget_lead` deletes
   the 3 memory rows (tombstone + audit set); a post-forget message (strictly
   beyond `forget_at`) summarizes alone — pre-boundary content cannot return.
   Zero residue (all fixture tables + auth.users). Honest substitutions (no OAuth
   mailbox / no Groq key in harness): Gmail fetch stub + canned `groqChat`; the
   observational `ai_spend_ledger`/settle legs are the real `groq.ts recordMeter`'s
   job and were not fabricated — the DURABLE debit counter is the routing proof.
8. **Review addenda — SENSITIVE + KILL-SWITCH (2026-09-09):** value governance and
   the dedicated switch (§8.5 layers, §8.6 bullet) — sim `26/26`, live `25/25`.
   Live harness drives a real fixture message containing a phone, an email, and
   $/comma figures through the real module with a BAD canned model that echoes them
   verbatim: the persisted memory row carries none of the identifier bytes (parser
   backstop) and the watermark still advances — the generalization instruction is
the model-side nudge, the sanitizer is the enforceable layer. Kill-switch proven
    live with `ai` budget free: conserve reason `kill_switch`, zero rows, watermark
    AND meter byte-identical before/after (no gate call at all).

## Stage 9 — support-chat cost drain (2026-09-10)

**Finding (gap proof, live pre-fix):** support-chat bundled a pre-meter `_shared`
and wrote ZERO `ai_spend_ledger` rows — not "under-capped", never metered at all.
Its per-identity limits never bind either: the chat REUSES one thread per visitor,
so "60 msgs/thread + 3 threads/day" resets with a self-issued UUID (60 answers per
rotation). 5 real LLM answers left counters/ledger untouched; cleanup verified.

**Fix (migration `20260910000010` + `_shared` + wiring):** the per-user gate cannot
represent anonymous visitors (`ai_cost_state.profile_id` FKs `profiles`, so a
sentinel UUID is impossible) → new single-row global bucket `ai_cost_guest_state`
with `ai_cost_guest_debit`/`ai_cost_guest_settle`, an atomic mirror of the proven
pattern (row-lock, rollover-aware, ceiling, SECURITY DEFINER, service_role only).
`groq.ts` meter settles the guest bucket through the same closure (`context.guest`).
Guest chat → `openGuestAiCall`; signed-in chat → `consume_ai_quota`
(`AI_CHAT_DAILY_CAP`, default 100) THEN the per-user USD pools. Exhaustion is a
graceful canned reply, never an error. Sequencing: sim `30/30` (caught + fixed a
real `hard_stop`→template routing bug), live `19/19` (guest ledger row + bucket
moved $0.0049; ceiling→busy line with zero spend + instant recovery; signed-in
count=1 + user pool moved + count-ceiling→daily line; cascade cleanup).

**Sibling audit (same failure shape: an LLM path leaving the meter entirely):**
source scan is clean — every caller crosses `groqChat`, no direct provider
fetches. BUT the meter lives in the BUNDLE: any function last deployed before the
meter landed (commit `904924e`, 2026-09-10) carried a pre-meter copy.
Deployment-age cross-reference found **four more stale bundles**: `generate-email`
(Aug 29), `suggest-areas` (Aug 30), `tools` (Sep 5), `send-reply` (Sep 9).
Redeployed all four preserving `verify_jwt` flags (gen-email/tools/send-reply
`--no-verify-jwt`; suggest-areas default-on). Post-redeploy: no caller bypasses the
meter; live-confirmed via public `tools`/subjects (a ledger row now lands per AI
call). Residual attribution gap: those four callers pass no `MeterContext`, so the
rows read `fn=unknown kind=generic` (spend VISIBLE but unattributed; their
budget posture is the quota-only one the Stage-0 five-function audit accepted).
**Attribution resolved 2026-09-10:** all four now pass a `MeterContext` —
generate-email `{fn, kind:gen_email, user_id}`, tools `{fn, kind:subjects}`,
suggest-areas `{fn, kind:areas, user_id}`, send-reply `{fn, kind:regen, user_id,
lead_id}`. No reserve/settle (unchanged budget posture) but the spend is
attributed and reconcilable: generate-email/send-reply rows are user-attributed,
so the sweep's ledger-side sum now counts them against the durable USD pool
(pool-ceiling down-step becomes active for them; `consume_ai_quota` remains the
primary count cap). Live proof `11/11`: tools (public), generate-email +
suggest-areas under an ephemeral user (suggest-areas needs a cache MISS —
never-asked niche — to fire the LLM; cached responses legitimately skip both
LLM and meter), user deleted with profile/cost-state/ledger-cleanup verified.
send-reply intentionally NOT live-fired (regeneration sends a real email); it
shares generate-email's exact mechanism (user_id + groqChat context).

**Shared-module staleness sweep (same root cause, 2026-09-10):** every deployed
function's bundle age checked against the last-write of every `_shared` module
it transitively imports (script `scripts/.ops/sweep-shared-staleness.mjs`).
Found 8 stale bundles besides the four: inbox-agent + send-worker (missing the
guest-bucket additions in ai-cost-gate/groq) and an `audit.ts` cohort
(track-open/network-intros/referral-claim/unsubscribe/track-click/gmail-oauth).
All eight redeployed preserving `verify_jwt`; sweep now reports 0 stale across
all 24 functions. Codified in AGENTS.md (shared-module bundling hard rule).

**Accepted residual + REVISIT ITEM:** the guest wall is a single SHARED bucket —
one bad actor can exhaust it and degrade the widget for every simultaneous visitor
that day, not just themselves. Bounded to `$0.10`/day (env `AI_GUEST_POOL_DAILY`,
tuneable) and irrelevant at today's zero-traffic, but MUST be revisited with
**per-IP (or per-session) buckets as soon as real guest volume exists** — before
launch marketing.