# OutshipAi — Technical Architecture Breakdown

**Verified against:** live Supabase project `zvohdvopmvzsujktrdmu`, branch `main`, 84 forward migrations, 36 deployed Edge Functions, 51 tables, 43 SQL functions, 34 RLS policies, 13 triggers, 2 views.

---

## 0. Scope correction (read this first)

The brief asks for a **Next.js frontend** and a **FastAPI backend**. Neither exists in this codebase, and presenting them would be false. The real stack is:

| Layer | Actual implementation |
|---|---|
| Frontend | **TanStack Start** (SSR) + React 19 + Vite 7 + TanStack Router/Query + Tailwind 4 + Radix/shadcn |
| Mobile shell | Capacitor Android wrapper over the same web app |
| Backend | **Supabase Edge Functions** — 36 stateless Deno/TypeScript functions, not FastAPI microservices |
| Database | **PostgreSQL 17.6** (Supabase) — the coordination layer, not just storage |
| Auth | Supabase Auth (GoTrue), JWT, Gmail OAuth 2.0 |
| LLM | Groq-hosted models with per-model TPM fallback |
| Email transport | The **user's own Gmail account** via Gmail API (no shared system mailer) |
| Payments | Razorpay Orders + signed webhook |

There is no Redis, no message broker, no separate worker service, and no container orchestration. **Postgres is the queue, the lock manager, the rate limiter, and the policy engine.** That is the single most important architectural decision in the system, and most of the correctness properties below follow from it.

Three claims in the brief also need correcting against measured behaviour:

1. The A/B gate is **25 sends per variant**, not 15–20. 15 is the opener gate; 20 is the dead-follow-up gate; 15 conversations is the reply-style gate.
2. Bounce/complaint handling is **rate-based over 7 days**, not "pause at >3 bounces / >1 complaint". A 3% bounce rate or 1% unsubscribe rate pushes the mailbox into `recovery`, which halves the daily cap (floor 5) — it does not stop sending.
3. The learning layer is **per-campaign frequentist statistics**, not model training. Nothing is fine-tuned.

---

## 1. System overview

```
                          ┌──────────────────────────────┐
                          │  Browser / Android WebView   │
                          │  TanStack Start + React 19   │
                          └──────────────┬───────────────┘
                                         │ HTTPS (JWT)
                          ┌──────────────▼───────────────┐
                          │      Supabase Platform       │
                          │  Auth · PostgREST · Realtime │
                          └──────────────┬───────────────┘
                                         │
        ┌────────────────────────────────┼────────────────────────────────┐
        │                                │                                │
┌───────▼────────┐              ┌────────▼─────────┐            ┌─────────▼────────┐
│ 36 Edge        │              │   PostgreSQL     │            │  pg_cron         │
│ Functions      │◄────────────►│   51 tables      │◄───────────│  10 schedules    │
│ (Deno, stateless)             │   43 functions   │            │  net.http_post   │
└───┬───┬───┬────┘              └──────────────────┘            └──────────────────┘
    │   │   │
    │   │   └──────────► Groq (LLM)  · Google Maps / OSM · SendGrid events
    │   └──────────────► Gmail API (user's mailbox)
    └──────────────────► Razorpay (orders + webhook)
```

### Why serverless functions instead of a FastAPI service

The workload is bursty, cron-driven, and per-user. Every function is stateless, which means:

- horizontal scale is the platform's problem, not ours;
- there is no process to restart, no connection pool to exhaust;
- the only shared mutable state is Postgres, so correctness does not depend on sticky sessions;
- a function crash cannot corrupt in-memory state, because there is none.

The cost of this choice is that **every concurrency control must be expressed in SQL**. That constraint is visible throughout §4.

---

## 2. Request lifecycle

### 2.1 Frontend

- `src/routes/_authenticated.tsx` is a pathless layout that enforces session + onboarding gates before any child route renders.
- `src/routes/_authenticated/admin.tsx` is additionally gated by `is_admin()` — checked server-side, never by hiding a nav item.
- Data access goes through the Supabase client under RLS. There is no custom REST layer for CRUD; PostgREST is the API.
- Mutations use TanStack Query invalidation; no global client store, because the database is the source of truth.
- 33 route files: 16 authenticated, 17 public (marketing, legal, auth callbacks, unsubscribe).

### 2.2 Edge function contract

Every function follows the same shape:

1. `OPTIONS` → CORS preflight.
2. Authentication: either a verified Supabase JWT (`admin.auth.getUser`), or a shared secret (`x-cron-secret`), or a provider signature (Razorpay/SendGrid).
3. Input validation before any database write.
4. Service-role Supabase client (bypasses RLS) — used only after the caller has been resolved server-side. **A `user_id` in a request body is never trusted.**
5. Audit row on every state-changing action.
6. JSON response with an explicit status; errors never leak internals unless a debug header matches a secret.

Webhook functions (`razorpay-webhook`, `email-events`, `calendly-webhook`) are deployed `--no-verify-jwt` because providers cannot present a Supabase JWT. They compensate with signature verification or shared secrets.

