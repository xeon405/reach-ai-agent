### 4.2 Statistical learning engine

**File:** `supabase/functions/learning-loop/index.ts` — the single writer for the intelligence layer.

#### Gates

| Constant | Value | Meaning |
|---|---|---|
| `MIN_SAMPLE` | **25** | sends per A/B variant |
| `MIN_DELTA` | **0.03** | winner's reply-rate lead over runner-up |
| `OPENER_MIN_SENT` | **15** | sends per opener angle |
| `OPENER_MIN_LIFT` | **0.05** | lead over the campaign's own average |
| `SEQ_DEAD_MIN_SENT` | **20** | sends on a step with **zero** replies |
| `REPLY_STYLE_MIN_CONV` | **15** | conversations per reply shape |
| `REPLY_STYLE_MIN_LIFT` | **0.05** | lead over the campaign's booking rate |
| `MIN_SAMPLE_AGG` | **30** | noise floor for global aggregates |
| `MIN_PUBLISH_CELL` | **5** | de-identification floor |

The gates are deliberately unequal. The opener gate is looser than A/B because a campaign spreads sends across about seven angles, so 25 per angle would mean ~175 sends before any learning. It is stricter than "whoever replied once" because one reply is noise. The dead-tail gate is extreme (20 sends, zero replies) because cutting a working follow-up costs money, while keeping a dead one only costs volume.

#### Three folds, three cadences

| Fold | Table | Cadence | Window | Input |
|---|---|---|---|---|
| Lead scoring | `lead_score` | hourly | 30 days | `emails_sent`, `ai_classifications`, bounces |
| Campaign fold | `campaign_learning` | nightly 02:00 UTC | 60 days | sends, meetings, bounces |
| Strategy fold | `strategy_state` | Sunday 02:00 UTC | 7 days | sends, lead category/country |

#### Lead score (methodology v1)

```text
score = 0.30 · recency
      + 0.35 · reply_engagement   (replies / 3, clamped)
      + 0.15 · ai_turns           (turns / 4, clamped)
      + 0.10 · opens              (opens / 2, clamped)
      + 0.10 · intent             (booking=1, interested=0.5, else 0)

tier: A ≥ 0.55 · B ≥ 0.35 · C ≥ 0.15 · D below
```

Deterministic, auditable, no ML. Expires after 24 hours; stale means "no opinion", not "score zero".

#### Four learners and their consumers

| Learner | Producer | Consumer | Gate |
|---|---|---|---|
| Opener angle | `opener_hint` | `send-worker` → `getOpenerHint` → `openerByKey` | 15 sends/angle, +5 pts |
| Subject A/B | `winner_variant` | `send-worker` → `getSubjectHint` | 25/variant, +3 pts |
| Follow-up tail | `next_sequence_hint` | `send-worker` → `getSequenceCutoff` | 20 sends, zero replies |
| Reply shape | `reply_style_winner` | `inbox-agent` → `getReplyStyleWinner` | 15 conversations, +5 pts |

Opener choice is deterministic per lead+step via FNV-1a (`ai-lib.ts:35`), so a retry cannot silently switch the experiment arm.

The three reply shapes (`reply-styles.ts`) are `answer_first`, `detail_first`, `question_first`.

#### Privacy in `strategy_state`

No user, lead, or campaign identity. Two filters before any bucket:

1. **GDPR exclusion** — EU/UK and unknown countries are dropped; unknown is excluded conservatively because non-EEA status cannot be proven.
2. **Cell floors** — ≥30 events and no cell below 5.

#### Fail-safe semantics

- The fold only upserts. A failed write means "no row", and consumers fall back to the baseline.
- Consumers read through `getKillSwitch("campaign_learning.enabled")`, scoped `glob → user → campaign`.
- Hints are advisory. Volume stays with `reserve_send_slot`; order is the only thing a score may change.
- Nothing here can raise a cap, unblock an account, or send an email.

#### What it is not

- Not model training. No weights change.
- Not cross-campaign. Each campaign learns alone.
- Not applicable to body copy.
- **Currently empty of eligible data**: 6 historical sends predate tagging (`opener_key` 0/6, `reply_style` 0/6).

### 4.3 Intent routing and the agent

**Files:** `_shared/agent-router.ts`, `agent-capabilities.ts`, `agent-understand.ts`, `agent-executor.ts`, `agent-learning.ts`, `agent-pending.ts`, `agent-profile.ts`, `functions/agent/index.ts`.

#### Two lanes

```
message → normalise → routeIntent()  (pure, no I/O, no AI)
                         ├─ match  → FAST lane: DB query / action
                         └─ miss   → SLOW lane: LLM reads meaning
                                      └─ result cached as a learned phrase
```

Normalisation: lowercase, NFD accent stripping, punctuation → space, whitespace collapse. Country extraction accepts names and ISO codes, with a guard so `"dentists in uae"` does not read the standalone `"in"` as India.