---

## 3. Data model and invariants

51 tables. Grouped by responsibility:

| Domain | Tables |
|---|---|
| Identity / plans | `profiles`, `plan_limits`, `usage_limits`, `admins`, `admin_actions` |
| Anti-abuse | `domains`, `signup_signals` |
| Leads | `leads`, `lead_score`, `lead_refresh`, `saved_businesses`, `lead_finder_caches` |
| Campaigns | `campaigns`, `follow_up_sequences`, `send_queue`, `emails_sent` |
| Inbox | `inbound_emails`, `email_threads`, `thread_memory`, `ai_classifications`, `suppressions` |
| Learning | `campaign_learning`, `strategy_state`, `opener_performance`, `reply_style_performance` |
| Deliverability | `sender_health`, `health_state`, `tracking_events`, `owner_alerts` |
| Agent | `agent_conversations`, `agent_messages`, `agent_learned_phrases`, `agent_pending_state`, `agent_profile`, `agent_action_state`, `agent_config` |
| Cost | `ai_cost_state`, `ai_cost_guest_state`, `ai_spend_ledger`, `google_search_usage` |
| Billing | `payments`, `billing_events`, `referrals` |
| Ops / audit | `audit_events` (~167k rows), `gmail_tokens`, `push_queue`, `push_subscriptions` |

### Invariants that are enforced by the database, not by code

| Invariant | Mechanism |
|---|---|
| One user → many domains; one **verified** domain → exactly one user | Partial unique index `domains_verified_domain_uniq ON (lower(domain)) WHERE verified_at IS NOT NULL` |
| Duplicate (user, domain) rows impossible | `domains_user_domain_uniq (user_id, lower(domain))` |
| Every send decrements a hard quota exactly once | Atomic `UPDATE` inside `reserve_send_slot` |
| No two workers send the same job | `FOR UPDATE SKIP LOCKED` in `claim_queue_jobs_v2` |
| No two workers follow up the same lead | CAS update `followup_status: active → sending` |
| Plan and domain flags cannot be self-elevated | `guard_protected_profile_cols()` BEFORE UPDATE trigger |
| Duplicate business flag cannot be laundered by editing a typo | Flag is never cleared by the trigger; only domain verification or an admin clears it |
| One account cannot claim an already-verified domain | `domains` check excludes own row, then unique index is the final arbiter |
| Webhook replay cannot upgrade twice | `payments` status transition + `billing_events` dedup |

`emails_sent` carries the attribution columns that make learning possible: `variant`, `opener_key`, `reply_style`, `sequence`, plus `decision_id`, `model_version`, `strategy_ref` on `audit_events`.

---

## 4. Anti-abuse and security architecture

### 4.1 The single choke point: `reserve_send_slot`

**File:** `supabase/migrations/20261101000001_anti_abuse_mvp.sql`, extended by `20261101000002` and `20261101000005`.

Every outbound email — first touch, follow-up, replay — passes through this function. It is the only writer of `profiles.emails_sent_today` and `emails_sent_total`.

```sql
UPDATE public.profiles SET
  emails_sent_date  = current_date,
  emails_sent_today = CASE WHEN emails_sent_date = current_date
                           THEN coalesce(emails_sent_today,0) + 1 ELSE 1 END,
  emails_sent_total = coalesce(emails_sent_total,0) + 1
WHERE id = p_user
  AND coalesce(btrim(company),'') <> ''
  AND public.is_plausible_business_address(business_address)
  AND (CASE WHEN emails_sent_date = current_date
            THEN coalesce(emails_sent_today,0) ELSE 0 END) < p_cap
  AND (v_lifetime IS NULL OR coalesce(emails_sent_total,0) < v_lifetime)
  AND (NOT domain_required OR domain_verified)
RETURNING true INTO v_ok;
```

Why this exact shape matters:

- **One statement = one row lock.** Postgres serialises concurrent `UPDATE`s on the same `profiles` row. Two workers cannot both read `9` and both write `10`.
- **Rejection is free.** If any predicate fails, zero rows are updated. A blocked account cannot burn quota by retrying.
- **No second source of truth.** The cap is not checked in the worker "as well". `send-worker` only asks "did I get a slot?" (`index.ts:544`, `:1065`).
- **The lifetime cap uses the same row.** `emails_sent_total` is monotonic; there is no daily reset path that can resurrect it.
- **Identity is a send-time gate, not a form field.** Calling the API directly with an empty `company` returns `false` from the same statement.

`release_send_slot` exists for the failure path: a reserved slot is returned when the send throws or the Gmail token is missing, so a transient error does not permanently consume a customer's quota.

**Known limitation, stated honestly:** if the worker process is killed between reservation and `release_send_slot`, the slot stays consumed. The cap is conservative in the safe direction (a customer loses one email, never gains one). A lease-based reservation table would fix it; it is not implemented.

### 4.2 Free tier numbers

| Plan | Daily | Lifetime | Leads | Campaigns |
|---|---|---|---|---|
| free | 10 | **50** | 25 | 1 |
| starter | 50 | unlimited | 250 | 1 |
| growth | 200 | unlimited | 1000 | 5 |
| agency | 500 | unlimited | 5000 | unlimited |

`lifetime_emails` is `NULL` for paid plans. The free cap is seeded from actual history on migration, so existing accounts do not receive a fresh 50.

### 4.3 Explaining refusal: `send_block_reason(uuid)`

A read-only `SECURITY DEFINER` function returns one of:

```
domain_required | business_identity_required | lifetime_limit | daily_limit | NULL
```

The UI calls this instead of guessing. Precedence is deliberate: identity → duplicate challenge → lifetime → daily, because the earliest condition is the one the user can actually fix.

### 4.4 Street-level address validation

**SQL:** `is_plausible_business_address(text)` — `IMMUTABLE`.
**TS mirror:** `src/lib/address.ts`, with 24/24 parity tests.

Rules, in order:

1. `NULL` → false.
2. Fewer than 12 characters after trim → false ("Mumbai" fails).
3. No alphabetic character → false ("400001" fails).
4. Contains a digit → true (a building number is the strongest signal).
5. Contains a street-type word (`street|st|road|rd|avenue|…|nagar|colony|marg|chowk|…`) → true.
6. Otherwise → false.

Design justification: a country name alone is not an address; a city alone is not an address; but a real address in any of the supported languages must pass. Step 4 prevents over-rejection of addresses like `12 MG Road`; step 5 prevents over-rejection of `Nagar, Pune` while still rejecting `India`. The function is used in three places — the trigger-free form check, `reserve_send_slot`, and the admin console — from one definition.

### 4.5 Duplicate-business challenge

**Function:** `flag_duplicate_business()`, BEFORE UPDATE OF `company, business_address`.

Flow:

```
Account A signs up with (Brand X, 12 MG Road)
        │
        ├─ first with that exact pair → never challenged
        │
Account B signs up with (Brand X, 12 MG Road)
        │
        ▼
BEFORE UPDATE trigger: exact match on lower(btrim(...)) against an
account created earlier
        │
        ▼
B.domain_required = true  →  reserve_send_slot returns false
        │
        ├─ B proves DNS control  → domain_verified = true → sends resume
        └─ B cannot prove it     → stays blocked; admin may clear manually
```

Properties:

- **Exact match, deliberately not fuzzy.** `St` ≠ `Street`; neighbours in one building are not blocked.
- **First account wins.** The query requires `created_at <= NEW.created_at` and `id <> NEW.id`.
- **Sticky.** Editing the company name does not clear the flag; otherwise a typo edit would launder it.
- **Only runs when the identity fields change**, so ordinary profile saves do not re-query.
- The flag grants nothing. It only blocks until proof arrives.

### 4.6 Domain verification: DNS TXT, not a text box

**File:** `supabase/functions/domain-verify/index.ts`.

```
POST {action:"start", domain}
  ├─ normalize: strip scheme, path, port, www, trailing dot
  ├─ reject non-registrable strings
  ├─ reject freemail (gmail.com, outlook.com, …) — you cannot own gmail.com
  ├─ reject a domain VERIFIED to another user (message does not reveal who)
  ├─ generate 16 random bytes → "outshipai-<32 hex>"
  └─ return exact record: TXT _outshipai.<domain> = <token>

POST {action:"check", domain}
  ├─ query Google DoH, then Cloudflare DoH (two resolvers)
  ├─ concatenate split TXT strings, strip quotes
  ├─ compare against the stored token for THIS user
  └─ on match: verified_at = now(); domain_required = false
```

Why DNS instead of an email link:

- OutshipAi has **no system mailer**. Every email leaves through the customer's own Gmail. Adding Resend/Postmark to send one verification link would add a paid dependency and a new failure mode to prove something DNS proves better.
- It works for businesses with no `admin@` mailbox.
- It is unforgeable without actual control of the zone.

Why two resolvers: a single resolver outage must not make a legitimate customer look like a fraudster. The loop returns on the first provider that answers with records.

Security notes:

- `user_id != me` in the "already taken" check. Without it, the caller's own verified row counted as taken and the legitimate owner was told the domain was unavailable.
- The unique partial index is the final arbiter under concurrency: two simultaneous `check` calls can both pass the SELECT, but only one INSERT/UPDATE survives.
- Early-return paths were fixed to always clear `domain_required`, so verification cannot succeed while leaving the account blocked.

### 4.7 Signup signals: observe, never block

**Table:** `signup_signals(id, user_id, device_id, ip_hash, user_agent, created_at)`.

- `ip_hash` is a hash, not a raw IP.
- RLS enabled with **zero policies** and `REVOKE ALL FROM anon, authenticated`: clients cannot read or write it. Only `service_role` and `SECURITY DEFINER` functions touch it.
- Recording happens in `signup-signal`, called at signup.
- The admin console aggregates it into **clusters**: several accounts on one device, or one IP. That is a human review signal, not an automated block.

This is a deliberate product decision: device/IP blocking punishes shared offices, families, and CGNAT users. Flagging keeps the evidence and leaves the judgement to a person.