Intent definitions live in **one** registry (`GOALS`), which also marks each intent `write: true|false`. Two sources of truth for "is this a write?" is how a safety property quietly stops being true.

#### Write safety

- The agent **cannot send email**. It prepares; the user launches.
- Writes require `preflightWrite` and a server-checked confirmation.
- Pending actions live in `agent_pending_state`, not in model context.
- Confirmation tokens are single-use (`agent_messages.executed_at`).
- `action-budget.ts` caps actions per turn; `agent_action_state` is the step budget that a dollar budget cannot bound.

#### Learned vocabulary

`agent_learned_phrases` is per-account. A phrasing is promoted from one chat to the account only after it appears in a **second, different** conversation. A mapping that produces nothing is retired immediately and the wording returns to the slow lane.

#### Persistent context

- `agent_profile` stores durable facts the owner described.
- `agent_pending_state` survives a clarifying question.
- `agent-account-context.ts` loads live account facts (plan, usage, Gmail state) each turn.
- `thread-memory.ts` stores facts only, never raw transcript.

#### Model orchestration

- `groq.ts` tries a primary model, then models with separate TPM pools on 429.
- `model_version` is recorded on every call.
- `policy.ts` is the only component allowed to decide an action; the model only classifies.

### 4.4 Deliverability engine

#### Enqueue

`send-campaign` only enqueues. It validates:

- not suppressed, bounced, or unsubscribed;
- syntax, MX/A/AAAA existence;
- disposable/throwaway domains hard-fail;
- placeholder addresses hard-fail;
- duplicate leads within the campaign;
- plan lead and campaign caps.

`priority` is seeded from a fresh `lead_score` (default 0.5). This is the only place score affects order.

#### Claim

```sql
WITH claimable AS (
  SELECT id FROM send_queue
  WHERE (status='pending' AND (next_retry_at IS NULL OR next_retry_at <= now()))
     OR (status IN ('claimed','processing') AND coalesce(lease_until, now()-interval '1 hour') < now())
     OR (status='failed' AND next_retry_at IS NOT NULL AND next_retry_at <= now())
  ORDER BY (CASE WHEN created_at < now()-interval '2 days' THEN 1.0 ELSE priority END) DESC,
           created_at
  FOR UPDATE SKIP LOCKED
  LIMIT p_limit
)
UPDATE send_queue SET status='claimed', attempts=attempts+1,
  lease_until=now()+(p_lease_minutes||' minutes')::interval
FROM claimable WHERE send_queue.id=claimable.id
RETURNING send_queue.*;
```

- `SKIP LOCKED` gives disjoint claims without waiting.
- `lease_until` recovers a dead worker.
- Jobs older than 2 days are promoted (starvation guard) but never above a live priority.
- `attempts` increments at claim, so a poison job cannot loop forever.

#### Send

Per job: read score (advisory) → resolve Gmail context → `reserve_send_slot` → generate with hints → send → write `emails_sent` + audit → on failure `release_send_slot` and back off.

`slotHeld` guards the release path, including the `catch` branch.

#### Warm-up and reputation

```text
warm cap = min(plan.daily, 5 + days_since_connect × 5, ceiling)
ceiling  = 500 (consumer Gmail) | 2000 (Workspace)
```

Nightly `reputation-report`:

| Condition | Transition |
|---|---|
| bounce > **3%** or unsubscribe > **1%** | `recovery`, cap = max(5, floor(previous/2)) |
| clean night in recovery | +10%/night |
| **7** clean nights | exit to `steady` |

The cap can never exceed the warm cap. A missing or stale ledger falls back to the plain ramp — it can never raise a cap or block a send. Fewer than 5 sends is recorded as a baseline, not a rate.

#### Bounce and opt-out

`email-events` (SendGrid):

```
bounce | dropped   → BOUNCED + suppression + queue cancel + alert + audit
spamreport         → UNSUBSCRIBED + conv_mode=PAUSED + suppression + alert
unsubscribe/group  → same as spam
```

Idempotent: an already-bounced or already-unsubscribed lead is skipped.

**Correction to a common assumption:** there is no "pause at >3 bounces". The brake is on **rates**, because 3 bounces out of 10 and 3 out of 3,000 are different events. `suppressions` is the absolute stop for an address; the cap is the absolute stop for a mailbox.

#### Pre-send scoring

`spam-check` is deterministic: ALL-CAPS subject words, `!!!`/`$$$`, fake `Re:`/`Fwd:`, spam lexicon, "Dear Sir/Madam", >3 links, uppercase ratio, word count. It returns 0–100 and severity-tagged issues. It advises; it never blocks.

#### Tracking and unsubscribe

- `track-open` (1×1 pixel) and `track-click` (redirect) write `tracking_events`.
- `unsubscribe` supports one-click RFC 8058 and reply keywords.
- Suppression is enforced at three levels: lead flags, `suppressions` (with triggers blocking queue/sent inserts), and worker re-checks.