### 4.8 Protected profile columns

**Migration:** `20261101000003`.

The "own profile update" RLS policy allows updating *any* column on the row, including `plan`, `domain_required`, and `domain_verified`. A single REST call would have cleared the duplicate challenge. The fix is a BEFORE UPDATE trigger that restores protected columns unless `current_user` is `service_role`, `postgres`, or `supabase_admin`.

Deliberately **not** protected:

- `emails_sent_today` / `emails_sent_total` — `reserve_send_slot` is `SECURITY INVOKER` and runs as the user; guarding them would break sending. Lowering them also gains nothing, because the cap is compared against the same number on every send.
- `company` / `business_address` — the user must be able to correct them. The flag itself is sticky and is not cleared by editing.

**Trigger ordering matters.** Postgres fires same-event triggers in name order, and only constraint triggers accept `FOLLOWS`. The guard is named `trg_a_guard_protected_profile_cols` so it sorts before `trg_flag_duplicate_business`. If either is renamed, the guard could run second and undo the flag. This is documented in the migration itself.

### 4.9 Admin console: separate authority, audited, reversible

**Migration:** `20261103000001`.

- `admins(user_id)` is a separate table. `profiles.is_admin` does not exist and is not used.
- `is_admin()` is `STABLE SECURITY DEFINER`, `search_path = public`, and returns `EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid())`.
- `admin_console()` raises `not_admin` (SQLSTATE `42501`) before returning any data.
- `admin_flag()` / `admin_clear_flag()` write `admin_actions` with the actor, target, note, and timestamp.
- No delete or suspend action exists in the UI. Every action is a flag, and every flag is reversible.
- The `/admin` route is exempt from the onboarding guard, because an admin may need to inspect an account that has not completed onboarding.

Verified over real HTTP: `admin_console` → 200 for an admin, 403 `not_admin` after removing the row; `admin_flag` → 204; flag/clear/audit all persist.

---

## 5. Statistical learning and A/B engine

**File:** `supabase/functions/learning-loop/index.ts`. Single writer for the intelligence layer.

### 5.1 Gates (exact, exported for the simulation harness)

| Constant | Value | Meaning |
|---|---|---|
| `MIN_SAMPLE` | **25** | per-variant sends before an A/B winner may be declared |
| `MIN_DELTA` | **0.03** | winner's reply-rate lead over runner-up |
| `OPENER_MIN_SENT` | **15** | sends per opener angle |
| `OPENER_MIN_LIFT` | **0.05** | lead over this campaign's own average |
| `SEQ_DEAD_MIN_SENT` | **20** | sends on a step, with **zero** replies, before the tail is called dead |
| `REPLY_STYLE_MIN_CONV` | **15** | conversations per reply shape |
| `REPLY_STYLE_MIN_LIFT` | **0.05** | lead over the campaign's own booking rate |
| `MIN_SAMPLE_AGG` | **30** | statistical noise floor for global aggregates |
| `MIN_PUBLISH_CELL` | **5** | de-identification floor; no cell below 5 is published |

Each gate has a written justification in the source. The opener gate is looser than the A/B gate because a campaign spreads sends across ~7 angles, so 25/angle would mean ~175 sends before any learning. It is stricter than "whoever replied once" because one reply is noise.

### 5.2 Three folds, three cadences

| Fold | Table | Cadence | Input |
|---|---|---|---|
| Lead scoring | `lead_score` | hourly | 30-day `emails_sent`, `ai_classifications`, `email.bounced` |
| Campaign fold | `campaign_learning` | nightly 02:00 UTC | 60-day sends, meetings, bounces |
| Strategy fold | `strategy_state` | Sunday 02:00 UTC | 7-day sends, lead category/country |

Only leads with ≥1 send or intent signal get a `lead_score` row. Absence means "no opinion", not "score zero".

### 5.3 Lead score (methodology v1, deterministic)

```text
score = 0.30 · recency
      + 0.35 · reply_engagement   (replies / 3, clamped)
      + 0.15 · ai_turns           (turns / 4, clamped)
      + 0.10 · opens              (opens / 2, clamped)
      + 0.10 · intent             (booking=1, interested=0.5, else 0)

tier: A ≥ 0.55 · B ≥ 0.35 · C ≥ 0.15 · D below
```

No ML, no LLM. Deterministic and auditable: given the same rows, the same score. It expires after 24 hours and is treated as stale beyond that.

### 5.4 Campaign fold output

`campaign_learning.state` (jsonb) contains:

- `variants` — per-key `{sent, replied, opened, reply_rate, open_rate, meets, bounces}`
- `winner_variant` — only past 25/variant and 3-point lead
- `opener_hint`, `opener_winner`, `opener_sample`
- `next_sequence_hint`, `sequence_sample`
- `reply_style_hint`, `reply_style_winner`, `reply_style_sample`
- `min_sample`, `min_delta`, `last_folded_at`

Version increments on every fold, so hints can be attributed (`strategy_ref(campaign_id, version)`).

### 5.5 The four learners and their consumers

| Learner | Producer | Consumer | Gate |
|---|---|---|---|
| Opener angle | `campaign_learning.opener_hint` | `send-worker` → `getOpenerHint` → `openerByKey` | 15 sends/angle, +5 pts |
| Subject A/B | `campaign_learning.winner_variant` | `send-worker` → `getSubjectHint` | 25/variant, +3 pts |
| Follow-up tail | `next_sequence_hint` | `send-worker` → `getSequenceCutoff` | 20 sends, zero replies |
| Reply shape | `reply_style_hint` / `reply_style_winner` | `inbox-agent` → `getReplyStyleWinner` | 15 conversations, +5 pts |

Two SQL views exist for inspection: `opener_performance` and `reply_style_performance`. They are read-only projections, not the source of truth.

Opener selection is deterministic per lead+step via FNV-1a (`ai-lib.ts:35`): the same seed returns the same angle, so retries do not silently change the experiment arm.

### 5.6 Strategy fold and privacy

`strategy_state` never holds user, lead, or campaign identity. Two filters run before any bucket is written:

1. **GDPR exclusion** — EU/UK country ISO codes, and unknown/null countries, are dropped. Unknown is excluded conservatively because non-EEA status cannot be proven.
2. **Cell floors** — a bucket needs ≥30 events (`MIN_SAMPLE_AGG`) and no count cell below 5 (`MIN_PUBLISH_CELL`).

### 5.7 Fail-safe semantics

- The fold only upserts. A failed write degrades to "no row", and consumers fall back to the unchanged baseline.
- Consumers read through `getKillSwitch("campaign_learning.enabled")`, scoped `glob → user → campaign`, most specific wins.
- Hints are **advisory**. Volume limits remain owned by `reserve_send_slot`; priority shaping happens only at enqueue and claim.
- Nothing in this layer can raise a cap, unblock a flagged account, or send an email.

### 5.8 What it is not

- Not model training. No weights change.
- Not cross-campaign. Each campaign learns alone.
- Not applicable to email body copy. The body is generated per lead; only opener angle, subject variant, follow-up length, and reply shape are learned.
- Currently **empty**: 6 historical sends predate the tagging columns (`opener_key` 0/6, `reply_style` 0/6), so the true sample is zero. The pipeline is correct; the data does not exist yet. ~50 sends in one campaign is the first visible change; 150+ for reply style.

---

## 6. Intent routing and prompt orchestration

**Files:** `_shared/agent-router.ts`, `_shared/agent-capabilities.ts`, `_shared/agent-understand.ts`, `_shared/agent-executor.ts`, `functions/agent/index.ts`.

### 6.1 Two lanes

```
User message
    │
    ▼
routeIntent()  ── deterministic, pure, zero I/O, zero AI ──┐
    │                                                     │
    ├─ match ──────────────► FAST lane: DB query / action  │
    │                        (repeat wording is free)      │
    │                                                     │
    └─ no match ───────────► SLOW lane: LLM reads meaning  │
                             then result is cached as a    │
                             learned phrase for this scope │
```

The router is deliberately pure: no imports, no Deno globals, no I/O. That is what allows the same file to run under the Node test harness and stay honest about what ships.

Normalisation: lowercase, NFD accent stripping, punctuation → space, whitespace collapse. Country extraction accepts names and ISO codes, with a guard so `"dentists in uae"` does not read the standalone `"in"` as India.

`routeIntent` returns `{intent, params, summary}` or `null`. Intent definitions live in **one** registry (`GOALS`), which also marks each intent `write: true|false`. Two sources of truth for "is this a write?" is how a safety property quietly stops being true.

### 6.2 Write safety

- The agent **cannot send email**. It prepares; the user launches.
- Every write intent goes through `preflightWrite` and requires a server-checked confirmation. The pending action is stored in `agent_pending_state`, not in the model's context.
- Confirmation tokens are single-use (`agent_confirm_single_use` migration).
- `action-budget.ts` caps how many actions one turn may request.
- The LLM may be creative about **understanding**; it is never trusted with data or real numbers.

### 6.3 Learning the user's vocabulary

`agent_learned_phrases` is per-account. A wording is promoted from one conversation to the whole account only after it is used in a **second, different** conversation. A mapping that produces nothing is retired immediately and the wording returns to the slow lane. This prevents one ambiguous phrasing from permanently hijacking the router.

### 6.4 Model orchestration

- `_shared/groq.ts` tries a primary model, then falls back to models with **separate TPM pools** on 429. Groq rate-limits per key *and* per model, so a burst on one model does not take the feature down.
- `model_version` is recorded on every call, so any output can be traced to the model that produced it.
- `_shared/policy.ts` holds the reply policy; `_shared/thread-memory.ts` holds per-thread context. Both are bounded and injected, not appended indefinitely.

---

## 7. Deliverability pipeline

### 7.1 Enqueue (`send-campaign`)

`send-campaign` **only enqueues**. Sending lives entirely in `send-worker`.

Eligibility gates at enqueue (the worker re-checks all of them):

- lead not suppressed, not bounced, not unsubscribed;
- email syntax + MX/A/AAAA existence (`_shared/email-verifier.ts`);
- disposable/throwaway domains hard-fail;
- placeholder/dummy addresses hard-fail;
- duplicate lead detection within the campaign;
- plan lead cap and campaign cap.

Queue rows carry `priority` seeded from a fresh `lead_score` (default 0.5). This is the only place score influences order; it cannot raise volume.

### 7.2 Claim (`claim_queue_jobs_v2`)

```sql
WITH claimable AS (
  SELECT id FROM send_queue
  WHERE (status='pending'  AND (next_retry_at IS NULL OR next_retry_at <= now()))
     OR (status IN ('claimed','processing') AND coalesce(lease_until, now()-interval '1 hour') < now())
     OR (status='failed' AND next_retry_at IS NOT NULL AND next_retry_at <= now())
  ORDER BY (CASE WHEN created_at < now()-interval '2 days' THEN 1.0 ELSE priority END) DESC,
           created_at
  FOR UPDATE SKIP LOCKED
  LIMIT p_limit
)
UPDATE send_queue q
SET status='claimed', attempts=attempts+1,
    lease_until=now()+(p_lease_minutes||' minutes')::interval
FROM claimable c WHERE q.id=c.id
RETURNING q.*;
```

Properties:

- `SKIP LOCKED` means N workers claim disjoint sets without waiting.
- `lease_until` is the crash recovery mechanism: a dead worker's claim becomes claimable again.
- Jobs older than 2 days are promoted to the front (starvation guard) but never above a live priority.
- `attempts` is incremented at claim, so a poison job cannot loop forever.

### 7.3 Send (`send-worker`)

Per claimed job:

1. Read lead score (advisory; stale/missing → null, still sends).
2. Resolve user context: Gmail connected, token decryptable, plan, warm-up cap.
3. `reserve_send_slot`. If false → defer 1 hour, status back to `pending`. **No quota is consumed.**
4. Generate the email using hints: opener angle, subject variant, sequence cutoff, reply style.
5. Send via the user's Gmail API.
6. On success: `emails_sent` row, audit `email.sent`, advance follow-up.
7. On failure: `release_send_slot`, increment attempt, exponential backoff via `next_retry_at`, dead-letter after max attempts.

`slotHeld` guards the release path, including the `catch` branch, so a thrown exception does not inflate the cap.

### 7.4 Warm-up and reputation brake

**File:** `_shared/sender-health.ts`.

```text
warm cap = min(plan.daily, 5 + days_since_connect × 5, ceiling)
ceiling  = 500 (consumer Gmail) | 2000 (Workspace)
```

Nightly `reputation-report` computes 7-day rates and drives a deterministic state machine:

| Condition | Transition |
|---|---|
| bounce rate > **3%** or unsubscribe rate > **1%** | `recovery`: cap = max(5, floor(previous/2)) |
| clean night while in recovery | +10% per night toward the warm cap |
| **7** consecutive clean nights | exit to `steady`, cap = warm cap |

Hard guarantees:

- `current_cap` can never exceed the warm cap. The brake only tightens.
- A missing or stale `sender_health` row falls back to the plain warm-up formula — it can never raise a cap or block sending.
- Measurements with fewer than 5 sends are recorded as a baseline, not used to declare a rate.

### 7.5 Bounce, complaint, and opt-out handling

**File:** `functions/email-events/index.ts`. SendGrid event webhook, replacing the old mailer-daemon sweep.

```
bounce | dropped   → lead.status=bounced, lifecycle=BOUNCED, unsubscribed=true
spamreport         → lead.status=unsubscribed, lifecycle=UNSUBSCRIBED, conv_mode=PAUSED
unsubscribe/group  → same as spamreport
        │
        ├─ upsert suppressions (user_id, email) UNIQUE
        ├─ cancel pending/claimed send_queue rows for that lead
        ├─ owner_alert (bounce / spam report / opt-out)
        └─ audit_events: email.bounced | email.unsubscribed
```

Every branch is idempotent: an already-`BOUNCED` or already-`UNSUBSCRIBED` lead is skipped, so a provider retry cannot double-write.

**Correction to the brief:** there is no "pause at >3 bounces / >1 complaint" hard stop. The system brakes on **rates**, not absolute counts, because 3 bounces out of 10 sends and 3 out of 3,000 are different events. The `suppressions` table is the absolute stop for an individual address; the sender cap is the absolute stop for a mailbox trend.

### 7.6 Pre-send content scoring

`spam-check` is a deterministic heuristic (no model call): ALL-CAPS subject words, `!!!`/`$$$`, fake `Re:`/`Fwd:`, spam lexicon, "Dear Sir/Madam", >3 links, uppercase ratio, word count. It returns a 0–100 score and a list of issues with severity. It advises; it does not block.

### 7.7 Tracking and unsubscribe

- `track-open` / `track-click` write `tracking_events` and set `opened_at`.
- `unsubscribe` is a public route + function; it writes `suppressions` and updates the lead.
- One-click unsubscribe rate is used as the spam-complaint proxy (`UNSUR_RATE_RED = 1%`), because real complaint feeds are unreliable at this volume.

---

## 8. AI cost control

**File:** `_shared/ai-cost-gate.ts`; tables `ai_cost_state`, `ai_cost_guest_state`, `ai_spend_ledger`.

Principles:

1. **Durable atomic reservation before the call.** `ai_cost_debit` reserves against a per-profile daily and monthly pool in one statement. The meter later settles actual − reserved via `ai_cost_settle`.
2. **No refunds for abandoned reservations.** They decay by window rollover. This biases toward earlier degradation, which is the safe direction.
3. **Fail-safe = conserve.** A failed ceiling read or debit routes the caller to the deterministic template path, never to a blind AI call.
4. **Non-uniform degradation.** New-outreach kinds (`gen_email`, `gen_followup`, `summarize`) trip at the daily pool; reply-critical kinds (`classify`, `reply_draft`, `escalate`) keep AI longer and trip only on the monthly pool or the reply share of it.
5. **Drift detection.** If the counter is ahead of the ledger sum by more than 2× the average reserved call, metering is marked degraded and the system conserves.
6. **Guest wall.** Public support chat uses a single-row global counter (`ai_cost_guest_state`) because guests have no profile row. Pool raised to $0.50/day after measured usage of ~$0.0033/message.

The cost sweep (`cost-sweep`, every 5 minutes) never rewrites counters in flight; it only reconciles and marks degradation.

---

## 9. Security model

| Layer | Control |
|---|---|
| Transport | HTTPS only; HSTS at the edge |
| Session | Supabase JWT; refreshed client-side; server resolves user via `auth.getUser` |
| Row access | RLS on **all 51 tables**; 34 policies. Tables with zero policies are deny-all for `anon`/`authenticated` and reachable only via `service_role` or `SECURITY DEFINER` |
| Privileged SQL | `SECURITY DEFINER` + `SET search_path = public` on every admin/identity function |
| Admin | Separate `admins` table; `is_admin()` checked inside the function, not in the client |
| OAuth tokens | AES-GCM at rest, `v1:<iv_b64>:<ct_b64>`, key `GOOGLE_TOKEN_ENC_KEY` (32 bytes). Legacy plaintext passes through on read; encryption fails open to plaintext rather than breaking OAuth |
| Service role | Only inside Edge Functions, only after caller resolution. Never shipped to the browser |
| Webhooks | Razorpay signature; SendGrid shared secret; Calendly signature. Deployed with JWT verification off by necessity |
| Protected columns | `plan`, `domain_required`, `domain_verified` restored on user writes |
| Audit | `audit_events` is append-only by convention and RLS; 167k rows; carries `decision_id`, `model_version`, `strategy_ref` |
| PII minimisation | `ip_hash`, not raw IP; `signup_signals` invisible to clients; `strategy_state` has no identity columns |

**Trust boundary, stated plainly:** the browser is untrusted. Every price, plan, quota, user identity, and eligibility decision is resolved server-side. The Razorpay amount comes from a server catalog (`_shared/razorpay-plans.ts`), never from the request.

---

## 10. Operations

### 10.1 Cron topology (10 jobs, pg_cron → `net.http_post`)

| Job | Schedule | Target |
|---|---|---|
| `outreachai_send_worker_hourly` | `5 * * * *` | `send-worker` |
| `outreachai_inbox_agent_hourly` | `* * * * *` | `inbox-agent` |
| `outreachai_push_drainer_minutely` | `* * * * *` | `push-drainer` |
| `cost-sweep` | `*/5 * * * *` | `cost-sweep` |
| `learning-hourly` | `0 * * * *` | `learning-loop` |
| `health-hourly` | `0 * * * *` | `health-check` |
| `reputation-nightly` | `15 1 * * *` | `reputation-report` |
| `website-crawl` | `0 */3 * * *` | `website-crawl` |
| `outreachai_warm_areas_daily` | `0 */2 * * *` | `warm-areas` |
| `outreachai_daily_digest` | `0 4 * * *` | `daily-digest` |

### 10.2 Outcome-first health monitoring

`pg_cron`'s `succeeded` only proves the HTTP POST was dispatched. The async invocation can be lost — this actually happened on 2026-09-09 with `reputation-nightly`. The fix:

- every cron target writes an **unconditional run-marker** audit row on each executed invocation (`CRON_RUN_EVENT` map);
- `health-check` judges freshness on **execution markers first**, falling back to dispatch evidence only during the pre-rollout window;
- a stale marker is red even if pg_cron shows fresh dispatches.

`health_state` deduplicates alerts by stable key (`cron:<job>`, `sender:<profile>`), tracks `active_since`, `last_alerted_at`, `alert_count`, and escalates rather than re-alerting every hour.

Other probes: stale pending queue jobs (2h), orphaned `processing` claims (15m), sender reputation (30h staleness), AI cost drift, database reachability.

### 10.3 Failure recovery guarantees

| Failure | Behaviour | Bound |
|---|---|---|
| Worker crashes mid-send | Lease expires, job reclaimed | ≤ lease (10 min) |
| Worker crashes after reserve | Slot stays consumed | 1 email lost, never gained |
| Gmail token revoked | Job cancelled/deferred, user alerted | No send |
| SendGrid retries webhook | Idempotent skip on lifecycle | No duplicate suppression |
| Learning fold fails | No row → default behaviour | No unsafe hint |
| AI budget exhausted | Template path | No unbounded spend |
| Cron dispatch lost | Execution-marker alert | ≤ 2× cadence |
| Razorpay webhook replayed | Status transition + event dedup | One upgrade |

---

## 11. Payments

- `razorpay-create-order` authenticates the caller, resolves the plan from the **server catalog**, and creates the order with a deterministic receipt (duplicate receipt → Razorpay rejects, a second line of defence behind `idempotency_key`).
- `razorpay-webhook` verifies the signature, then upgrades the plan on capture and writes `billing_events`.
- Checkout is behind a go-live gate (`RAZORPAY_CHECKOUT_ENABLED`), fail-closed: it refuses to mint an order until the webhook is registered and a real capture has been observed.
- Plans: Starter $37 / Growth $79 / Agency $149 per month, billed in USD.

**Current live status:** order creation returns HTTP 502 because Razorpay rejects the stored key pair with `401 Authentication failed`. The key ID is a live-mode key of the correct shape; the secret is 24 characters and clean. Orders succeeded until 2026-10-24, so the most likely cause is a rotated secret, with an account restriction as the alternative. This is a credential problem, not a code problem, and it is the last blocker before launch.

---

## 12. Scaling model

| Dimension | Mechanism | Ceiling |
|---|---|---|
| API concurrency | Stateless functions; PostgREST | Platform |
| Send concurrency | `SKIP LOCKED` claims | Number of workers |
| Quota correctness | Row-level atomic UPDATE | Per-user row lock |
| Email volume | Warm-up + reputation brake | 500/2,000 per day per mailbox |
| AI spend | Durable atomic debit + degrade | Configured pool |
| Learning | Per-campaign fold | O(campaigns × sends) per night |
| Storage | Indexed Postgres | Vertical, then partition `audit_events` |

What scales **autonomously**: queue draining, retries, warm-up, reputation braking, cost degradation, learning folds, health alerting.

What does **not** scale without a human: domain verification disputes, duplicate-business appeals, payment credential rotation, and interpreting signup clusters.

---

## 13. Live measured state (honest snapshot)

| Metric | Value |
|---|---|
| Accounts | 26 |
| Emails ever sent | 6 (5 marked replied — own test replies) |
| Leads | 17 |
| Meetings | 0 |
| Learning rows | `campaign_learning` 3, `opener_performance` 0, `reply_style_performance` 0 |
| Tagged sends | `variant` 6/6, `opener_key` 0/6, `reply_style` 0/6 |
| `lead_score` rows | 6 (tiers A/B/C) |
| Admin accounts | 2 |
| Payments | 10 created, 0 captured |
| Cron | 10 active, all last runs succeeded |

The learning pipeline is built and wired, but has **no eligible data**. That is a data problem, not a code problem: it needs ~50 real sends in one campaign before the first hint can publish.

---

## 14. Known gaps and next engineering steps

1. **No lease-based quota reservation.** A crash between reserve and send loses one email. Fix: `send_reservations(id, user_id, expires_at)` with a sweeper.
2. **No cross-campaign learning.** Each campaign learns alone; small accounts learn slowly. Fix: a pooled `strategy_state` consumer once cell floors are met.
3. **Bounce handling is rate-based, not count-based.** A single hard bounce does not pause a mailbox. This is defensible, but the brief expected counts; the two models should be reconciled explicitly.
4. **No instant spam-complaint feed.** Unsubscribe rate is the proxy. At scale, a real FBL is required.
5. **`audit_events` will need partitioning** (`created_at` monthly) before it reaches tens of millions of rows.
6. **Payments are blocked on credentials**, not architecture.
7. **`opener_performance` / `reply_style_performance` are empty** because no tagged sends exist; they are diagnostic views, not the learning source of truth.

---

## 15. One-paragraph summary for reviewers

OutshipAi is a serverless, Postgres-centric outbound engine. The database is the only shared state, and every correctness property that matters — quota, queue ownership, duplicate identity, domain ownership, admin authority — is expressed as a database constraint or an atomic SQL statement rather than in application code. The learning layer is deliberately conservative frequentist statistics with published gates, per-campaign scope, and fail-open consumers; it cannot raise a limit, unblock an account, or send an email. The agent layer is a deterministic intent router with an LLM fallback and a hard confirmation boundary before any write. The anti-abuse layer charges one lifetime budget per business identity, challenges duplicates with unforgeable DNS proof, records device/IP signals without ever blocking on them, and makes every administrative action auditable and reversible. The system is built to fail closed on safety and fail safe on intelligence.
