# OutshipAi — Complete System Manual

**From the first commit to today — every subsystem, every function, every table, every migration.**

| Field | Value |
|---|---|
| Repository | `C:\Dev\reach-ai-agent` |
| Branch / HEAD | `main` / `74701dd` |
| First commit | 22 Aug 2026 |
| Last commit | 3 Nov 2026 |
| Commits | **324** |
| Migrations | **84 forward** (+17 rollback files = 101 SQL files) |
| Edge Functions | **36** |
| Tables / columns | **51 / 499** |
| SQL functions | **43** |
| RLS policies | **34** (RLS enabled on all 51 tables) |
| Triggers | **13** |
| Views | **2** |
| Frontend routes | **33** |
| Shared modules | **40** |
| Cron jobs | **10** |
| Node test harnesses | **22** |
| Live project | `zvohdvopmvzsujktrdmu` |

---

## Contents

| Part | Section |
|---|---|
| 0 | How to read this document |
| I | What OutshipAi is |
| II | The build, day 1 → today |
| III | The system today (stack, topology, data model) |
| IV | Engines: 4.1 anti-abuse · 4.2 learning · 4.3 agent · 4.4 deliverability · 4.5 discovery · 4.6 growth · 4.7 inbox · 4.8 AI cost · 4.9 security · 4.10 operations · 4.11 billing · 4.12 support chat |
| V | Live measured state |
| VI | Incident log |
| VII | Testing |
| VIII | Gaps, risks, next steps |
| IX | Glossary |
| X | Where everything lives |
| A | Appendix: all 324 commits |
| B | Appendix: all 36 Edge Functions |
| C | Appendix: all 51 tables / 499 columns |
| D | Appendix: all 43 SQL functions |
| E | Appendix: all 84 forward migrations (+17 rollback files) |
| F | Appendix: all 33 routes |
| G | Appendix: all 39 shared modules |

---

## 0. How to read this document

This manual has two halves.

**The narrative (Parts I–IV)** explains what the system is, how it evolved, and why each engine is built the way it is. Read this if you are evaluating the product or the architecture.

**The appendices (A–G)** are the exhaustive reference. Read these if you need to verify a claim:

| Appendix | Contents |
|---|---|
| A | All 324 commits, oldest first |
| B | All 36 Edge Functions, with purpose and auth class |
| C | All 51 tables and 499 columns, with constraints |
| D | All 43 SQL functions and 2 views |
| E | All 84 forward migrations and what each introduced |
| F | All 33 frontend routes |
| G | All 40 shared modules |

### Honesty rules used in this document

1. **Verified, not assumed.** Every number was read from the live database or the repository, not from memory.
2. **Corrections are explicit.** Where the product differs from a common assumption (for example, that this is Next.js + FastAPI), the document says so.
3. **Gaps are named.** Section VIII lists what is missing, broken, or untested. A manual that only praises itself is marketing, not architecture.
4. **Live state is separated from design.** A pipeline can be correct and still have zero data. Both facts appear.

---

## I. What OutshipAi is

OutshipAi is a B2B cold-outreach platform that runs entirely on the customer's **own Gmail account**.

The product loop:

```
Discover leads → verify emails → build a campaign → AI writes each email
      → queue → send via the user's Gmail → detect replies → AI drafts replies
      → book meetings → measure → learn → change the next send
```

Three things make it different from a bulk mailer:

1. **No shared sending infrastructure.** There is no OutshipAi mail server. Every message leaves through the customer's own mailbox, so deliverability is tied to their domain reputation, not to a shared IP pool. This is why the system spends so much effort on warm-up, bounce handling, and suppression.
2. **Learning is statistical, not theatrical.** Four learners change opener angle, subject variant, follow-up length, and reply shape — but only after explicit sample-size gates. Nothing is fine-tuned, and no hint can override a safety limit.
3. **The database is the product's spine.** Quotas, queue ownership, duplicate identity, domain ownership, admin authority, and AI budgets are all enforced in Postgres. Application code cannot talk its way past them.

### Commercial shape

| Plan | Price | Daily sends | Lifetime | Leads | Campaigns |
|---|---|---|---|---|---|
| Free | $0 | 10 | **50 total** | 25 | 1 |
| Starter | $37/mo | 50 | unlimited | 250 | 1 |
| Growth | $79/mo | 200 | unlimited | 1,000 | 5 |
| Agency | $149/mo | 500 | unlimited | 5,000 | unlimited |

The free tier is a **lifetime** budget, not a daily allowance. That single decision is the core of the anti-abuse model: creating N accounts buys N × 50 emails once, instead of 10 emails every day forever.

---

## II. The build, day 1 → today

The repository has 324 commits across four months. The migrations are the most reliable chronology, because each one is dated and states its reason. The phases below follow them.

### Phase 0 — Schema seed (June 2026)

Two migrations predate the first git commit: the initial `profiles` table and Gmail sending-limit columns. They are the seed of everything that follows. The git history proper begins on **22 August 2026** with the production release.

### Phase 1 — Production release and first hardening (22–25 Aug)

174 commits land in August, most of them in this window.

- **Release**: auth, campaigns, Gmail OAuth, AI email generation, the marketing site.
- **Token vault**: Gmail OAuth tokens move out of `profiles` into `gmail_tokens`, service-role only (`20260823000004`).
- **Referrals and public stats** (`20260823000005`): the first growth loop.
- **Autopilot** (`20260823000007`): a cron robot that finds leads and sends on the owner's behalf.
- **True free tier** (`20260824130000`): the first version of the 50-email cap.
- **Send queue** (`20260824150000`): decouples the Launch click from actual sending. This is the birth of the queue architecture.
- **Conversation mode** (`20260824190000`): multi-turn AI thread handling.
- **Lead cap trigger** (`20260824200000`): server-side enforcement, because the UI cap was client-only.
- **Unique lead email** (`20260824210000`): case-insensitive duplicate protection.
- **Production architecture + hardening pass** (`20260824220000`, `20260824230000`): concurrency, audit, policy enforcement.
- **First-touch uniqueness** (`20260825060000`): closes the lease-expiry race where two workers could send the same first email.
- **Business intelligence** (`20260825050000`): structured business config on the profile — the facts the AI writer needs.

### Phase 2 — Discovery, follow-ups, and the growth loop (26–28 Aug)

- **Lead discovery** (`20260826100000`–`120000`): Google Maps / OSM metadata, email verification state, city/phone/address/website/rating.
- **Campaign images and approval** (`20260826130000`).
- **Follow-up engine** (`20260827100000`): per-lead follow-up state, campaign toggle, timing.
- **Website email enrichment** (`20260827110000`): provenance for where an email was found.
- **Delivery preference** (`20260828140000`): `smart` (each lead's local morning) vs `instant`.
- **Network intros** (`20260828160000`): double opt-in warm introductions between users.
- **Referral rewards** (`20260828170000`): 7 days of Starter, stacked and never downgrading.
- **Classifier evidence** (`20260828190000`): every AI classification carries a human-readable reason.

### Phase 3 — Support and push (29 Aug)

- **Support chat** (`20260829170000`): persistent, account-aware threads that can quote the user's real numbers.
- **Push notifications** (`20260829190000`): subscriptions plus a drain queue fed by an `owner_alerts` trigger.

### Phase 4 — The intelligence layer (8–10 Sep)

This is the architectural centre of the product.

- **Sender health** (`20260908000001`): a reputation ledger and the nightly brake.
- **`agent_config`** (`20260908000002`): scoped judgment knobs, resolution `glob → user → campaign`.
- **Audit attribution** (`20260908000003`): `decision_id`, `model_version`, `strategy_ref` on `audit_events`.
- **Intelligence tables** (`20260908000004`): `lead_score`, `campaign_learning`, `strategy_state`.
- **Queue priority** (`20260908000006`): a fresh score may move a job earlier, never raise volume.

### Phase 5 — Cost, erasure, memory, health (9–10 Sep)

- **AI spend ledger** (`20260909000001`): one row per LLM call.
- **Durable AI cost gate** (`20260909000002`): atomic reserve-then-settle.
- **Config writer RPC** (`20260909000003`): partial unique indexes need a dedicated upsert.
- **Erasure gaps** (`20260909000004`): account deletion must not leave orphaned cost history.
- **Conversation memory** (`20260909000005`): facts only, never raw transcript.
- **Health check** (`20260910000001`): five probes, hourly.
- **Cron execution markers** (`20260910000002`): the fix for the 09-09 silent failure.
- **Guest AI gate** (`20260910000010`): a global budget for anonymous support visitors.

### Phase 6 — Follow-up correctness and real meetings (12–13 Sep)

- **Send-window hardening** (`20260912000000`): the reply-cancel trigger previously missed leads in the `sending` state.
- **Default sequence** (`20260912120000`): 4 touches over 21 days, replacing a 13-step / 4-year default.
- **Meetings growth** (`20260913000000`): provider-confirmed Calendly bookings with an idempotency key.

### Phase 7 — Billing and the agent (28–29 Sep)

- **Razorpay** (`20260928060000`): order + payment ledger, because the old flow only wrote `profiles.plan` and kept no transaction record.
- **Agent action budget** (`20260929120000`): dollar budgets cannot bound a loop of cheap actions.
- **Agent conversations** (`20260929130000`): history plus the intent cache.
- **Single-use confirmation** (`20260929140000`): a "yes" must not execute twice.
- **Learned vocabulary** (`20260929150000`): the fast lane.
- **Pending state** (`20260929160001`): a clarifying question must survive the next message.
- **Agent profile** (`20260929170000`): durable business context learned by listening.

### Phase 8 — Plan limits, crawl, search budget (9–11 Oct)

- **Plan limits** (`20261009000001`): one server-side source of truth.
- **Website crawl** (`20261011000001`): backfill emails for the shared map.
- **Search budget** (`20261011000002`): one daily counter for every live Google Places search.

### Phase 9 — Learning goes live (30 Oct)

- **Opener learning** (`20261030000001`): the angle was already being chosen by hash and then discarded. Now it is recorded and measured.
- **Reply-style learning** (`20261030000002`): three reply shapes, attributed to meetings.

### Phase 10 — Anti-abuse and the operator console (1–3 Nov)

- **Lifetime cap + identity + domains + signals** (`20261101000001`).
- **Identity required at send time** (`20261101000002`).
- **Protected columns** (`20261101000003`): closes the self-elevation hole.
- **Scoped block reason** (`20261101000004`).
- **Street-level address** (`20261101000005`).
- **Compatibility shim** (`20261101000006`) and **restored specific reason** (`20261101000007`).
- **Admin console** (`20261103000001`): separate authority, audited, reversible.

Two provenance facts belong here, because they affect how the history can be audited:

1. **84 forward migrations and 17 rollback files.** The 101 `.sql` files in `supabase/migrations/` are not 101 schema versions. The rollback files sit beside their forward migration and were never applied to production.
2. **The CLI ledger stops on 29 August 2026.** `supabase_migrations.schema_migrations` holds only 46 rows. Every migration after that date was applied through the Management API, so the repository — not the ledger — is the record of what ran. Appendix E states this in full.

The full commit list is **Appendix A**. The full migration list is **Appendix E**.

---

---

## III. The system today

### 3.1 Stack, corrected

| Layer | Implementation |
|---|---|
| Frontend | TanStack Start (SSR) + React 19.2 + Vite 7.3 + TanStack Router/Query |
| UI | Tailwind 4, Radix, shadcn-style components, Recharts, three.js on the marketing hero |
| Mobile | Capacitor 8 Android shell over the same web app |
| Backend | 36 Supabase Edge Functions — Deno/TypeScript, stateless |
| Database | PostgreSQL 17.6 |
| Auth | Supabase Auth (GoTrue), JWT |
| Email read/write | Gmail API, per-user OAuth 2.0 |
| Email events | SendGrid Event Webhook + Inbound Parse |
| LLM | Groq, multiple models with independent TPM pools |
| Places | Google Places API (New) + OpenStreetMap |
| Bookings | Calendly webhook |
| Payments | Razorpay Orders + signed webhook |
| Push | Web Push (VAPID) |

There is **no Next.js, no FastAPI, no Redis, no message broker, and no container orchestration**. Postgres is the queue, the lock manager, the rate limiter, and the policy engine.

### 3.2 Topology

```
Browser / Android WebView
        │ HTTPS + JWT
        ▼
Supabase Auth ── PostgREST (RLS) ── Realtime
        │
        ├──────────────┬───────────────┬──────────────┐
        ▼              ▼               ▼              ▼
  36 Edge Fns     PostgreSQL 17      pg_cron       Storage
  (stateless)     51 tables         10 jobs
        │          43 functions
        │
        ├── Gmail API (user mailbox)
        ├── Groq (LLM)
        ├── Google Places / OSM
        ├── SendGrid (events + inbound)
        ├── Calendly (bookings)
        ├── Razorpay (billing)
        └── Web Push
```

### 3.3 Why this shape

The workload is bursty, per-user, and cron-driven. Stateless functions mean:

- horizontal scale is the platform's problem;
- no process to restart, no connection pool to exhaust;
- the only shared mutable state is Postgres, so correctness does not depend on sticky sessions;
- a crash cannot corrupt in-memory state, because there is none.

The price: **every concurrency control must be expressed in SQL**. That constraint explains almost every design decision in Part IV.

### 3.4 Request lifecycle

Every function follows the same contract:

1. `OPTIONS` → CORS.
2. **Resolve the caller** — Supabase JWT via `auth.getUser`, or `x-cron-secret`, or a provider signature.
3. **Validate input** before any write.
4. **Service-role client** only after the caller is resolved. A `user_id` in the body is never trusted.
5. **Audit** every state change.
6. **Explicit status**; no internal error text unless a debug header matches a secret.

Webhooks (`razorpay-webhook`, `email-events`, `inbound-email`, `calendly-webhook`) run with JWT verification off because providers cannot present a Supabase JWT. They compensate with HMAC signatures, replay windows, or a shared secret.

### 3.5 Frontend model

- `_authenticated.tsx` is a pathless layout: session + onboarding gate before any child renders.
- `/admin` is exempt from the onboarding guard (an operator may need to inspect an incomplete account) but not from `is_admin()`.
- Data access goes through PostgREST under RLS. There is no custom REST layer for CRUD.
- Mutations invalidate TanStack Query caches; there is no global client store, because the database is the source of truth.
- The marketing home lazy-loads three.js and the support widget after idle, so copy and CTAs are interactive immediately.

### 3.6 Data model and invariants

51 tables, 499 columns. Full schema in **Appendix C**.

| Domain | Tables |
|---|---|
| Identity / plans | `profiles`, `plan_limits`, `usage_limits`, `admins`, `admin_actions` |
| Anti-abuse | `domains`, `signup_signals` |
| Leads | `leads`, `lead_score`, `lead_refresh`, `saved_businesses`, `lead_finder_caches` |
| Campaigns | `campaigns`, `follow_up_sequences`, `send_queue`, `emails_sent` |
| Inbox | `inbound_emails`, `email_threads`, `thread_memory`, `ai_classifications`, `suppressions` |
| Learning | `campaign_learning`, `strategy_state` (+ 2 views) |
| Deliverability | `sender_health`, `health_state`, `tracking_events`, `owner_alerts` |
| Agent | `agent_conversations`, `agent_messages`, `agent_learned_phrases`, `agent_pending_state`, `agent_profile`, `agent_action_state`, `agent_config` |
| Cost | `ai_cost_state`, `ai_cost_guest_state`, `ai_spend_ledger`, `google_search_usage` |
| Billing | `payments`, `billing_events`, `referrals` |
| Ops / audit | `audit_events`, `gmail_tokens`, `push_queue`, `push_subscriptions`, `support_chat_*`, `tools_rate_limit`, `intro_requests` |

**Invariants enforced by the database, not by code:**

| Invariant | Mechanism |
|---|---|
| One user → many domains; one verified domain → one user | `domains_verified_domain_uniq ON (lower(domain)) WHERE verified_at IS NOT NULL` |
| No duplicate (user, domain) | `domains_user_domain_uniq (user_id, lower(domain))` |
| Every send consumes quota exactly once | Atomic `UPDATE` in `reserve_send_slot` |
| No two workers send one job | `FOR UPDATE SKIP LOCKED` in `claim_queue_jobs_v2` |
| No two workers follow up one lead | CAS `followup_status: active → sending` |
| Plan and domain flags are not self-elevatable | `guard_protected_profile_cols()` trigger |
| A duplicate flag cannot be laundered by editing | Flag is sticky; only DNS proof or an admin clears it |
| Webhook replay cannot upgrade twice | `payments` status guard + unique payment id |
| Erasure actually erases | `ON DELETE CASCADE` everywhere, including the cost ledger |

---

## IV. Engines

### 4.1 Anti-abuse engine

#### The choke point

Every outbound email passes through `reserve_send_slot(p_user, p_cap)`.

```sql
UPDATE profiles SET
  emails_sent_today = CASE WHEN emails_sent_date = current_date
                           THEN coalesce(emails_sent_today,0)+1 ELSE 1 END,
  emails_sent_total = coalesce(emails_sent_total,0)+1
WHERE id = p_user
  AND coalesce(btrim(company),'') <> ''
  AND is_plausible_business_address(business_address)
  AND (CASE WHEN emails_sent_date = current_date
            THEN coalesce(emails_sent_today,0) ELSE 0 END) < p_cap
  AND (v_lifetime IS NULL OR coalesce(emails_sent_total,0) < v_lifetime)
  AND (NOT domain_required OR domain_verified)
RETURNING true;
```

Why this exact shape:

- **One statement = one row lock.** Concurrent workers serialise on the profile row.
- **Rejection is free.** A failed predicate updates zero rows, so a blocked account cannot burn quota by retrying.
- **One source of truth.** `send-worker` never checks the cap itself; it only asks whether it got a slot (`index.ts:544`, `:1065`).
- **Identity is a send-time gate.** A direct API call with a blank company fails the same statement.

Known limitation: if a worker is killed between reserve and `release_send_slot`, one slot stays consumed. The error is conservative — the customer loses an email, never gains one.

#### Refusal reasons

`send_block_reason(uuid)` returns one of `domain_required`, `business_identity_required`, `lifetime_limit`, `daily_limit`, or NULL. Precedence is identity → duplicate challenge → lifetime → daily, because the earliest condition is the one the user can fix.

#### Duplicate business

`flag_duplicate_business()` runs BEFORE UPDATE on `(company, business_address)`:

- exact match on `lower(btrim(...))`, deliberately not fuzzy;
- only against an account created earlier (`created_at <= NEW.created_at`);
- only when the identity fields change;
- sticky — editing the name does not clear it.

The first account with a pair is never challenged. That is the product decision: a real business without a website must not be blocked.

#### Domain proof

`domain-verify` asks for `TXT _outshipai.<domain>` and checks it through Google DoH, then Cloudflare DoH.

- Freemail domains are rejected — you cannot own `gmail.com`.
- The "already taken" check excludes the caller's own row.
- A partial unique index is the final arbiter under concurrency.
- Success clears `domain_required` in every return path, including early exits.

DNS was chosen over an emailed code because OutshipAi has **no system mailer**; adding Resend or Postmark to send one link would add a paid dependency and a new failure mode to prove something DNS proves better.

#### Signup signals

`signup_signals(device_id, ip_hash, user_agent)` — observation only.

- `ip_hash = sha256(salt + ip)`, never the raw IP.
- RLS on, zero policies, `REVOKE ALL` from clients.
- The admin console clusters accounts by device and IP.
- Nothing blocks automatically. Shared offices, families, and CGNAT users are why.

#### Protected columns

A user can update their own profile row under RLS, including `plan`, `domain_required`, `domain_verified`. `guard_protected_profile_cols()` restores those three unless the writer is `service_role`, `postgres`, or `supabase_admin`.

Trigger ordering is load-bearing: Postgres fires same-event triggers in name order, so the guard is `trg_a_...` to sort before `trg_flag_duplicate_business`. Renaming either could silently undo the flag.

#### Admin console

- `admins` is a separate table; `profiles.is_admin` does not exist.
- `is_admin()` is `STABLE SECURITY DEFINER`.
- `admin_console()` raises `not_admin` (42501) before returning data.
- `admin_flag` / `admin_clear_flag` write `admin_actions`.
- No delete or suspend action exists. Every action is reversible and audited.

---

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

---

### 4.5 Lead discovery engine

This is the subsystem that feeds everything else, and it is built around **not wasting paid API calls**.

#### Sources, in cost order

1. **`saved_businesses`** — the permanent shared map. Currently **6,745 rows**. Every business ever found through Google, OSM, or website enrichment is written here. Searches check this table first: zero external cost, never runs out, and one user's search benefits every later user.
2. **`lead_finder_caches`** — DB-backed cache. Areas 7 days, result sets 12 hours.
3. **Google Places API (New)** — Text Search Essentials. The paid source.
4. **OpenStreetMap** — free fallback and coverage extender.

The order matters: the paid source is touched only for genuinely new chemistry, never for a repeat search.

#### Email verification

`_shared/email-verifier.ts` runs on every candidate:

- syntax and placeholder detection;
- MX/A/AAAA existence (DNS, no SMTP probe — SMTP probing gets the sending domain blocklisted);
- disposable/throwaway provider hard-fail;
- role-address detection (`info@`, `admin@`) with a confidence penalty, not a block.

The verification result is persisted on the lead, so a later send does not re-verify.

#### Search budget

`_shared/search-budget.ts` keeps one daily counter for every live Google search:

- default ceiling `GOOGLE_SEARCH_DAILY_BUDGET = 120`;
- live user searches spend first;
- `warm-areas` may spend only what is **left**;
- on HTTP 429 the worker stops immediately and records what it actually spent.

`warm-areas` runs every 2 hours and does two jobs:

1. refresh covered areas older than 7 days, so newly opened businesses are discovered;
2. seed new niche × metro combinations, real user demand first, then a curated list.

`website-crawl` runs every 3 hours with a **150/day cap**. It picks businesses in `saved_businesses` that have a website but no email, crawls contact/about/team/footer pages for a published address, verifies it, and writes it back. A site is never re-crawled more than once a month.

`suggest-areas` provides the deterministic metro lists and "best area" probes; `areas.ts` holds the curated per-country data.

#### Anti-abuse interaction

Discovery is **not** blocked for free accounts. The free tier gets 25 stored leads. The cap is enforced by `enforce_lead_cap()` at insert, not by hiding the feature.

### 4.6 Growth loop

| Mechanism | Implementation | Reward |
|---|---|---|
| Referrals | `referrals` + `referral-claim` | 7 days of Starter, stacks, never downgrades (`effective_plan`) |
| Network intros | `intro_requests` + `network-intros` | Double opt-in warm intro; contact details never exposed before acceptance |
| Public stats | `public_stats()` + `/stats` | Social proof |
| Free tools | `/tools` + `tools` function | Acquisition surface |
| Push | `push_queue` + `push-subscribe` + `push-drainer` | Re-engagement |

`effective_plan()` resolves the active plan at runtime: a live referral reward stacks **above** the subscription and expires on its own. This is why plan resolution is a function, not a column read.

### 4.7 Inbox and conversation engine

There are two reply paths, deliberately:

1. **Inbound parse** — outbound mail sets `Reply-To: r-<leadId>@<EMAIL_INBOUND_DOMAIN>`. SendGrid Inbound Parse posts the reply to `inbound-email`, which resolves the lead, persists it, marks the thread, and alerts the owner. **No Gmail read scope is required.**
2. **Gmail scan** — `inbox-agent` reads the owner's mailbox on an hourly cron for threads the inbound path missed.

`inbox-agent` pipeline:

```
scan → strip quoted text → dedupe → classify (structured JSON)
     → policy engine (deterministic) → controlled action
```

The classifier returns `intent`, `confidence`, `interested`, `booking_intent`, `unsubscribe`, `sentiment`, `requires_human`, `suggested_action`, and a human-readable `reason`. The model classifies; `policy.ts` decides. The model is never allowed to choose an action directly.

Policies cover:

- opt-out and unsubscribe (honoured immediately, before any AI);
- autoresponder / vacation detection (no reply loop);
- hostile or legal messages (escalate, do not engage);
- pricing and commitment questions (human);
- warm replies (AI may draft within policy).

`thread_memory` stores **facts only** — never raw message text. The transcript stays in Gmail, which keeps the erasure surface small.

`send-reply` sends an owner-approved draft inside the existing thread.

### 4.8 AI cost engine

Tables: `ai_cost_state`, `ai_cost_guest_state`, `ai_spend_ledger`. Constants in `ai-cost-gate.ts`:

| Constant | Default | Purpose |
|---|---|---|
| `AI_COST_PER_1M_IN` | $0.20 | input price |
| `AI_COST_PER_1M_OUT` | $0.80 | output price |
| `AI_ALLOWANCE_PER_SEND` | $0.0016 | budget earned per email |
| `AI_PER_CALL_GUARD` | $0.0025 | max single-call reservation |
| `AI_SAFETY_FACTOR` | 1.5 | headroom |
| `AI_REPLY_MONTH_SHARE` | 30% | reply-critical share of the monthly pool |
| `AI_GUEST_POOL_DAILY` | $0.50 | public support widget, all visitors |

Mechanics:

1. **Reserve before the call** with `ai_cost_debit` — one atomic statement over daily and monthly pools.
2. **Settle after** with `ai_cost_settle(actual − reserved)`.
3. **Abandoned reservations are not refunded**; they decay by window rollover. This biases toward earlier degradation.
4. **Fail-safe = conserve.** A failed read or debit routes to the deterministic template path, never a blind call.
5. **Non-uniform degrade.** New-outreach kinds trip at the daily pool; reply kinds keep AI longer and trip only on the monthly pool or the reply share.
6. **Drift detection.** Counter ahead of the ledger by >2× average reserved call ⇒ metering degraded ⇒ conserve.

`cost-sweep` runs every 5 minutes, reconciles read-only, and writes the quality markers. It never rewrites counters in flight.

### 4.9 Security model

| Layer | Control |
|---|---|
| Transport | HTTPS only; HSTS at the edge |
| Session | Supabase JWT resolved server-side with `auth.getUser` |
| Row access | RLS on all 51 tables, 34 policies; zero-policy tables are deny-all for clients |
| Privileged SQL | `SECURITY DEFINER` + `SET search_path = public` |
| Admin | Separate `admins` table; checked inside the function |
| OAuth tokens | AES-GCM at rest: `v1:<iv>:<ciphertext>`, key `GOOGLE_TOKEN_ENC_KEY` |
| Service role | Only in Edge Functions, only after caller resolution |
| Webhooks | Razorpay HMAC, Calendly HMAC + replay window, SendGrid shared secret |
| Protected columns | `plan`, `domain_required`, `domain_verified` restored on user writes |
| Audit | Append-only `audit_events` with decision attribution |
| PII | `ip_hash` not raw IP; signals invisible to clients; `strategy_state` identity-free |
| Erasure | `forget_lead` / `delete_lead` / `delete-account`; cascade includes the cost ledger |

**Trust boundary:** the browser is untrusted. Every price, plan, quota, identity, and eligibility decision is server-side. The Razorpay amount comes from `_shared/razorpay-plans.ts`, never from the request.

### 4.10 Operations

#### Cron topology (10 jobs)

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

#### Outcome-first health monitoring

`pg_cron` reporting `succeeded` only proves the HTTP POST was dispatched. The async invocation can be lost — this happened on **9 September 2026** with `reputation-nightly`.

The fix:

- every cron target writes an **unconditional execution marker** to `audit_events`;
- `health-check` judges freshness on the marker first, dispatch evidence second;
- a stale marker is red even when pg_cron shows fresh dispatches.

`health_state` deduplicates by stable key (`cron:<job>`, `sender:<profile>`), tracks `active_since`, `last_alerted_at`, and `alert_count`, and escalates instead of re-alerting hourly.

Other probes: pending queue jobs older than 2h, orphaned `processing` claims older than 15m, sender reputation stale beyond 30h, AI cost drift, database reachability.

### 4.11 Billing engine

- `razorpay-create-order`: the browser sends a plan id; the server looks up the amount; the order is written to `payments` with the uid from the JWT.
- Deterministic receipt — Razorpay rejects duplicates, a second line of defence behind `idempotency_key`.
- `razorpay-webhook`: the **only** place a plan is granted. Constant-time HMAC over the raw body; the plan comes from our `payments` row, never the payload; idempotent on payment id.
- Go-live gate: `RAZORPAY_CHECKOUT_ENABLED` must be `true`; checkout is fail-closed.

**Current status:** order creation returns 502 because Razorpay rejects the stored key pair with `401 Authentication failed`. The key is live-mode and correctly shaped; orders worked until 24 October. Most likely a rotated secret; an account restriction is the alternative. This is a credential problem, not an architecture problem.

### 4.12 Support chat and the capability boundary

`support-chat` serves two audiences through one endpoint: signed-in users (JWT, account context loaded) and visitors (an opaque `x-guest-id`, shared guest AI bucket, 60 messages, 3 threads/day).

**Deterministic first.** `routeSupportTopic()` classifies the newest message with regexes and attaches a topic directive. The model never decides what the product can do; it only phrases the answer.

**Money is a hard rule.** The Guide cannot refund, credit, reverse or discount. It says a human decides, and routes to the support address. `redactLegacyProcessor()` is an output guard, because a model will happily repeat a provider name typed by the user.

**The capability boundary.** A tutor asked *"can I find emails of parents from your platform?"* The router matched the word "emails", returned the sending topic, and the Guide replied with a Gmail checklist — never stating that the product has no consumer data. That is a factual, legal and trust failure at once.

The fix is a boundary that runs **before** every keyword rule:

| Layer | Mechanism |
|---|---|
| Detection | `isPersonalContactRequest()` — a private-person noun, contact-data noun, request verb, and **no** business noun. "Find tuition centres in Dubai" stays a business ask |
| Answer | `personalContactAnswer()` — deterministic, first line is the refusal, states business-only scope, names the source, gives three real alternatives |
| Model path | Arabic still goes to the model, with a `PERSONAL_DATA` directive that forbids softening the refusal |
| Test | `scripts/.stage8/support-boundary.test.mjs` — 28 cases, including the exact transcript message and 9 business asks that must not be caught |

The rule generalises: when the answer is a **fact about what we do not have**, it is code, not a prompt. A prompt can be argued with; a regex cannot.

---

---

## V. Live measured state

Read from the production database on 3 November 2026.

| Metric | Value | Reading |
|---|---|---|
| Accounts | 26 | pre-launch |
| Emails sent all time | 6 | 5 marked replied — own test replies |
| Leads | 16 | mostly test data |
| Meetings | 0 | no real booking yet |
| `campaign_learning` rows | 3 | folds ran, no winning hints |
| `opener_performance` rows | 0 | no tagged sends |
| `reply_style_performance` rows | 0 | no tagged conversations |
| Tagged sends | `variant` 6/6, `opener_key` 0/6, `reply_style` 0/6 | old rows predate tagging |
| `lead_score` rows | 6 | tiers A/B/C |
| `saved_businesses` | 6,745 | the shared map has real value already |
| Admin accounts | 2 | operator only |
| Payments | 10 created, 0 captured | checkout never completed |
| Cron jobs | 10 active, all last runs succeeded | |
| `audit_events` | 179,213 | append-only history |

Two conclusions that must be stated plainly:

1. **The learning engine has no eligible data.** It is correct and wired, but the sample is zero because all six sends predate the tagging columns. It needs roughly 50 real sends in one campaign before the first hint publishes.
2. **Billing is blocked on credentials.** Ten orders were created historically; none captured. The immediate failure is Razorpay's 401, not our code.

---

## VI. Incident log (verified)

These are real defects found and fixed, each visible in a migration or code comment. They matter because they show where the design was wrong, not just what it does now.

| Date | Defect | Impact | Fix |
|---|---|---|---|
| 2026-08-25 | Two workers could both pass the first-touch idempotency check | Duplicate first email | Partial unique index on first-touch (`20260825060000`) |
| 2026-08-25 | `owner_alerts` CHECK rejected `kind='review'` | Autoresponder alerts silently lost | Constraint extended (`20260825070000`) |
| 2026-09-09 | `reputation-nightly` dispatch reported success but the function never ran | Reputation brake blind for a night | Execution markers + evidence RPC (`20260910000002`) |
| 2026-09-12 | Reply-cancel trigger only matched `followup_status='active'` | Reply could arrive while a follow-up was `sending`; follow-up still went out | Trigger covers `sending` (`20260912000000`) |
| 2026-09-29 | Confirmation returned "pending" before persisting the user message | A "yes" could not find the intent it was confirming | Persist first + single-use marker (`20260929140000`) |
| 2026-09-29 | `agent_pending_state` created with FORCE RLS | Service-role writes silently failed; every clarifying question was forgotten | RLS corrected (`20260929160002`) |
| 2026-11-01 | RLS let a user PATCH `domain_verified: true` on their own row | The entire duplicate-business rule was decoration | `guard_protected_profile_cols()` (`20261101000003`) |
| 2026-11-01 | "India", "United States", "London" passed as addresses | Meaningless sender identity | Street-level predicate (`20261101000005`) |
| 2026-11-01 | `send_block_reason` accepted any user id from an authenticated caller | One user could probe another's limits | Caller scoping (`20261101000004`) |
| 2026-11-01 | New reason string shipped before the frontend had copy for it | Blank error banner | Compatibility shim, then restore (`2026...06`, `...07`) |
| 2026-11-03 | `domain-verify` counted the caller's own verified domain as "taken" | Legitimate owner told their own domain was unavailable | `.neq("user_id", userId)` |
| 2026-11-03 | Early `verified:true` paths did not clear `domain_required` | Verification succeeded but the account stayed blocked | Clear the flag on every return path |
| 2026-11-03 | Razorpay order creation fails | Checkout cannot start | **Open** — 401 from Razorpay, credentials |

The pattern is consistent: most defects were **authorization or state-ordering** bugs, not algorithmic ones. That is expected in a system where the database is the enforcement layer.

---

## VII. What is tested, and how

| Type | Count | What it covers |
|---|---|---|
| Node harnesses (`scripts/**/*.test.mjs`, `.stage8/`) | **22** | Agent router, policy engine, health state machine, sender health, learning gates, address parity, erasure, cost meter |
| SQL parity | 24/24 | `is_plausible_business_address` SQL ↔ `src/lib/address.ts` across country-only, city-only, whitespace, digit, street-word and neighbour cases |
| Simulation | `scripts/stage4-simulation.mjs` | Fold logic against synthetic data at the exact shipped constants |
| Live probes | `scripts/.ops/` | Domain verify end-to-end on the real domain, admin 200/403, cron evidence, payment probe |

Pure modules exist specifically so the tests execute **the shipped code**, not a copy: `agent-router.ts` has no imports or Deno globals, `health-engine.ts` has no DB, `sender-health.ts` is a pure state machine, and `intelligence-reads.ts` takes a structural `db`.

What is **not** covered: no browser E2E suite, no load test, no chaos test, and no automated test for the Razorpay webhook signature path.

---

## VIII. Gaps, risks, and next steps

### Correctness

1. **No lease-based quota reservation.** A crash between reserve and send loses one email. Fix: `send_reservations` with expiry and a sweeper.
2. **Bounce handling is rate-based.** A single hard bounce suppresses the address but does not pause the mailbox. Defensible, but should be stated in the product docs.
3. **No real spam-complaint feed.** Unsubscribe rate is the proxy. At scale a feedback loop is required.
4. **`audit_events` will need partitioning** by month before it reaches tens of millions of rows.

### Learning

5. **Per-campaign only.** Small accounts learn slowly. A pooled consumer of `strategy_state` is the next step, once cell floors can be met.
6. **Zero eligible rows today.** This is a data problem, not a code problem.
7. **Body copy does not learn.** Only opener, subject, sequence length, and reply shape.

### Product

8. **Payments blocked** on Razorpay credentials.
9. **Two live accounts lack a valid street address**; one (`Saminfo`) is blocked with `business_address_incomplete`.
10. **No system mailer**, so password reset and domain proof rely on DNS or the user's own mailbox.

### Operational

11. **Single-region Supabase project.** No disaster-recovery drill has been run.
12. **Secrets rotation** is manual; there is no automated rotation or expiry alert.
13. **No status-page automation** beyond `public_stats` / `health-check`.
14. **The migration ledger is incomplete.** `schema_migrations` stops on 29 August 2026 (46 rows) while the repo has 84 forward migrations. Reconstruct it by inserting the missing versions, so a fresh environment can be built by replay rather than by reading the repo by hand.

### What I would fix first, in order

1. Rotate the Razorpay key pair, verify a USD order, register the webhook, capture one real payment.
2. Run one real campaign with 50–100 leads in a single campaign — the only way the learning layer produces anything.
3. Add the reservation lease, so a crash cannot consume a customer's quota.
4. Add auth tests for `domain-verify`, `admin_clear_flag`, and the Razorpay webhook.
5. Reconstruct the migration ledger, so a clean environment can be rebuilt by replaying the CLI history.
6. Partition `audit_events` before growth, not after.

---

## IX. Glossary

| Term | Meaning |
|---|---|
| **Choke point** | The single function every send must pass through (`reserve_send_slot`) |
| **Opener angle** | One of seven attention angles the AI is told to lead with |
| **Reply shape** | One of three reply structures: answer-first, detail-first, question-first |
| **Fold** | A scheduled aggregation that turns raw outcomes into learned state |
| **Gate** | A minimum sample/lift threshold that must be cleared before a hint publishes |
| **Hint** | Advisory text read by a sender; missing hint means default behaviour |
| **Kill switch** | A scoped `agent_config` row that disables a consumer |
| **Warm cap** | The ramp ceiling for a newly connected mailbox |
| **Recovery** | The reduced-cap state entered after a reputation breach |
| **Suppression** | A permanent per-address block, stronger than a lead flag |
| **Signal** | A device/IP observation recorded at signup; never blocks |
| **Fast lane / slow lane** | Deterministic router vs LLM fallback in the agent |
| **Fail-closed** | On uncertainty, refuse the action (safety path) |
| **Fail-safe** | On uncertainty, use the safe default (intelligence path) |

---

## X. Where everything lives

| Path | Contents |
|---|---|
| `src/routes/` | 33 TanStack Start routes |
| `src/integrations/supabase/` | Generated DB types and client |
| `src/lib/` | Address rules, shared client utilities |
| `supabase/functions/` | 36 Edge Functions + 40 shared modules |
| `supabase/migrations/` | 84 forward migrations + 17 rollback files, append-only |
| `scripts/.ops/` | Live probes, preflight checks, deno check config |
| `scripts/.stage8/` | Agent and erasure proofs |
| `scripts/stage4-simulation.mjs` | Learning-gate simulation |
| `ARCHITECTURE.md` | The short architecture brief |
| `SYSTEM-MANUAL.md` | This document |
| `AUDIT-*.md`, `*-AUDIT.md` | Historical audit reports |
| `INTELLIGENCE-LAYER-DESIGN.md` | The design doc the learning layer implements |

---

## Closing note

OutshipAi is a small system with an unusually strict spine. The parts that look over-engineered — the single SQL choke point, the sticky duplicate flag, the DNS proof, the unequally gated learners, the reservation-based AI budget — exist because the simpler versions of each were tried and failed in ways documented in Section VI.

The honest summary for a reviewer:

> The safety and correctness layer is production-grade. The learning layer is production-grade but data-starved. The billing layer is built and blocked on a credential. The product is one real campaign and one working key pair away from being able to prove itself.

---

# Appendix A — Complete commit history (324 commits)

Every commit from the first release to the current HEAD, oldest first.


## 2026-08 — 174 commits

- `d015f7d` 2026-08-22 — OutreachAI v1 — production release
- `13dab7e` 2026-08-22 — Handle email confirmation links in auth callback
- `100df35` 2026-08-22 — Killer feature: every email is a live product demo with viral footer
- `d4f72b8` 2026-08-23 — Security hardening: working edit/delete account, remove dead files
- `84ef8a7` 2026-08-23 — Defer payments gracefully, clean landing footer, billing webhook ready
- `f5d23fe` 2026-08-23 — Reply alert emails via user's own Gmail
- `da0c6b4` 2026-08-23 — Free AI Lead Finder via open business directories, honest pricing features
- `3c6a6e1` 2026-08-23 — Production hardening: DB indexes, query caps, batched counters, dead code removal
- `3df25a9` 2026-08-23 — PWA offline shell + CSP hash hardening + token vault wiring
- `4e49b2a` 2026-08-23 — Revert CSP hashing (breaks on Vercel), SW network-first navigations
- `addea6c` 2026-08-23 — Downgrade Gmail scope readonly->metadata (sensitive tier, free verification)
- `31de6e2` 2026-08-23 — Remove Lovable traces (error reporter, OG image, junk files), branded og.png
- `32c3489` 2026-08-23 — CAN-SPAM postal address line in footers (SENDER_ADDRESS env)
- `eb8e0ff` 2026-08-23 — Growth: smart send-time, live counter, referral system
- `30334fb` 2026-08-23 — Honest CTAs, robots+sitemap, dedupe meta tags
- `f3e1831` 2026-08-23 — Google Search Console verification file
- `221eadc` 2026-08-23 — Automation: warm-up ramp, AI reply sorting, booking links, weekend skip, daily digest
- `c800aa8` 2026-08-23 — Autopilot mode, 3-step sequences, global dedupe, shared OSM module
- `ae14fa4` 2026-08-23 — Accuracy: MX validation, bounce sweep, AI subject lines
- `05b0629` 2026-08-23 — Trust + growth: free tools page, live stats page, AI reply drafts, unified Groq helper
- `a20eab0` 2026-08-23 — Security hardening: DB-backed rate limits, prompt-injection sanitization
- `724a102` 2026-08-23 — Security: lock consume_ai_quota RPC to service-role only (quota-burn exploit fixed)
- `82ad1e4` 2026-08-23 — SEO: sitemap covers tools+stats; privacy wording covers reply classification
- `dd885fa` 2026-08-23 — Play Store readiness: PNG icons 192/512 + maskable, manifest id+categories
- `5a6b620` 2026-08-23 — Android app: TWA assetlinks for com.outreachai.app
- `4d9539c` 2026-08-23 — Add Android TWA app project (com.outreachai.app) — website + app in one repo
- `8f94bfd` 2026-08-23 — iOS premium install experience: PNG touch icon, iOS meta tags, smart Safari install banner
- `847ca48` 2026-08-23 — Backup: signing keystore + signed release builds (v1) — full recovery possible from this repo alone
- `5737436` 2026-08-24 — Security: rotate signing keystore, remove password-bearing build helpers
- `fc1fff5` 2026-08-24 — New brand logo everywhere: blue-cyan zap icon for web + all Android launchers/splash; rebuilt signed v1
- `051f24d` 2026-08-24 — Cleanup: exclude Android build intermediates from git
- `15e9c3f` 2026-08-24 — Ship: /agency DFY page, 20-niche template library, one-click AI reply sending, AI support chat widget
- `d67bf64` 2026-08-24 — Dual theme system: professional white default + navy dark mode with toggle on web, agency and app sidebar
- `db6e22a` 2026-08-24 — Monochrome rebrand: black & white light/dark themes, monochrome icons, app rebuilt v2
- `d749111` 2026-08-24 — Dark mode: restore signature navy+electric-blue palette (light stays monochrome)
- `868b217` 2026-08-24 — Deal pipeline (editable lead stages + won metric), bulk lead import; warm-up & dedupe confirmed live
- `31043e4` 2026-08-24 — Chat widget + agency CTAs use theme tokens — adapt to active theme
- `d8a8d68` 2026-08-24 — Trust pack: /security page, data export, risk-reversal badges, CAN-SPAM sender address
- `9ada887` 2026-08-24 — Founder note, /status live health page, footer links, status in sitemap
- `e2a6ac5` 2026-08-24 — Spam checker (UI + auto pre-send guard), one-click unsubscribe system, sitemap
- `0ada246` 2026-08-24 — Arabic language support: full i18n engine (auto-detect + RTL + toggle), landing translated, Gulf timezones, Arabic emails for Arab leads
- `c4ca5d2` 2026-08-24 — Fix sidebar header overlap when collapsed: logo text + theme toggle hide gracefully
- `e91edc9` 2026-08-24 — Fix sidebar footer overflow when collapsed (email + sign out)
- `26e369a` 2026-08-24 — Frontend audit fixes: table scroll on mobile, settings rows stack, dialog grid responsive, chat bubble size
- `1f8d117` 2026-08-24 — Audit round 2: campaign stats grid + action buttons responsive
- `cb5bc89` 2026-08-24 — Creative pack: lead temperature badges, win confetti, campaign health score, email signature, ROI calculator
- `b9062ee` 2026-08-24 — Pricing copy: value anchor line + consistent free-plan story (EN/AR)
- `387609d` 2026-08-24 — Honesty Charter: /honesty page with full defect disclosure, refund policy in Terms, honest-pricing section, billing trust strip
- `1084577` 2026-08-24 — Truth audit: landing caps match enforced PLAN_LIMITS exactly, perks list only real features, terms contact email fixed
- `4b883a7` 2026-08-24 — Official support email everywhere: outreachai.team@gmail.com (agency, honesty, privacy, security, terms)
- `395faf4` 2026-08-24 — Ethics completion: /about ethos page, dedicated /refunds policy page, verified-reviews pledge, checkout transparency line
- `7919480` 2026-08-24 — Charter self-audit fixes: true free tier (10/day), published exact limits per plan, softened meta claim
- `c3c4e9b` 2026-08-24 — Privacy pass: remove Lemon Squeezy/merchant-of-record mentions, team-based support language, fix broken mailto, proper Terms §10
- `6d70595` 2026-08-24 — We-built quote, team label, agency mailto fixes, removed unbuilt A/B claim from Growth plan
- `9ba1515` 2026-08-24 — Full Arabic site translation (94 keys), open tracking pixel, multipart emails with one-click List-Unsubscribe, charter limitation updates
- `8ce3fc2` 2026-08-24 — Arabic EN-only notice banner on all long-form pages
- `66d6199` 2026-08-24 — A/B subject split testing + Autopilot AI replies: real features shipped (schema, send-campaign, follow-up, campaigns UI, marketing copy)
- `203f47d` 2026-08-24 — DB-backed send queue (SKIP LOCKED worker, instant Launch), Groq key pool with rotation+backoff, autopilot cron contract fix
- `c95608a` 2026-08-24 — CRITICAL fix: missing useLang imports crashed app shell after login (esbuild does not catch undefined identifiers)
- `2a2752c` 2026-08-24 — Fix login crash (missing imports), duplicate i18n key, A/B stats var bug, create missing referrals table, regenerate DB types, add typecheck script
- `a7dc883` 2026-08-24 — Rewrite send-campaign cleanly (spliced version had fatal boot corruption): queue worker restored and booting, Deno.serve modernization
- `88353ee` 2026-08-24 — pg_cron hourly follow-up scheduler, queue revival pass, internal call auth fix, CRON_SECRET rotation
- `1330e58` 2026-08-24 — gitignore cron secret
- `733547e` 2026-08-24 — Overpass mirror failover for find-leads (primary 40s+ slow), UA header, support-chat real plan limits
- `09d3d53` 2026-08-24 — Add lead delete button (was missing entirely)
- `1eb2487` 2026-08-24 — Country dropdown in Add Lead (free text broke timezone morning filter)
- `616328a` 2026-08-24 — Add gmail.readonly scope (reply/bounce search was 403ing with metadata-only)
- `f26c44f` 2026-08-24 — Strip debug instrumentation from follow-up and send-campaign (all pipelines verified live)
- `882c28f` 2026-08-24 — Personal AI replies: full reply-body context, lead details, regenerate-on-send (no more verbatim repeats)
- `a263e5e` 2026-08-24 — Anti-repetition memory in AI reply prompts (both detection and regenerate paths)
- `f154991` 2026-08-24 — Soften email footer: remove promo link + naked URLs, keep honest AI disclosure and opt-out (spam-trigger reduction)
- `413206c` 2026-08-24 — Conversation Mode: multi-turn AI thread handling, owner takeover detection, booking-intent escalation, turn caps + alerts
- `2c490d8` 2026-08-24 — Alert policy overhaul: silent routine AI turns, one-click-draft link alerts, handoff notice at 3-turn cap, no more copy-paste digests
- `caa3ed5` 2026-08-24 — Fix quote-footer false unsubscribes via stripQuoted; mailbox-wide reply search; per-message dedupe; skip NOT_INTERESTED leads
- `5372a6c` 2026-08-24 — Pre-launch hardening: drop duplicate cron, widen booking classifier (10/10 tests), empty-body guard, NOT_INTERESTED skip, per-message dedupe
- `4eb95df` 2026-08-24 — Stranger audit fixes: social share meta (og/twitter), hide social-proof badge under 100 sends
- `80dfcdd` 2026-08-24 — Server-side lead caps per plan (DB trigger) + accurate tools validator error
- `497b4c0` 2026-08-24 — Strict usability fixes: real sender signature in AI emails (no [Your Name]), anti-hallucination rule, conversation turns saved for owner review
- `8ceb4e2` 2026-08-24 — Deep-test hardening: case-insensitive unique index on leads(user_id,email)
- `6425546` 2026-08-24 — CRITICAL unsubscribe fix: campaign filter could silently no-op opt-outs (compliance risk); now suppresses unconditionally + honest updated count
- `20fb0f7` 2026-08-24 — Production architecture: worker separation (send-worker/inbox-agent), policy engine, DB-enforced suppression, encrypted OAuth vault, lease+retry queue, audit trail, lifecycle state machine
- `e636d4d` 2026-08-24 — Production hardening pass: DB-enforced suppression verified, atomic send-slot reservation (reserve/release RPC), follow-up idempotency key, OAuth failure state machine (ACCESS_REVOKED/REAUTH_REQUIRED vs transient), RFC 8058-compliant unsubscribe headers on AI replies + GET redirect, reply-loop protections (autoresponder detect, 24h budget, echo guard, confidence floor->human), digest extracted to own cron fn with auth gate, audit triggers for lead.created/campaign.*, claim_v2 next_retry_at hot-loop fix, cron jobs rebuilt without invalid cast
- `e00d965` 2026-08-25 — fix(status): repoint health checks to live engines; add GET ?health probes
- `535b9ec` 2026-08-25 — fix(copy): clear subjects + sell-in-first-message with booking link
- `f2628bb` 2026-08-25 — fix(copy): stop duplicate booking links + make AI answer questions
- `466cc6c` 2026-08-25 — feat: AI answers lead queries from owner's website content
- `f93fb28` 2026-08-25 — feat: self-serve booking funnel + richer AI answers
- `72c9065` 2026-08-25 — fix: chat persistence + lead-finder error handling
- `241d25d` 2026-08-25 — fix: lead-finder timeout + live progress indicator
- `4dfcaaf` 2026-08-25 — fix: lead-finder hard timeout + friendly error for slow countries
- `9d27a8a` 2026-08-25 — feat: lead finder preview with user-controlled save
- `b3d52c2` 2026-08-25 — feat: Phase 1 — Onboarding / Business Intelligence
- `25ec82e` 2026-08-25 — fix: resolve 3 critical bugs found in architecture audit
- `b902640` 2026-08-25 — fix: 3 failure/recovery bugs from Part 3 audit
- `b7d82b7` 2026-08-25 — fix: two-phase insert pattern + DB constraint for concurrency safety
- `3279598` 2026-08-25 — fix: database audit — 2 bugs found and fixed
- `2b2e91b` 2026-08-25 — fix: database cleanup — drop dead columns, dead function, add performance indexes
- `1fc4e31` 2026-08-25 — docs: update DATABASE-AUDIT.md to reflect all fixes applied
- `4e58660` 2026-08-25 — audit: Part 6 deployment audit — delete stale follow-up function
- `ec68b07` 2026-08-25 — fix: Part 7 audit — 2 defects found and fixed
- `bb00d5f` 2026-08-25 — audit: Final acceptance test — full E2E chain verified against live production
- `a1b804e` 2026-08-25 — fix(leads): truncate long campaign names in dialogs
- `314b91f` 2026-08-25 — feat(leads): add Google Maps lead finder with website email scraping
- `db229a1` 2026-08-25 — fix: resolve 8 defects from production audit
- `4601d1e` 2026-08-26 — fix(google-maps): migrate to Places API (New) v1 endpoint
- `938ea8b` 2026-08-26 — feat: dedicated Lead Finder page
- `9b1b043` 2026-08-26 — fix: dark mode toggle + pure black/white theme
- `6079773` 2026-08-26 — feat: campaign column in leads + fix chat dark mode
- `117f340` 2026-08-26 — fix: truncate long campaign/name/company in leads table
- `76fa0c0` 2026-08-26 — feat: inline editing for campaign names and lead fields
- `1c77b9f` 2026-08-26 — fix: prevent content clipping at browser zoom
- `f3db4dc` 2026-08-26 — feat: full edit dialog for every lead
- `343632f` 2026-08-26 — fix: edit dialog crash — Radix Select can't use empty string value
- `b6cdba5` 2026-08-26 — feat: full-page lead edit instead of dialog
- `a629738` 2026-08-26 — fix: hide Lead Finder from sidebar menu
- `3191170` 2026-08-26 — fix: lead edit route — use flat path to avoid nesting under leads page
- `b203ffa` 2026-08-26 — feat: full-page campaign edit
- `292dc32` 2026-08-26 — fix: settings page full-width layout
- `7846eac` 2026-08-26 — feat: Phase 1 — Lead Discovery Engine enhancements
- `a9a2bdd` 2026-08-26 — Phase 2: Email verification pipeline
- `00f8adc` 2026-08-26 — Phase 3: Lead Quality + User Review Workflow
- `4b992ea` 2026-08-26 — Phase 4A: Campaign Review & Launch page with image upload
- `31f2b04` 2026-08-26 — Phase 4B: Real Customer Reply Handling — expanded intent taxonomy + conversation UI
- `abda40a` 2026-08-26 — Phase 5A: Dashboard Analytics — complete business pipeline visualization
- `e4bcaea` 2026-08-26 — Production audit: security fixes, follow-up system, click tracking
- `d79e1dd` 2026-08-27 — Phase 1: Complete long-term follow-up engine
- `4b39d21` 2026-08-27 — fix: dedicated Human Conversion Analytics section with proper metrics
- `25e968a` 2026-08-27 — fix: restore Human Conversion in funnel + major support chat upgrade
- `a881c6c` 2026-08-27 — fix: add checkmark icon to Human Conversion in funnel
- `c6793f9` 2026-08-27 — fix: same ArrowRight on every funnel stage including Human Conversion
- `1ffab48` 2026-08-27 — fix: move FOLLOWUP_COPY_CONTEXT before try block to fix TDZ error
- `bd66f0f` 2026-08-27 — feat: website email enrichment — public email discovery from business websites
- `9bd88c0` 2026-08-27 — fix: remove emojis from UI — professional tone throughout
- `3f9c6d5` 2026-08-27 — fix: professional emoji + support chat privacy
- `ed92662` 2026-08-27 — revert: restore all original emojis in UI
- `c599a09` 2026-08-27 — feat: replace falling emoji confetti with canvas-confetti popper
- `a86d3fd` 2026-08-27 — chore: bump service worker cache version to v3
- `baf8e0e` 2026-08-28 — fix: production audit fixes — gmail token persistence, worker slot leak, follow-up RPC hardening, analytics event names, null-email lead save, inbox UX
- `03e5052` 2026-08-28 — fix: reclaim stranded 'sending' follow-up leads (30min grace) + drop repo junk (NUL, build logs)
- `8af19eb` 2026-08-28 — fix: reclaim stranded follow-up sends; pin verify_jwt config for worker functions
- `e640dbe` 2026-08-28 — fix: track-click platform JWT gate broke tracked links (401) for leads - verify_jwt=false
- `3052818` 2026-08-28 — fix: daily-digest excluded first-time users (NULL last_digest_date) - OR null into candidate query
- `ce0141e` 2026-08-28 — chore: pin track-click + spam-check verify_jwt in root config
- `ffd1025` 2026-08-28 — docs: final production readiness audit report
- `5019d90` 2026-08-28 — feat: AI answers product/pricing questions first; hand off only when truly stuck
- `1694572` 2026-08-28 — feat(inbox-agent): thread memory, full-site knowledge crawl, objection intelligence
- `6c0ea27` 2026-08-28 — feat: professional cold-email subjects, no-website niche mode with phone handoff, website-only answering, objection reconciliation
- `563f621` 2026-08-28 — feat: hybrid campaign delivery — local-morning (default) or instant send per campaign
- `714be95` 2026-08-28 — feat: stop self-notification emails — inbox keeps only client emails, outreach notifies in-app
- `55291a7` 2026-08-28 — feat: warm B2B network — opt-in discoverability, intro requests with in-app alerts, matches in AI lead finder
- `90666e4` 2026-08-28 — feat: referral reward — 7 days free starter per friend who joins via your link
- `212e879` 2026-08-29 — feat(ai): smarter cold-email writer — lead facts, attention openers, few-shot voice, script-aware language detection (AI upgrade #1)
- `767f6f8` 2026-08-29 — feat(ai): smarter reply classifier — thread history, few-shot examples, and a 'reason' evidence field (AI upgrade #2)
- `ee39cbb` 2026-08-29 — feat(ai): reply writer continuity — own-past-reply awareness, no self-contradiction, no invented facts/links (AI upgrade #3)
- `e622f16` 2026-08-29 — feat(ai): follow-up arc — early value, proof, gentle decision, polite breakup across all 13 steps (AI upgrade #4)
- `0a5239b` 2026-08-29 — fix(ai): encode non-ASCII email subjects as RFC 2047 — Arabic/emoji subjects were mangled to garbage by Gmail (ser: 'aaassshASSSS') because raw 8-bit headers have no charset
- `a1f45d5` 2026-08-29 — feat(ai): smarter support chat — persisted threads, real account context (plan/usage/Gmail state), inline Arabic detection, cross-device history (AI upgrade #5)
- `487f649` 2026-08-29 — fix: Arabic cold-email subjects survive + never mixed-lingual; regenerate DB types so typecheck is clean
- `c280be6` 2026-08-29 — feat: push notifications — bell with live unread badge, settings toggle, owner_alerts→push_queue trigger, pg_cron push-drainer with VAPID web-push (high/medium alerts only)
- `1f41827` 2026-08-29 — ui: theme toggle only in sidebar — remove duplicate from top header
- `5becac7` 2026-08-29 — fix(web): eliminate hydration error + guard against stale service worker (white screen fix)
- `9ebcc06` 2026-08-29 — fix(find-leads): enforce country targeting on Google Maps + normalize country codes/aliases
- `238c4e2` 2026-08-29 — fix(web): mount SPA with createRoot (no hydration mismatch #418) + allow Google Fonts in CSP
- `05f5a17` 2026-08-29 — fix(sw/csp): stop service worker from killing font fetches
- `dab0e6d` 2026-08-29 — chore: re-trigger vercel deploy
- `210486a` 2026-08-29 — fix: mount React root on document to stop infinite event-dispatch freeze (react#37065)
- `a35e382` 2026-08-29 — feat(lead-finder): AI planning + curation, location targeting, varied metros, dedupe, area suggestions, caching
- `9099186` 2026-08-30 — feat(lead-finder): efficient quota use + own saved-database memory layer
- `94e3b24` 2026-08-30 — feat(lead-finder): freshness rotation — rediscover new businesses in covered areas
- `7841064` 2026-08-30 — feat(warm-areas): nightly leftover-quota worker to grow 'our own map'
- `24861af` 2026-08-30 — feat(chat): reachable before login — visitor/guest mode on landing + signup
- `3c0a25a` 2026-08-30 — feat(chat): delete conversation button (trash icon in header)
- `04f03b7` 2026-08-31 — chore(brand): rename OutreachAI to OutShipAI across web + app
- `4a8d80f` 2026-08-31 — chore(brand): restyle brand casing to OutshipAi

## 2026-09 — 70 commits

- `55a3c3c` 2026-09-04 — fix(security): harden headers, CORS, auth trust, rate limits, minor bugs
- `2b6e7ad` 2026-09-04 — fix(security): add shared CORS helper
- `bfcc318` 2026-09-04 — fix(security): HMAC-signed unsubscribe + track-click URLs, crypto warning
- `9ad00ed` 2026-09-07 — Polish: Substack-style typography, motion, and skeletons
- `ff3af51` 2026-09-07 — Fix: relax CSP script-src to unblock TanStack Start inline scripts
- `f0db5e0` 2026-09-07 — hero: add floating bubbles, cursor-tracking blue glow, magnet CTAs, card glare
- `64988a2` 2026-09-07 — Revert "hero: add floating bubbles, cursor-tracking blue glow, magnet CTAs, card glare"
- `8e5fe94` 2026-09-07 — landing: brand accent, hero product mock, stats strip, closing CTA, scroll reveal
- `98e71e4` 2026-09-07 — landing: strictly monochrome black & white
- `24c090d` 2026-09-07 — landing: editorial polish — app-screenshot mock, italic serif hero, kicker rules, footer columns, nav underline
- `99fbfdb` 2026-09-07 — landing: mobile menu, how-it-works steps, FAQ + schema, honest badge
- `e8eae72` 2026-09-07 — landing: craft pass — scrollspy nav, layered hierarchy, grain, staggered reveals, count-up stats, mono slider, window dots, whitespace
- `62065e2` 2026-09-10 — landing: lazy-mount hero orb after idle, cap pixel ratio & gate render on visibility for perf
- `904924e` 2026-09-10 — backend: commit stage 0a-9 layer — intelligence, sender-health, cost gate, memory, outcome-verified cron health
- `ca7004b` 2026-09-10 — ops: add CRON_SECRET rotation + post-rotation verification tooling
- `f5fa23e` 2026-09-10 — ops: dead-man's switch proof + recovery tooling, .env.example placeholder
- `8149652` 2026-09-10 — backend: gate support-chat behind the AI-cost meter (guest bucket + signed-in quota)
- `8f7f88a` 2026-09-10 — ops: codify shared-module bundle rule; attribute quota-only LLM callers
- `e097575` 2026-09-10 — ops: standing pre-deploy gate -- deploy-fn wrapper enforces staleness sweep
- `e13c9ef` 2026-09-11 — backend: authenticated lead-erasure path — forget/delete RPC wrapper + dashboard triggers
- `bdfab3f` 2026-09-12 — backend: harden follow-up send window — PASS 1 pacing + runtime ceiling, pre-send recheck, reply-cancel trigger covers 'sending'; add dry-run scoping; document audit-2026-09-12
- `3351490` 2026-09-12 — backend: default follow-up sequence -> 4 touches (day 3,7,14,21); re-schedule active mid-sequence leads
- `31ad60f` 2026-09-12 — backend: Calendly webhook for confirmed bookings — meetings growth migration, owner-scoped attribution + follow-up stop + high-priority alert, honest Bookings KPI (meetings not intent), webhook bootstrap card + config endpoint, branchless constant-time HMAC verify, sim+live proofs; fix campaign generator fallback link + soft-pedal booking claims in marketing
- `74fa0f8` 2026-09-12 — ops: scope deploy-fn pre-deploy staleness gate to non-targeted functions — the function being deployed is exempt (deploying it is the fix for its own staleness), any other stale bundle still aborts; post-deploy sweep stays unscoped so a partial fix can never look clean; add deploy-gate-scope regression proof (deploy-then-touch fabrication, abort-vs-exempt matrix)
- `3672ced` 2026-09-12 — landing: instant hero visual — paint 3d-core.jpg poster from first paint (no JS/WebGL dependency), swap it out only after the lazy three.js orb paints its first frame, keep poster as permanent fallback on no-WebGL / reduced-motion, warm the 521kB three chunk in the same idle callback that boots the orb; declare three dep + sync lock
- `58cd361` 2026-09-12 — landing: give agent-badge a real dark-mode surface (glass chip + readable text) instead of a washed-out white streak with grey text
- `94c669d` 2026-09-12 — landing: drop the static hero poster entirely — show the webgl orb directly, booting it right after first idle (no window.load wait) so the 3D appears in under a second instead of flashing a jpg first
- `16bde0b` 2026-09-12 — app: fix the browser url-bar tint so the app doesn't look like a website — theme-color meta was misplaced (.name in links[] rendered nothing) and the manifest still carried the old purple #7c3aed, painting the phone chrome purple; now matches the app bg (#fcfcfc light / #070707 dark via the theme toggle)
- `8b628a3` 2026-09-12 — app: linear-style dashboard + app-shell pass (compact header, segmented date toolbar, tight KPI strip, flat small panels) — website untouched
- `c2f116e` 2026-09-12 — app: linear-style pass across all app screens (billing, editors, lead-finder, onboarding) — flat small panels, compact headings, no card shadows; website untouched
- `5a208dd` 2026-09-12 — app: professional product polish — solid primary buttons (no gradient/glow), no emoji or marketing flourish inside the app; keeps website untouched and same monochrome theme
- `6608383` 2026-09-13 — app: make it behave like a real app — fixed viewport frame (h-dvh) so the sidebar/top bar stay pinned and only the content area scrolls; dashboard is now a two-column workspace with internally-scrolling panels instead of one long website-style page
- `5f97bd5` 2026-09-13 — ops: bump service worker version to force fresh app shell on all clients
- `50c4cc3` 2026-09-13 — app: app-chrome redesign — dark Linear-style sidebar on desktop with light content area; phone now gets a bottom tab bar (Dashboard/Leads/Campaigns/Emails + More sheet) and a top logo bar; no more website-style layout
- `db772f6` 2026-09-17 — fix: single shared APP_BASE_URL for every lead-facing link
- `9d1646f` 2026-09-18 — fix: harden send-worker slot release, inbox-agent turn budget, and health-check crash alert; add deno typecheck gate with type-only shared plumbing
- `669d75d` 2026-09-19 — feat: shared SiteHeader for marketing site, homepage conversion nav, and hero-nodes preview route
- `c135089` 2026-09-19 — perf: load homepage hero orb immediately and show a static placeholder
- `e09d13b` 2026-09-19 — hero: remove CSS ghost/shadow behind 3D orb, preload three chunk in shell for faster load
- `c4f4fb8` 2026-09-19 — hero: restore orb ground shadow only
- `24bedc8` 2026-09-20 — app: theme-aware collapsible sidebar + mobile drawer with full menu
- `ffede01` 2026-09-22 — Switch canonical host: outreach-ochre-sigma.vercel.app -> out-ship.com
- `e95d8d3` 2026-09-22 — chore: untrack 55MB kotlin-compiler jar + scratch pngs/scan scripts; ignore android m2local
- `551f045` 2026-09-22 — perf: drop RoomEnvironment for baked env; tighten hero-to-header gap; add orb first-paint placeholder
- `0ca08f9` 2026-09-23 — fix: restore polished chrome shine via studio light-box env bake
- `48233ba` 2026-09-23 — fix: pitch-black polished orb — charcoal env, near-black metals, moodier reflections
- `3b6c50f` 2026-09-23 — fix: smarter support-chat — topic router, self-facts, controls, few-shots kill deflect-latch
- `2c6708b` 2026-09-23 — fix(support-chat): off-topic redirect matched to user intent
- `62e2634` 2026-09-24 — fix(cost-sweep): heal false-drift lock on fresh windows, allow sweep-owned degrade to self-heal
- `d9e9fe9` 2026-09-28 — fix(billing): pass user_id in checkout URL so LemonSqueezy webhook can upgrade plans
- `e805dc8` 2026-09-28 — feat(ai): let the agent handle pricing, angry, security/legal and ambiguous replies
- `7c10805` 2026-09-28 — feat(billing): replace LemonSqueezy with Razorpay checkout
- `4e83ee0` 2026-09-28 — fix(billing): use TextEncoder for webhook signature comparison
- `2395b71` 2026-09-28 — refactor(billing): remove LemonSqueezy completely
- `a94e6b1` 2026-09-28 — fix(support-chat): stop the bot promising refunds it cannot authorize
- `f58f398` 2026-09-29 — Fix notification deep links, collapsed sidebar logo, and chatbot billing facts
- `3aab2cc` 2026-09-29 — Add QA cleanup scripts for support-chat test data
- `87d5be9` 2026-09-29 — Add tenant-isolation audit harness
- `25df6d6` 2026-09-29 — Add action-budget: per-message and per-conversation step caps
- `3690dd8` 2026-09-29 — generate-email: stop inventing lead facts that were never supplied
- `78cf7c8` 2026-09-29 — Add an AI quality gate; fix two defects it found on first run
- `9a0dc71` 2026-09-29 — Rewrite customer-facing copy in plain language (EN + AR)
- `bea0071` 2026-09-30 — agent: add intent-first chat agent with confirm-gated writes
- `6de6637` 2026-09-30 — agent: fix three safety bugs the live proof exposed in v1
- `f288032` 2026-09-30 — docs: the frontend was never blocked - it auto-deploys on push
- `5f282c2` 2026-09-30 — Agent: understand meaning first, then learn the words
- `a956544` 2026-09-30 — agent: do not claim "learned nothing" when the request failed
- `f5fe755` 2026-09-30 — agent: confusion retires a phrase, an empty result does not
- `e1e7c17` 2026-09-30 — agent: let the chat fill the page like the other screens
- `3b33465` 2026-09-30 — agent: saved chats were never missing, the UI just could not see them

## 2026-10 — 69 commits

- `6755da9` 2026-10-01 — agent: resolve the target before asking anyone to confirm
- `ee6d368` 2026-10-03 — agent: remember the user and answer the questions they actually asked
- `d2b027f` 2026-10-03 — agent: stronger business-intro recognition and grounded chat replies
- `8b23a58` 2026-10-03 — Stop asking for slots the person already gave
- `42845ae` 2026-10-04 — Fix two bugs my own tests were hiding
- `8f16275` 2026-10-04 — Teach the agent the owner's account and business from the database
- `4ec36d0` 2026-10-04 — Stop the agent repeating itself and asking what it already knows
- `8f7398f` 2026-10-04 — Fix the repeated "not segmented yet" reply for real
- `21f71ec` 2026-10-04 — Stop dead-ending with "I could not work that out just now"
- `ce3d8c9` 2026-10-07 — Report AI pool size from health-check
- `5680655` 2026-10-07 — Menu-first agent: 6 clicks, zero AI calls
- `cb6bc04` 2026-10-07 — Update @tanstack/react-start to clear the deploy block
- `fbfb744` 2026-10-07 — Bump service worker to v7 so clients drop stale caches
- `676b9d0` 2026-10-07 — Show the menu after every reply, not only at the top
- `b81c9d4` 2026-10-07 — Answer the agent's own questions instead of dead-ending on them
- `2849e65` 2026-10-07 — Replace the flat menu with a drill-down tree covering the whole app
- `6c8be76` 2026-10-08 — Fix campaign name parsing to ignore filler like "a campaign"
- `aa248c2` 2026-10-08 — Fix confirm acceptance for multi-word yes ("Yes, do it")
- `936dfb1` 2026-10-08 — Format the two recent agent fixes
- `6e2b521` 2026-10-09 — Ask for a campaign name before confirming the write
- `38a29be` 2026-10-09 — Fill the campaign name deterministically and just create the draft
- `f1a0cf1` 2026-10-09 — Save email-less businesses to the shared ledger too
- `e899d55` 2026-10-09 — Make the agent menu a visual launcher
- `e1bd0b9` 2026-10-09 — Update contact email to outshipai@gmail.com
- `a5bb6f9` 2026-10-09 — Razorpay: international readiness preflight + safe credential connector
- `57974a9` 2026-10-10 — Fix razorpay preflight: Management API returns a hash, not the value
- `dfb9eb7` 2026-10-10 — Enforce plan limits in DB (campaigns + leads), show them on billing
- `d40dc4d` 2026-10-11 — Refund policy: 14-day on first purchase, fix cancel wording
- `199ccb4` 2026-10-11 — Honesty: disclose Find Leads email-availability gap
- `d2bbf21` 2026-10-11 — Background website->email crawler to enrich the shared business map
- `617da00` 2026-10-11 — Budget-driven map warmer: spend leftover daily Google quota on area coverage
- `8b34cdf` 2026-10-12 — Agency: add how-it-works + FAQ, honest cancel wording, self-serve link
- `f88523e` 2026-10-12 — SEO: unique title + meta description for every public page
- `963ee61` 2026-10-12 — Analytics: add GA4 (G-95GHJXR7D4) + allow Google domains in CSP
- `eb130af` 2026-10-12 — Perf: defer heavy homepage JS (three.js orb, support chat, supabase) to idle
- `6e97be1` 2026-10-13 — Fix wrong Supabase key env var (ANON_KEY -> PUBLISHABLE_KEY) in status, support-chat, unsubscribe
- `713cc63` 2026-10-13 — Email: send via SendGrid; capture replies + bounces without Gmail
- `216a253` 2026-10-13 — Remove Gmail connect flow from the UI
- `163cb03` 2026-10-13 — Drop Gmail wording from public pages and support copy
- `599def3` 2026-10-13 — Revert "Drop Gmail wording from public pages and support copy"
- `2c3db80` 2026-10-13 — Revert "Remove Gmail connect flow from the UI"
- `014bd4a` 2026-10-13 — Revert "Email: send via SendGrid; capture replies + bounces without Gmail"
- `fec250b` 2026-10-13 — Dashboard: add funnel, performance trend, and reply sentiment charts
- `8298e5b` 2026-10-13 — Dashboard charts: match theme colors, replace sentiment with intent donut
- `7ff0b91` 2026-10-13 — Dashboard: single Reply Trend graph; restore pre-chart layout
- `ee4a339` 2026-10-14 — Reply Trend: draw Interested as a line over the Replies area
- `1e74ae5` 2026-10-14 — Reply Trend: use ComposedChart so the Interested line renders
- `35ef303` 2026-10-14 — Reply Trend: add Sent as faint background bars
- `9a55cde` 2026-10-14 — Reply Trend: make Sent, Replies and Interested all lines
- `4e6c92b` 2026-10-14 — Reply Trend: dash the Interested line so overlapping Replies stays visible
- `b15b233` 2026-10-14 — Reply Trend: solid Interested line; thicker Replies line
- `a1f424c` 2026-10-14 — fix(dashboard): proper dark-mode colors for warn StatCard and intent grays
- `739f391` 2026-10-14 — fix(outreach): stop inventing lead specifics in cold email
- `90fa235` 2026-10-14 — Dashboard: polish reply trend chart (gradient areas, dual axis, counts/rate toggle, zero-filled axis)
- `5ffc321` 2026-10-14 — Dashboard: revert reply trend to stable LineChart (fix blank render)
- `735a429` 2026-10-14 — Dashboard: restore known-good reply trend chart
- `b910e76` 2026-10-14 — Dashboard: gradient areas for reply trend (step 1)
- `3693f7f` 2026-10-14 — Dashboard: subtle point dots on reply trend (step 2)
- `21138da` 2026-10-15 — Landing: brand casing, trust strip, sample email + reply section
- `e32bf7d` 2026-10-23 — Eval: dev2 split, per-row tags, four-outcome scoring
- `ccfcda8` 2026-10-28 — fix(agent): never invent contact details; cap lead-crawl CPU cost
- `57e89eb` 2026-10-28 — Eval: per-row rule-layer reporter + Oct 21 result tables
- `7cf57f7` 2026-10-28 — Settings: explain Google's unverified-app warning next to Connect Gmail
- `8e5e2eb` 2026-10-28 — Backend: recover inbound-email + email-events source into the repo
- `7553409` 2026-10-30 — Agent menu: 'Add a lead' shortcut opens the Add Lead dialog
- `1754a30` 2026-10-30 — Wording: call them contacts, not leads
- `b1831ed` 2026-10-30 — Contacts: select many and delete in one action
- `4120b05` 2026-10-30 — About: rewrite the page around what we refuse to do
- `39e9a0f` 2026-10-30 — About: clarify one-address pricing, drop the data-sourcing detail

## 2026-11 — 11 commits

- `f4ae37a` 2026-11-01 — Opener learning: record the angle, then act on the one that works
- `7213529` 2026-11-01 — Learning: act on the subject winner, stop dead follow-up tails
- `9a1e400` 2026-11-01 — Reply-style learning: give the reply a recorded shape, then learn from meetings
- `2314bde` 2026-11-01 — Stop free-trial farming: lifetime cap, business identity, DNS domain proof
- `db20276` 2026-11-01 — Scope send_block_reason to the caller's own account
- `3fecc47` 2026-11-01 — Format the new anti-abuse UI files
- `f71a687` 2026-11-02 — Say plainly what free now is: 50 emails total, up to 10 a day
- `add8406` 2026-11-02 — Reject a country name as the business address
- `220fd2b` 2026-11-02 — Keep the block-reason string compatible with the deployed bundle
- `a5dd901` 2026-11-02 — Restore the specific address reason now that the bundle is live
- `74701dd` 2026-11-03 — Add the operator console, and fix two bugs it exposed

---

# Appendix B — Edge Function reference (36 functions)

All functions are stateless Deno/TypeScript deployed to Supabase. Auth is listed per function; `service_role` always bypasses RLS.

| # | Function | Purpose |
|---|---|---|
| 1 | `agent` | Intent-first chatbot. Deterministic router first, LLM only on a miss; learned vocabulary makes repeats free. Cannot send email; every write needs a server-checked confirmation. |
| 2 | `calendly-webhook` | Calendly booking webhook. Verifies Stripe-style HMAC signature + 300s replay window, resolves the owning account, writes `meetings`, stops the sequence. |
| 3 | `cost-sweep` | Every 5 minutes. Reconciles AI counters against the spend ledger, writes the dual quality markers, audits drift. Never rewrites counters. |
| 4 | `daily-digest` | Builds and sends the owner's daily summary (sent, replies, meetings, bounces, queue state). |
| 5 | `delete-account` | Authenticated account deletion. Cascades Gmail tokens, ledgers and profile rows; documents what the user must revoke at Google. |
| 6 | `domain-verify` | DNS TXT proof of domain ownership for a duplicate-business challenge. Google DoH then Cloudflare DoH; freemail rejected; one verified domain per account. |
| 7 | `email-events` | SendGrid event webhook. Bounce/drop → suppression + queue cancel; spam/opt-out → unsubscribe + pause. Idempotent, audited. |
| 8 | `find-leads` | Lead discovery API. Google Places (New) + OpenStreetMap + shared map cache; verifies emails; enforces plan lead caps. |
| 9 | `generate-email` | Generates one outreach email (subject + body) for a lead with the campaign's business context and opener angle. |
| 10 | `get-calendly-config` | Returns the webhook URL + signing key so the owner can register the Calendly subscription. Authenticated. |
| 11 | `gmail-oauth` | OAuth 2.0 start/callback. Encrypts refresh/access tokens with AES-GCM before storage; never returns them to the browser. |
| 12 | `health-check` | Hourly infra watchdog. Five probes: Gmail token validity, queue age, cron execution markers, sender reputation, AI cost drift. |
| 13 | `inbound-email` | SendGrid Inbound Parse receiver for `r-<leadId>@reply-domain`. Persists the reply, marks the thread, raises an alert. No Gmail read scope. |
| 14 | `inbox-agent` | Inbound intelligence only. Strips quotes, dedupes, classifies to structured JSON, then the deterministic policy engine decides the action. Also runs the 05:00 autopilot top-up. |
| 15 | `lead-erasure` | Authenticated wrapper over `forget_lead` / `delete_lead`. Ownership gate is inside the RPC; returns the row counts actually erased. |
| 16 | `learning-loop` | Single writer for the intelligence layer: lead scores hourly, campaign fold nightly, strategy fold weekly. Advisory only; never raises a cap. |
| 17 | `network-intros` | Double opt-in B2B intros. Contact details are never exposed before acceptance. |
| 18 | `push-drainer` | Drains `push_queue` once a minute and sends Web Push to every registered device. |
| 19 | `push-subscribe` | Returns the public VAPID key and stores a device subscription. |
| 20 | `razorpay-create-order` | Server-side order creation. The browser sends a plan id; the amount comes from the server catalog. Order written to `payments` with the uid resolved from the JWT. |
| 21 | `razorpay-webhook` | The only place a plan is granted. Constant-time HMAC over the raw body; the plan comes from our own `payments` row, never the payload; idempotent on payment id. |
| 22 | `referral-claim` | Credits a signup to the referrer; grants 7 days of starter, stacked, never downgrading. |
| 23 | `reputation-report` | Nightly sole writer of `sender_health`. 7-day bounce/unsub rates drive a deterministic cap brake. |
| 24 | `send-campaign` | Enqueue only. Validates eligibility, MX, disposable addresses, duplicates and plan caps, then writes `send_queue` rows with advisory priority. |
| 25 | `send-reply` | Sends an owner-approved reply inside an existing Gmail thread. |
| 26 | `send-worker` | The only component that puts outreach mail on the wire. Claims queue jobs, reserves quota atomically, generates with learned hints, sends via Gmail, runs follow-ups. |
| 27 | `signup-signal` | Records device id + salted IP hash at signup. Observation only; never blocks. |
| 28 | `spam-check` | Deterministic pre-send content score (0–100) with severity-tagged issues. Advises, never blocks. |
| 29 | `suggest-areas` | Suggests geographic areas/niches for lead discovery, using the shared map and demand signals. |
| 30 | `support-chat` | Public, account-aware support widget with a global guest AI budget and persisted threads. |
| 31 | `tools` | Authenticated tool gateway: saves businesses, looks up leads, rate-limited per tool and per user. |
| 32 | `track-click` | Click redirector. Records the click, then 302s to the destination. |
| 33 | `track-open` | 1×1 tracking pixel. Records `opened_at`; treated as a weak signal. |
| 34 | `unsubscribe` | One-click RFC 8058 opt-out plus reply-keyword path. Suppression enforced at three levels. |
| 35 | `warm-areas` | Background leftover-quota worker. Refreshes stale areas and seeds new niche×metro combos within the unspent Google allowance. |
| 36 | `website-crawl` | Background email backfill for `saved_businesses`: crawl a site with no email, verify, write back. One crawl benefits every future search. |

## Auth and trigger model

| Class | Functions | Control |
|---|---|---|
| Cron (shared secret) | `send-worker`, `inbox-agent`, `learning-loop`, `health-check`, `cost-sweep`, `reputation-report`, `push-drainer`, `daily-digest`, `warm-areas`, `website-crawl` | `x-cron-secret` compared to `CRON_SECRET` |
| Provider webhook (no JWT) | `email-events`, `inbound-email`, `razorpay-webhook`, `calendly-webhook` | Provider signature / shared secret |
| Authenticated user | `agent`, `domain-verify`, `find-leads`, `generate-email`, `lead-erasure`, `signup-signal`, `support-chat`, `tools`, `track-*`, `unsubscribe`, `razorpay-create-order`, `get-calendly-config`, `push-subscribe`, `referral-claim`, `send-campaign`, `send-reply`, `gmail-oauth`, `razorpay-*` | Supabase JWT resolved with `auth.getUser` |
| Public | `push-subscribe` (public key), `unsubscribe`, `track-open`, `track-click` | Token/opaque id in the URL |

---

# Appendix C — Complete data model (51 tables, 499 columns)

Every table has RLS enabled. A table with zero policies is deny-all for `anon`/`authenticated` and reachable only through `service_role` or a `SECURITY DEFINER` function.


## `admin_actions`

Audit log of operator actions (flag / clear), with actor, target, note and time.

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` |
| `actor_id` | `uuid` | null |  |
| `target_id` | `uuid` | null |  |
| `action` | `text` | NOT NULL |  |
| `note` | `text` | null |  |
| `created_at` | `timestamp with time zone` | NOT NULL | `now()` |

**Constraints:** `admin_actions_pkey: PRIMARY KEY (id)`


## `admins`

Operator allowlist. Separate from `profiles`; authority is granted here, not by a profile flag.

| Column | Type | Null | Default |
|---|---|---|---|
| `user_id` | `uuid` | NOT NULL |  |
| `note` | `text` | null |  |
| `created_at` | `timestamp with time zone` | NOT NULL | `now()` |

**Constraints:** `admins_pkey: PRIMARY KEY (user_id)`; `admins_user_id_fkey: FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE`


## `agent_action_state`

Per-message and per-conversation action counters — the step budget that dollar budgets cannot bound.

| Column | Type | Null | Default |
|---|---|---|---|
| `conversation_id` | `uuid` | NOT NULL |  |
| `message_id` | `text` | null |  |
| `used_in_message` | `integer` | NOT NULL | `0` |
| `used_in_conversation` | `integer` | NOT NULL | `0` |
| `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |

**Constraints:** `agent_action_state_pkey: PRIMARY KEY (conversation_id)`; `agent_action_state_used_in_conversation_nonneg: CHECK ((used_in_conversation >= 0))`; `agent_action_state_used_in_message_nonneg: CHECK ((used_in_message >= 0))`


## `agent_config`

Scoped key/value judgment config and kill switches. Resolution `glob → user → campaign`.

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` |
| `key` | `text` | NOT NULL |  |
| `scope` | `text` | NOT NULL |  |
| `scope_id` | `uuid` | null |  |
| `value` | `jsonb` | NOT NULL |  |
| `version` | `integer` | NOT NULL | `1` |
| `enabled` | `boolean` | NOT NULL | `true` |
| `changed_by` | `text` | null |  |
| `created_at` | `timestamp with time zone` | NOT NULL | `now()` |
| `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |

**Constraints:** `agent_config_pkey: PRIMARY KEY (id)`; `agent_config_scope_check: CHECK ((scope = ANY (ARRAY['glob'::text, 'user'::text, 'campaign'::text])))`


## `agent_conversations`

Agent chat threads with titles and last-message recency.

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` |
| `user_id` | `uuid` | NOT NULL |  |
| `title` | `text` | NOT NULL | `'New chat'::text` |
| `created_at` | `timestamp with time zone` | NOT NULL | `now()` |
| `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |

**Constraints:** `agent_conversations_pkey: PRIMARY KEY (id)`; `agent_conversations_user_id_fkey: FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE`


## `agent_learned_phrases`

Fast-lane vocabulary cache: a phrasing mapped to an intent, promoted after a second conversation.

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | `bigint` | NOT NULL |  |
| `user_id` | `uuid` | NOT NULL |  |
| `scope` | `text` | NOT NULL | `'*'::text` |
| `phrase` | `text` | NOT NULL |  |
| `intent` | `text` | NOT NULL |  |
| `params` | `jsonb` | NOT NULL | `'{}'::jsonb` |
| `state` | `text` | NOT NULL | `'provisional'::text` |
| `uses` | `integer` | NOT NULL | `0` |
| `correct` | `integer` | NOT NULL | `0` |
| `last_used_at` | `timestamp with time zone` | NOT NULL | `now()` |
| `created_at` | `timestamp with time zone` | NOT NULL | `now()` |

**Constraints:** `agent_learned_correct_nonneg: CHECK ((correct >= 0))`; `agent_learned_intent_check: CHECK ((intent = ANY (ARRAY['list_campaigns'::text, 'campaign_stats'::text, 'find_contacts'::text, 'sender_health'::text, 'complianc`; `agent_learned_params_object: CHECK ((jsonb_typeof(params) = 'object'::text))`; `agent_learned_phrases_pkey: PRIMARY KEY (id)`; `agent_learned_phrases_user_id_fkey: FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE`; `agent_learned_state_check: CHECK ((state = ANY (ARRAY['provisional'::text, 'account'::text, 'retired'::text])))`; `agent_learned_uses_nonneg: CHECK ((uses >= 0))`


## `agent_messages`

Chat messages, including `executed_at` which makes a confirmation single-use.

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` |
| `conversation_id` | `uuid` | NOT NULL |  |
| `user_id` | `uuid` | NOT NULL |  |
| `role` | `text` | NOT NULL |  |
| `content` | `text` | NOT NULL |  |
| `intent` | `text` | null |  |
| `params` | `jsonb` | null |  |
| `used_ai` | `boolean` | NOT NULL | `false` |
| `created_at` | `timestamp with time zone` | NOT NULL | `now()` |
| `executed_at` | `timestamp with time zone` | null |  |

**Constraints:** `agent_messages_conversation_id_fkey: FOREIGN KEY (conversation_id) REFERENCES agent_conversations(id) ON DELETE CASCADE`; `agent_messages_pkey: PRIMARY KEY (id)`; `agent_messages_role_check: CHECK ((role = ANY (ARRAY['user'::text, 'assistant'::text, 'system'::text])))`; `agent_messages_user_id_fkey: FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE`


## `agent_pending_state`

Partial parameters held while the agent asks a clarifying question.

| Column | Type | Null | Default |
|---|---|---|---|
| `user_id` | `uuid` | NOT NULL |  |
| `conversation_id` | `uuid` | NOT NULL |  |
| `intent` | `text` | NOT NULL |  |
| `params` | `jsonb` | NOT NULL | `'{}'::jsonb` |
| `asked_at` | `timestamp with time zone` | NOT NULL | `now()` |

**Constraints:** `agent_pending_state_pkey: PRIMARY KEY (user_id, conversation_id)`; `agent_pending_state_user_id_fkey: FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE`


## `agent_profile`

Durable facts the agent learns about the owner across conversations.

| Column | Type | Null | Default |
|---|---|---|---|
| `user_id` | `uuid` | NOT NULL |  |
| `business_name` | `text` | null |  |
| `website` | `text` | null |  |
| `product` | `text` | null |  |
| `audience` | `text` | null |  |
| `goals` | `text` | null |  |
| `notes` | `text` | null |  |
| `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |

**Constraints:** `agent_profile_pkey: PRIMARY KEY (user_id)`; `agent_profile_user_id_fkey: FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE`


## `ai_classifications`

Structured classification of each inbound reply with evidence (`reason`).

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | `bigint` | NOT NULL |  |
| `user_id` | `uuid` | NOT NULL |  |
| `lead_id` | `uuid` | null |  |
| `message_id` | `text` | null |  |
| `intent` | `text` | null |  |
| `confidence` | `numeric` | null |  |
| `interested` | `boolean` | null |  |
| `booking_intent` | `boolean` | null |  |
| `unsubscribe` | `boolean` | null |  |
| `sentiment` | `text` | null |  |
| `requires_human` | `boolean` | null |  |
| `suggested_action` | `text` | null |  |
| `raw` | `jsonb` | null |  |
| `created_at` | `timestamp with time zone` | NOT NULL | `now()` |
| `reason` | `text` | null |  |

**Constraints:** `ai_classifications_pkey: PRIMARY KEY (id)`


## `ai_cost_guest_state`

Single-row global AI budget for anonymous support-chat visitors.

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | `boolean` | NOT NULL | `true` |
| `window_date` | `text` | NOT NULL |  |
| `window_month` | `text` | NOT NULL |  |
| `used_daily_usd` | `numeric(14,6)` | NOT NULL | `0` |
| `used_monthly_usd` | `numeric(14,6)` | NOT NULL | `0` |
| `last_reported_at` | `timestamp with time zone` | null |  |
| `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |

**Constraints:** `ai_cost_guest_state_id_check: CHECK (id)`; `ai_cost_guest_state_pkey: PRIMARY KEY (id)`


## `ai_cost_state`

Per-profile AI budget counters (daily + monthly windows).

| Column | Type | Null | Default |
|---|---|---|---|
| `profile_id` | `uuid` | NOT NULL |  |
| `window_date` | `text` | NOT NULL |  |
| `window_month` | `text` | NOT NULL |  |
| `used_daily_usd` | `numeric(14,6)` | NOT NULL | `0` |
| `used_monthly_usd` | `numeric(14,6)` | NOT NULL | `0` |
| `mode` | `text` | NOT NULL | `'ai'::text` |
| `trips` | `integer` | NOT NULL | `0` |
| `tripped_at` | `timestamp with time zone` | null |  |
| `tripped_reason` | `text` | null |  |
| `last_reported_at` | `timestamp with time zone` | null |  |
| `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |

**Constraints:** `ai_cost_state_mode_check: CHECK ((mode = ANY (ARRAY['ai'::text, 'template'::text, 'hard_stop'::text])))`; `ai_cost_state_pkey: PRIMARY KEY (profile_id)`; `ai_cost_state_profile_id_fkey: FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE`


## `ai_spend_ledger`

One row per LLM call: model, tokens, cost, caller context.

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` |
| `ts` | `timestamp with time zone` | NOT NULL | `now()` |
| `fn` | `text` | NOT NULL | `'unknown'::text` |
| `kind` | `text` | NOT NULL | `'generic'::text` |
| `model` | `text` | NOT NULL |  |
| `input_tokens` | `integer` | NOT NULL | `0` |
| `output_tokens` | `integer` | NOT NULL | `0` |
| `est_cost_usd` | `numeric(14,6)` | NOT NULL | `0` |
| `user_id` | `uuid` | null |  |
| `campaign_id` | `uuid` | null |  |
| `lead_id` | `uuid` | null |  |
| `decision_id` | `text` | null |  |
| `model_version` | `text` | null |  |

**Constraints:** `ai_spend_ledger_campaign_id_fkey: FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE SET NULL`; `ai_spend_ledger_est_cost_usd_check: CHECK ((est_cost_usd >= (0)::numeric))`; `ai_spend_ledger_input_tokens_check: CHECK ((input_tokens >= 0))`; `ai_spend_ledger_lead_id_fkey: FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL`; `ai_spend_ledger_output_tokens_check: CHECK ((output_tokens >= 0))`; `ai_spend_ledger_pkey: PRIMARY KEY (id)`; `ai_spend_ledger_user_id_fkey: FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE`


## `audit_events`

Append-only event trail with decision attribution (`decision_id`, `model_version`, `strategy_ref`).

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | `bigint` | NOT NULL |  |
| `user_id` | `uuid` | null |  |
| `lead_id` | `uuid` | null |  |
| `campaign_id` | `uuid` | null |  |
| `event` | `text` | NOT NULL |  |
| `payload` | `jsonb` | null |  |
| `created_at` | `timestamp with time zone` | NOT NULL | `now()` |
| `decision_id` | `uuid` | null |  |
| `model_version` | `text` | null |  |
| `strategy_ref` | `text` | null |  |

**Constraints:** `audit_events_pkey: PRIMARY KEY (id)`


## `billing_events`

Raw payment webhook events for reconciliation and replay analysis.

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` |
| `user_id` | `uuid` | null |  |
| `payment_id` | `uuid` | null |  |
| `event` | `text` | NOT NULL |  |
| `plan` | `text` | null |  |
| `amount_cents` | `bigint` | null |  |
| `currency` | `text` | null |  |
| `payload` | `jsonb` | NOT NULL | `'{}'::jsonb` |
| `created_at` | `timestamp with time zone` | NOT NULL | `now()` |

**Constraints:** `billing_events_payment_id_fkey: FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE SET NULL`; `billing_events_pkey: PRIMARY KEY (id)`; `billing_events_user_id_fkey: FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE`


## `campaign_learning`

Nightly learned state per campaign: variants, winners, opener/sequence/reply-style hints and samples.

| Column | Type | Null | Default |
|---|---|---|---|
| `campaign_id` | `uuid` | NOT NULL |  |
| `state` | `jsonb` | NOT NULL | `'{}'::jsonb` |
| `version` | `integer` | NOT NULL | `0` |
| `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |
| `triggered_by` | `text` | NOT NULL | `'learning-loop'::text` |

**Constraints:** `campaign_learning_campaign_id_fkey: FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE`; `campaign_learning_pkey: PRIMARY KEY (campaign_id)`


## `campaigns`

Outreach campaigns: audience, status, A/B flag, autopilot, delivery mode, image.

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` |
| `user_id` | `uuid` | NOT NULL |  |
| `name` | `text` | NOT NULL |  |
| `status` | `text` | NOT NULL | `'active'::text` |
| `target_icp` | `jsonb` | null |  |
| `created_at` | `timestamp with time zone` | NOT NULL | `now()` |
| `ab_test` | `boolean` | NOT NULL | `false` |
| `autopilot` | `boolean` | NOT NULL | `false` |
| `campaign_image_url` | `text` | null |  |
| `followups_enabled` | `boolean` | null | `true` |
| `delivery` | `text` | NOT NULL | `'smart'::text` |

**Constraints:** `campaigns_pkey: PRIMARY KEY (id)`; `campaigns_user_id_fkey: FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE`


## `domains`

DNS-verified domain ownership. Schema is 1-to-many per user; a verified domain is unique.

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` |
| `user_id` | `uuid` | NOT NULL |  |
| `domain` | `text` | NOT NULL |  |
| `verification_token` | `text` | NOT NULL |  |
| `verified_at` | `timestamp with time zone` | null |  |
| `created_at` | `timestamp with time zone` | NOT NULL | `now()` |

**Constraints:** `domains_pkey: PRIMARY KEY (id)`; `domains_user_id_fkey: FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE`


## `email_threads`

Thread-level state, including the erasure marker for GDPR forget.

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` |
| `user_id` | `uuid` | NOT NULL |  |
| `lead_id` | `uuid` | null |  |
| `gmail_thread_id` | `text` | null |  |
| `last_message_id` | `text` | null |  |
| `turn_count` | `integer` | NOT NULL | `0` |
| `high_priority` | `boolean` | NOT NULL | `false` |
| `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |
| `forget_at` | `timestamp with time zone` | null |  |
| `last_summarized_at` | `timestamp with time zone` | null |  |

**Constraints:** `email_threads_lead_id_fkey: FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE`; `email_threads_pkey: PRIMARY KEY (id)`; `email_threads_user_id_lead_id_key: UNIQUE (user_id, lead_id)`


## `emails_sent`

One row per delivered outreach email — the outcome record every learner reads.

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` |
| `user_id` | `uuid` | NOT NULL |  |
| `lead_id` | `uuid` | null |  |
| `campaign_id` | `uuid` | null |  |
| `subject` | `text` | null |  |
| `body` | `text` | null |  |
| `sent_at` | `timestamp with time zone` | NOT NULL | `now()` |
| `opened` | `boolean` | NOT NULL | `false` |
| `replied` | `boolean` | NOT NULL | `false` |
| `follow_up_sent` | `boolean` | NOT NULL | `false` |
| `follow_up_at` | `timestamp with time zone` | null |  |
| `sequence` | `integer` | NOT NULL | `1` |
| `reply_sentiment` | `text` | null |  |
| `ai_draft` | `text` | null |  |
| `variant` | `text` | null |  |
| `autoreplied` | `boolean` | NOT NULL | `false` |
| `ai_turns` | `integer` | NOT NULL | `0` |
| `last_lead_msg_at` | `timestamp with time zone` | null |  |
| `last_ai_msg_at` | `timestamp with time zone` | null |  |
| `ai_paused` | `boolean` | NOT NULL | `false` |
| `gmail_message_id` | `text` | null |  |
| `gmail_thread_id` | `text` | null |  |
| `opened_at` | `timestamp with time zone` | null |  |
| `opener_key` | `text` | null |  |
| `reply_style` | `text` | null |  |

**Constraints:** `emails_sent_campaign_id_fkey: FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE SET NULL`; `emails_sent_lead_id_fkey: FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE`; `emails_sent_pkey: PRIMARY KEY (id)`; `emails_sent_user_id_fkey: FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE`


## `follow_up_sequences`

Per-campaign step plan (step number, delay, template).

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` |
| `user_id` | `uuid` | NOT NULL |  |
| `campaign_id` | `uuid` | NOT NULL |  |
| `step_number` | `integer` | NOT NULL |  |
| `delay_days` | `integer` | NOT NULL |  |
| `template` | `text` | null |  |
| `active` | `boolean` | NOT NULL | `true` |
| `created_at` | `timestamp with time zone` | NOT NULL | `now()` |

**Constraints:** `follow_up_sequences_campaign_id_fkey: FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE`; `follow_up_sequences_campaign_id_step_number_key: UNIQUE (campaign_id, step_number)`; `follow_up_sequences_pkey: PRIMARY KEY (id)`; `follow_up_sequences_user_id_fkey: FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE`


## `gmail_tokens`

Encrypted Gmail OAuth tokens. Service-role only; never exposed to the client.

| Column | Type | Null | Default |
|---|---|---|---|
| `profile_id` | `uuid` | NOT NULL |  |
| `refresh_token` | `text` | NOT NULL |  |
| `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |
| `connected_at` | `timestamp with time zone` | null |  |

**Constraints:** `gmail_tokens_pkey: PRIMARY KEY (profile_id)`; `gmail_tokens_profile_id_fkey: FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE`


## `google_search_usage`

One true daily counter for every live Google Places search.

| Column | Type | Null | Default |
|---|---|---|---|
| `day` | `date` | NOT NULL |  |
| `count` | `integer` | NOT NULL | `0` |
| `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |

**Constraints:** `google_search_usage_pkey: PRIMARY KEY (day)`


## `health_state`

Crash-loop deduplication and escalation state for health alerts.

| Column | Type | Null | Default |
|---|---|---|---|
| `check_key` | `text` | NOT NULL |  |
| `active_since` | `timestamp with time zone` | null |  |
| `last_alerted_at` | `timestamp with time zone` | null |  |
| `last_seen_at` | `timestamp with time zone` | null |  |
| `resolved_at` | `timestamp with time zone` | null |  |
| `escalated_at` | `timestamp with time zone` | null |  |
| `alert_count` | `integer` | NOT NULL | `0` |

**Constraints:** `health_state_pkey: PRIMARY KEY (check_key)`


## `inbound_emails`

Replies received through inbound parse, with provider message ids.

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` |
| `user_id` | `uuid` | NOT NULL |  |
| `lead_id` | `uuid` | null |  |
| `campaign_id` | `uuid` | null |  |
| `from_email` | `text` | null |  |
| `to_email` | `text` | null |  |
| `subject` | `text` | null |  |
| `body_text` | `text` | null |  |
| `body_html` | `text` | null |  |
| `message_id` | `text` | null |  |
| `content_hash` | `text` | null |  |
| `created_at` | `timestamp with time zone` | NOT NULL | `now()` |

**Constraints:** `inbound_emails_content_hash_key: UNIQUE (content_hash)`; `inbound_emails_pkey: PRIMARY KEY (id)`


## `intro_requests`

Double opt-in warm introductions between platform users.

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` |
| `requester_user_id` | `uuid` | NOT NULL |  |
| `target_user_id` | `uuid` | NOT NULL |  |
| `message` | `text` | null |  |
| `status` | `text` | NOT NULL | `'pending'::text` |
| `created_at` | `timestamp with time zone` | NOT NULL | `now()` |
| `resolved_at` | `timestamp with time zone` | null |  |

**Constraints:** `intro_requests_pkey: PRIMARY KEY (id)`; `intro_requests_requester_user_id_fkey: FOREIGN KEY (requester_user_id) REFERENCES profiles(id) ON DELETE CASCADE`; `intro_requests_status_check: CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'rejected'::text, 'expired'::text])))`; `intro_requests_target_user_id_fkey: FOREIGN KEY (target_user_id) REFERENCES profiles(id) ON DELETE CASCADE`


## `lead_finder_caches`

DB-backed cache of discovery results (areas 7d, results 12h).

| Column | Type | Null | Default |
|---|---|---|---|
| `kind` | `text` | NOT NULL |  |
| `cache_key` | `text` | NOT NULL |  |
| `payload` | `jsonb` | NOT NULL |  |
| `expires_at` | `timestamp with time zone` | NOT NULL |  |
| `created_at` | `timestamp with time zone` | NOT NULL | `now()` |

**Constraints:** `lead_finder_caches_pkey: PRIMARY KEY (kind, cache_key)`


## `lead_refresh`

Per-lead refresh scheduling for the background lead engine.

| Column | Type | Null | Default |
|---|---|---|---|
| `niche` | `text` | NOT NULL |  |
| `country` | `text` | NOT NULL |  |
| `city` | `text` | NOT NULL |  |
| `last_live_search_at` | `timestamp with time zone` | NOT NULL | `now()` |
| `refreshes` | `integer` | NOT NULL | `1` |
| `query` | `text` | null |  |

**Constraints:** `lead_refresh_pkey: PRIMARY KEY (niche, country, city)`


## `lead_score`

Hourly deterministic lead score with tier, features and expiry.

| Column | Type | Null | Default |
|---|---|---|---|
| `lead_id` | `uuid` | NOT NULL |  |
| `score` | `numeric` | NOT NULL |  |
| `tier` | `text` | NOT NULL | `'D'::text` |
| `features` | `jsonb` | NOT NULL | `'{}'::jsonb` |
| `score_version` | `integer` | NOT NULL | `1` |
| `computed_at` | `timestamp with time zone` | NOT NULL | `now()` |
| `expires_at` | `timestamp with time zone` | NOT NULL | `(now() + '24:00:00'::interval)` |

**Constraints:** `lead_score_lead_id_fkey: FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE`; `lead_score_pkey: PRIMARY KEY (lead_id)`; `lead_score_score_check: CHECK (((score >= (0)::numeric) AND (score <= (1)::numeric)))`; `lead_score_tier_check: CHECK ((tier = ANY (ARRAY['A'::text, 'B'::text, 'C'::text, 'D'::text])))`


## `leads`

Prospect records: identity, company, category, verification, lifecycle, follow-up state.

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` |
| `user_id` | `uuid` | NOT NULL |  |
| `campaign_id` | `uuid` | null |  |
| `name` | `text` | null |  |
| `email` | `text` | null |  |
| `company` | `text` | null |  |
| `job_title` | `text` | null |  |
| `country` | `text` | null |  |
| `status` | `text` | NOT NULL | `'new'::text` |
| `created_at` | `timestamp with time zone` | NOT NULL | `now()` |
| `unsubscribed` | `boolean` | NOT NULL | `false` |
| `normalized_email` | `text` | null |  |
| `lifecycle` | `text` | NOT NULL | `'NEW'::text` |
| `conv_mode` | `text` | NOT NULL | `'AI_AUTOPILOT'::text` |
| `category` | `text` | null |  |
| `place_id` | `text` | null |  |
| `lead_source` | `text` | null |  |
| `email_status` | `text` | null |  |
| `email_confidence` | `integer` | null |  |
| `email_is_role` | `boolean` | null | `false` |
| `email_is_disposable` | `boolean` | null | `false` |
| `email_verification_reason` | `text` | null |  |
| `city` | `text` | null |  |
| `phone` | `text` | null |  |
| `address` | `text` | null |  |
| `website` | `text` | null |  |
| `rating` | `numeric(2,1)` | null |  |
| `followup_step` | `integer` | null | `0` |
| `next_followup_at` | `timestamp with time zone` | null |  |
| `followup_status` | `text` | null | `'none'::text` |
| `email_source` | `text` | null |  |
| `email_source_url` | `text` | null |  |

**Constraints:** `leads_campaign_id_fkey: FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE SET NULL`; `leads_pkey: PRIMARY KEY (id)`; `leads_user_id_fkey: FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE`


## `meetings`

Provider-confirmed bookings (Calendly) with an idempotency key.

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` |
| `user_id` | `uuid` | NOT NULL |  |
| `lead_id` | `uuid` | null |  |
| `campaign_id` | `uuid` | null |  |
| `booked_at` | `timestamp with time zone` | NOT NULL | `now()` |
| `provider` | `text` | NOT NULL | `'calendly'::text` |
| `provider_event_id` | `text` | null |  |
| `start_time` | `timestamp with time zone` | null |  |
| `end_time` | `timestamp with time zone` | null |  |
| `timezone` | `text` | null |  |
| `status` | `text` | NOT NULL | `'scheduled'::text` |
| `invitee_email` | `text` | null |  |
| `metadata` | `jsonb` | null |  |

**Constraints:** `meetings_campaign_id_fkey: FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE SET NULL`; `meetings_lead_id_fkey: FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE`; `meetings_pkey: PRIMARY KEY (id)`; `meetings_status_check: CHECK ((status = ANY (ARRAY['scheduled'::text, 'cancelled'::text, 'completed'::text, 'no_show'::text])))`; `meetings_user_id_fkey: FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE`


## `owner_alerts`

In-app alerts; a trigger copies high/medium alerts into `push_queue`.

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | `bigint` | NOT NULL |  |
| `user_id` | `uuid` | NOT NULL |  |
| `lead_id` | `uuid` | null |  |
| `kind` | `text` | NOT NULL |  |
| `title` | `text` | NOT NULL |  |
| `body` | `text` | null |  |
| `priority` | `text` | NOT NULL | `'normal'::text` |
| `read` | `boolean` | NOT NULL | `false` |
| `created_at` | `timestamp with time zone` | NOT NULL | `now()` |

**Constraints:** `owner_alerts_kind_check: CHECK ((kind = ANY (ARRAY['booking'::text, 'opt_out'::text, 'takeover'::text, 'handoff'::text, 'bounce'::text, 'first_reply'::text, 're`; `owner_alerts_pkey: PRIMARY KEY (id)`; `owner_alerts_priority_check: CHECK ((priority = ANY (ARRAY['normal'::text, 'high'::text])))`


## `payments`

Razorpay order and payment ledger: plan, amount, currency, status, ids.

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` |
| `user_id` | `uuid` | NOT NULL |  |
| `razorpay_order_id` | `text` | null |  |
| `razorpay_payment_id` | `text` | null |  |
| `razorpay_signature` | `text` | null |  |
| `plan` | `text` | NOT NULL |  |
| `amount_cents` | `bigint` | NOT NULL |  |
| `currency` | `text` | NOT NULL | `'USD'::text` |
| `status` | `text` | NOT NULL | `'created'::text` |
| `source` | `text` | NOT NULL | `'checkout'::text` |
| `method` | `text` | null |  |
| `failure_reason` | `text` | null |  |
| `created_at` | `timestamp with time zone` | NOT NULL | `now()` |
| `paid_at` | `timestamp with time zone` | null |  |
| `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |
| `idempotency_key` | `text` | null |  |
| `notes` | `jsonb` | NOT NULL | `'{}'::jsonb` |

**Constraints:** `payments_pkey: PRIMARY KEY (id)`; `payments_razorpay_order_id_key: UNIQUE (razorpay_order_id)`; `payments_status_check: CHECK ((status = ANY (ARRAY['created'::text, 'paid'::text, 'failed'::text, 'refunded'::text])))`; `payments_user_id_fkey: FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE`


## `plan_limits`

Single source of truth for plan caps: daily, lifetime, leads, campaigns.

| Column | Type | Null | Default |
|---|---|---|---|
| `plan` | `text` | NOT NULL |  |
| `daily_emails` | `integer` | NOT NULL |  |
| `leads` | `integer` | null |  |
| `campaigns` | `integer` | null |  |
| `lifetime_emails` | `integer` | null |  |

**Constraints:** `plan_limits_pkey: PRIMARY KEY (plan)`


## `profiles`

Account, business identity, plan, Gmail state, send counters, anti-abuse flags.

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | `uuid` | NOT NULL |  |
| `email` | `text` | null |  |
| `name` | `text` | null |  |
| `company` | `text` | null |  |
| `plan` | `text` | NOT NULL | `'free'::text` |
| `onboarded` | `boolean` | NOT NULL | `false` |
| `icp` | `jsonb` | null |  |
| `offer` | `text` | null |  |
| `gmail_connected` | `boolean` | NOT NULL | `false` |
| `notify_replies` | `boolean` | NOT NULL | `true` |
| `created_at` | `timestamp with time zone` | NOT NULL | `now()` |
| `gmail_email` | `text` | null |  |
| `emails_sent_today` | `integer` | NOT NULL | `0` |
| `emails_sent_date` | `date` | null |  |
| `ai_generated_today` | `integer` | NOT NULL | `0` |
| `ai_generated_date` | `date` | null |  |
| `referral_code` | `text` | null |  |
| `referred_by` | `text` | null |  |
| `booking_link` | `text` | null |  |
| `last_digest_date` | `date` | null |  |
| `autopilot` | `boolean` | null | `false` |
| `autopilot_country` | `text` | null |  |
| `autopilot_niche` | `text` | null |  |
| `signature` | `text` | null |  |
| `gmail_account_type` | `text` | NOT NULL | `'consumer'::text` |
| `gmail_state` | `text` | NOT NULL | `'CONNECTED'::text` |
| `website_url` | `text` | null |  |
| `business_description` | `text` | null |  |
| `problem_solved` | `text` | null |  |
| `target_customer` | `text` | null |  |
| `cities` | `text[]` | null | `'{}'::text[]` |
| `communication_style` | `text` | null |  |
| `dont_claim` | `text` | null |  |
| `has_product_image` | `boolean` | null | `false` |
| `phone` | `text` | null |  |
| `network_mode` | `boolean` | NOT NULL | `false` |
| `referral_reward_plan` | `text` | null |  |
| `referral_reward_until` | `timestamp with time zone` | null |  |
| `emails_sent_total` | `integer` | NOT NULL | `0` |
| `business_address` | `text` | null |  |
| `domain_required` | `boolean` | NOT NULL | `false` |
| `domain_verified` | `boolean` | NOT NULL | `false` |

**Constraints:** `profiles_id_fkey: FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE`; `profiles_pkey: PRIMARY KEY (id)`; `profiles_referral_code_key: UNIQUE (referral_code)`


## `push_queue`

Queued push notifications awaiting delivery.

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | `bigint` | NOT NULL | `nextval('push_queue_id_seq'::regclass)` |
| `user_id` | `uuid` | NOT NULL |  |
| `title` | `text` | NOT NULL |  |
| `body` | `text` | null |  |
| `kind` | `text` | null |  |
| `lead_id` | `uuid` | null |  |
| `priority` | `text` | null |  |
| `created_at` | `timestamp with time zone` | NOT NULL | `now()` |

**Constraints:** `push_queue_pkey: PRIMARY KEY (id)`; `push_queue_user_id_title_body_key: UNIQUE (user_id, title, body)`


## `push_subscriptions`

Browser/device push endpoints and keys.

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` |
| `user_id` | `uuid` | NOT NULL |  |
| `endpoint` | `text` | NOT NULL |  |
| `p256dh` | `text` | NOT NULL |  |
| `auth_secret` | `text` | NOT NULL |  |
| `created_at` | `timestamp with time zone` | NOT NULL | `now()` |

**Constraints:** `push_subscriptions_pkey: PRIMARY KEY (id)`; `push_subscriptions_user_id_endpoint_key: UNIQUE (user_id, endpoint)`; `push_subscriptions_user_id_fkey: FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE`


## `referrals`

Referral links, claims and reward windows.

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` |
| `referrer_id` | `uuid` | NOT NULL |  |
| `referred_email` | `text` | null |  |
| `status` | `text` | NOT NULL | `'pending'::text` |
| `reward_days` | `integer` | NOT NULL | `0` |
| `created_at` | `timestamp with time zone` | NOT NULL | `now()` |

**Constraints:** `referrals_pkey: PRIMARY KEY (id)`; `referrals_referrer_id_fkey: FOREIGN KEY (referrer_id) REFERENCES auth.users(id) ON DELETE CASCADE`


## `refresh_usage`

Budget counters for lead-refresh operations.

| Column | Type | Null | Default |
|---|---|---|---|
| `day` | `text` | NOT NULL |  |
| `count` | `integer` | NOT NULL | `0` |

**Constraints:** `refresh_usage_pkey: PRIMARY KEY (day)`


## `saved_businesses`

The permanent shared business map (≈6,700 rows): every legitimately discovered business, reused for free.

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` |
| `place_id` | `text` | null |  |
| `email` | `text` | null |  |
| `website` | `text` | null |  |
| `domain` | `text` | null |  |
| `name` | `text` | null |  |
| `company` | `text` | null |  |
| `job_title` | `text` | null |  |
| `niche` | `text` | NOT NULL |  |
| `country` | `text` | NOT NULL |  |
| `city` | `text` | null |  |
| `source` | `text` | null |  |
| `category` | `text` | null |  |
| `phone` | `text` | null |  |
| `address` | `text` | null |  |
| `rating` | `numeric` | null |  |
| `email_source` | `text` | null |  |
| `email_source_url` | `text` | null |  |
| `email_status` | `text` | null |  |
| `email_confidence` | `numeric` | null |  |
| `email_is_role` | `boolean` | null |  |
| `email_is_disposable` | `boolean` | null |  |
| `email_verification_reason` | `text` | null |  |
| `first_seen` | `timestamp with time zone` | NOT NULL | `now()` |
| `last_seen` | `timestamp with time zone` | NOT NULL | `now()` |
| `discovered_by` | `uuid[]` | NOT NULL | `'{}'::uuid[]` |
| `forgotten_by` | `uuid[]` | NOT NULL | `'{}'::uuid[]` |
| `email_crawl_at` | `timestamp with time zone` | null |  |

**Constraints:** `saved_businesses_pkey: PRIMARY KEY (id)`; `saved_businesses_place_id_key: UNIQUE (place_id)`


## `send_queue`

Durable send jobs with status, priority, attempts, lease and retry time.

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` |
| `user_id` | `uuid` | NOT NULL |  |
| `campaign_id` | `uuid` | NOT NULL |  |
| `lead_id` | `uuid` | NOT NULL |  |
| `variant` | `text` | null |  |
| `status` | `text` | NOT NULL | `'pending'::text` |
| `attempts` | `integer` | NOT NULL | `0` |
| `created_at` | `timestamp with time zone` | NOT NULL | `now()` |
| `updated_at` | `timestamp with time zone` | null |  |
| `last_error` | `text` | null |  |
| `next_retry_at` | `timestamp with time zone` | null |  |
| `lease_until` | `timestamp with time zone` | null |  |
| `priority` | `numeric` | NOT NULL | `0.5` |

**Constraints:** `send_queue_campaign_id_fkey: FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE`; `send_queue_lead_id_fkey: FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE`; `send_queue_pkey: PRIMARY KEY (id)`; `send_queue_priority_check: CHECK (((priority >= (0)::numeric) AND (priority <= (1)::numeric)))`; `send_queue_user_id_fkey: FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE`


## `sender_health`

Mailbox reputation ledger: phase, cap, 7-day rates, clean days.

| Column | Type | Null | Default |
|---|---|---|---|
| `profile_id` | `uuid` | NOT NULL |  |
| `gmail_email` | `text` | null |  |
| `phase` | `text` | NOT NULL | `'ramp'::text` |
| `current_cap` | `integer` | NOT NULL | `5` |
| `warm_cap` | `integer` | NOT NULL | `5` |
| `sends_7d` | `integer` | NOT NULL | `0` |
| `bounces_7d` | `integer` | NOT NULL | `0` |
| `replies_7d` | `integer` | NOT NULL | `0` |
| `unsubs_7d` | `integer` | NOT NULL | `0` |
| `bounce_rate_7d` | `numeric` | NOT NULL | `0` |
| `complaint_rate_7d` | `numeric` | NOT NULL | `0` |
| `reply_rate_7d` | `numeric` | NOT NULL | `0` |
| `clean_days` | `integer` | NOT NULL | `0` |
| `last_measured_at` | `timestamp with time zone` | NOT NULL | `now()` |
| `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |

**Constraints:** `sender_health_phase_check: CHECK ((phase = ANY (ARRAY['ramp'::text, 'steady'::text, 'recovery'::text])))`; `sender_health_pkey: PRIMARY KEY (profile_id)`; `sender_health_profile_id_fkey: FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE`


## `signup_signals`

Device id + salted IP hash recorded at signup. Observation only; no client access.

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` |
| `user_id` | `uuid` | null |  |
| `device_id` | `text` | null |  |
| `ip_hash` | `text` | null |  |
| `user_agent` | `text` | null |  |
| `created_at` | `timestamp with time zone` | NOT NULL | `now()` |

**Constraints:** `signup_signals_pkey: PRIMARY KEY (id)`; `signup_signals_user_id_fkey: FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE`


## `strategy_state`

Anonymised global aggregates. No user, lead or campaign identity; GDPR rows excluded.

| Column | Type | Null | Default |
|---|---|---|---|
| `feature_bucket` | `text` | NOT NULL |  |
| `model_version` | `text` | NOT NULL |  |
| `window_start` | `timestamp with time zone` | NOT NULL |  |
| `window_end` | `timestamp with time zone` | NOT NULL |  |
| `deltas` | `jsonb` | NOT NULL | `'{}'::jsonb` |
| `sent` | `integer` | NOT NULL | `0` |
| `replied` | `integer` | NOT NULL | `0` |
| `meets` | `integer` | NOT NULL | `0` |
| `excluded_gdpr` | `integer` | NOT NULL | `0` |
| `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |

**Constraints:** `strategy_state_pkey: PRIMARY KEY (feature_bucket, model_version, window_start)`


## `support_chat_messages`

Support chat messages.

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` |
| `thread_id` | `uuid` | NOT NULL |  |
| `role` | `text` | NOT NULL |  |
| `content` | `text` | NOT NULL |  |
| `created_at` | `timestamp with time zone` | NOT NULL | `now()` |

**Constraints:** `support_chat_messages_pkey: PRIMARY KEY (id)`; `support_chat_messages_role_check: CHECK ((role = ANY (ARRAY['user'::text, 'assistant'::text])))`; `support_chat_messages_thread_id_fkey: FOREIGN KEY (thread_id) REFERENCES support_chat_threads(id) ON DELETE CASCADE`


## `support_chat_threads`

Support chat threads.

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` |
| `user_id` | `uuid` | null |  |
| `status` | `text` | NOT NULL | `'auto'::text` |
| `created_at` | `timestamp with time zone` | NOT NULL | `now()` |
| `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |
| `guest_id` | `text` | null |  |

**Constraints:** `support_chat_threads_pkey: PRIMARY KEY (id)`; `support_chat_threads_user_id_fkey: FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE`


## `suppressions`

Permanent opt-out / bounce list; triggers block queue and sent inserts.

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` |
| `user_id` | `uuid` | NOT NULL |  |
| `lead_id` | `uuid` | null |  |
| `email` | `text` | NOT NULL |  |
| `reason` | `text` | NOT NULL |  |
| `source` | `text` | null |  |
| `created_at` | `timestamp with time zone` | NOT NULL | `now()` |

**Constraints:** `suppressions_lead_id_fkey: FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE`; `suppressions_pkey: PRIMARY KEY (id)`; `suppressions_reason_check: CHECK ((reason = ANY (ARRAY['unsubscribed'::text, 'bounced'::text, 'manual'::text, 'complaint'::text])))`; `suppressions_user_id_fkey: FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE`


## `thread_memory`

Facts-only conversation memory (never raw transcript).

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` |
| `thread_id` | `uuid` | NOT NULL |  |
| `lead_id` | `uuid` | NOT NULL |  |
| `fact_kind` | `text` | NOT NULL |  |
| `value` | `text` | NOT NULL |  |
| `source_message_id` | `text` | null |  |
| `source_ts` | `timestamp with time zone` | null |  |
| `confidence` | `numeric` | null |  |
| `created_at` | `timestamp with time zone` | NOT NULL | `now()` |
| `superseded_at` | `timestamp with time zone` | null |  |

**Constraints:** `thread_memory_confidence_check: CHECK (((confidence >= (0)::numeric) AND (confidence <= (1)::numeric)))`; `thread_memory_fact_kind_whitelist: CHECK ((fact_kind = ANY (ARRAY['interest_level'::text, 'objection'::text, 'timing_window'::text, 'availability'::text, 'decis`; `thread_memory_lead_id_fkey: FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE`; `thread_memory_pkey: PRIMARY KEY (id)`; `thread_memory_thread_id_fkey: FOREIGN KEY (thread_id) REFERENCES email_threads(id) ON DELETE CASCADE`; `thread_memory_value_len: CHECK ((char_length(value) <= 200))`


## `tools_rate_limit`

Per-tool, per-user rate limiting for the tools gateway.

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | `bigint` | NOT NULL |  |
| `ip` | `text` | NOT NULL |  |
| `action` | `text` | NOT NULL | `'any'::text` |
| `created_at` | `timestamp with time zone` | NOT NULL | `now()` |

**Constraints:** `tools_rate_limit_pkey: PRIMARY KEY (id)`


## `tracking_events`

Opens and clicks.

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | `bigint` | NOT NULL |  |
| `email_id` | `uuid` | null |  |
| `user_id` | `uuid` | NOT NULL |  |
| `lead_id` | `uuid` | null |  |
| `campaign_id` | `uuid` | null |  |
| `event` | `text` | NOT NULL |  |
| `occurred_at` | `timestamp with time zone` | NOT NULL | `now()` |

**Constraints:** `tracking_events_email_id_fkey: FOREIGN KEY (email_id) REFERENCES emails_sent(id) ON DELETE CASCADE`; `tracking_events_event_check: CHECK ((event = ANY (ARRAY['open'::text, 'click'::text])))`; `tracking_events_pkey: PRIMARY KEY (id)`


## `usage_limits`

Legacy daily mirror of sends; counters are owned by `reserve_send_slot`.

| Column | Type | Null | Default |
|---|---|---|---|
| `user_id` | `uuid` | NOT NULL |  |
| `emails_sent_today` | `integer` | NOT NULL | `0` |
| `limit_date` | `date` | NOT NULL | `CURRENT_DATE` |
| `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |

**Constraints:** `usage_limits_pkey: PRIMARY KEY (user_id)`; `usage_limits_user_id_fkey: FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE`

---

# Appendix D — SQL function reference (43 functions)

All live in `public`. `SECURITY DEFINER` functions set `search_path = public` and check authority themselves.

| Function | Arguments | Purpose |
|---|---|---|
| `admin_clear_flag` | `p_user uuid, p_note text` | Admin: clears a duplicate-business flag with a mandatory note; writes `admin_actions`. |
| `admin_console` | `—` | Admin: returns the full read model (totals, accounts, clusters, signals, decisions) or raises `not_admin`. |
| `admin_flag` | `p_user uuid, p_note text` | Admin: sets a flag with a note; writes `admin_actions`. |
| `advance_lead_followup` | `p_lead_id uuid, p_campaign_id uuid, p_current_step integer` | Moves a lead to the next follow-up step and schedules it. |
| `ai_cost_debit` | `p_profile_id uuid, p_debit numeric, p_pool_daily numeric, p_pool_monthly numeric` | Atomic reserve of AI budget before an LLM call (daily + monthly pools). |
| `ai_cost_guest_debit` | `p_debit numeric, p_pool_daily numeric, p_pool_monthly numeric` | Same reservation for the anonymous visitor bucket. |
| `ai_cost_guest_settle` | `p_delta numeric` | Settles the visitor reservation against actual spend. |
| `ai_cost_settle` | `p_profile_id uuid, p_delta numeric` | Settles a profile reservation against actual spend. |
| `assert_not_suppressed` | `—` | Raises if an address is suppressed; used by queue/sent triggers. |
| `audit_campaigns_write` | `—` | Trigger: writes a campaign audit event on insert/update. |
| `audit_leads_insert` | `—` | Trigger: writes a lead audit event on insert. |
| `bump_google_search_usage` | `p_cost integer` | Increments the daily Google Places search counter. |
| `cancel_lead_followup` | `p_lead_id uuid, p_reason text` | Cancels a lead's remaining follow-ups with a reason. |
| `claim_queue_jobs_v2` | `p_limit integer DEFAULT 10, p_lease_minutes integer DEFAULT 10` | Claims up to N send jobs with `FOR UPDATE SKIP LOCKED`, increments attempts, sets the lease. |
| `consume_ai_quota` | `uid uuid, cap integer` | Legacy quota consumption; locked to service role. |
| `create_default_follow_ups` | `p_user_id uuid, p_campaign_id uuid` | Seeds the 4-touch default sequence (day 3/7/14/21) for a campaign. |
| `create_default_follow_ups` | `—` | Seeds the 4-touch default sequence (day 3/7/14/21) for a campaign. |
| `delete_lead` | `p_user_id uuid, p_lead_id uuid` | Hard-deletes a lead and its dependent rows; ownership-gated. |
| `effective_plan` | `p_user uuid` | Resolves the active plan, including stacking referral rewards. |
| `enforce_campaign_limit` | `—` | Trigger: enforces the plan's campaign cap. |
| `enforce_lead_cap` | `—` | Trigger: enforces the plan's lead cap. |
| `enqueue_push_alert` | `—` | Enqueues a push notification for an alert. |
| `flag_duplicate_business` | `—` | Trigger: flags a later account with the same brand + address. |
| `forget_lead` | `p_user_id uuid, p_lead_id uuid, p_suppress boolean` | GDPR erase-in-place: removes personal fields, keeps aggregate outcome rows. |
| `guard_protected_profile_cols` | `—` | Trigger: restores `plan`, `domain_required`, `domain_verified` on user writes. |
| `handle_new_user` | `—` | Trigger: creates the profile row on signup. |
| `health_cron_evidence` | `—` | Returns execution markers + dispatch history for every cron job. |
| `health_last_cron_runs` | `—` | Returns the dispatch ledger (pre-marker fallback). |
| `init_lead_followup` | `p_lead_id uuid, p_campaign_id uuid, p_initial_send_at timestamptz` | Initialises follow-up state for a lead in a campaign. |
| `is_admin` | `—` | True when `auth.uid()` is in `public.admins`. |
| `is_plausible_business_address` | `p_address text` | Street-level address predicate (length, letters, digit, street-word). |
| `normalize_business_text` | `p_value text` | Normalises brand/address text for exact comparison. |
| `on_lead_reply_cancel_followup` | `—` | Trigger: cancels follow-ups when a reply arrives. |
| `public_stats` | `—` | Aggregate public counters for the marketing site. |
| `referral_count` | `—` | Counts successful referrals for a user. |
| `release_send_slot` | `p_user uuid` | Returns a reserved send slot after a failed send. |
| `reserve_send_slot` | `p_user uuid, p_cap integer` | THE choke point: atomically increments daily/total and enforces identity, address, caps and domain proof. |
| `rls_auto_enable` | `—` | Helper that enables RLS on new tables. |
| `send_block_reason` | `p_user uuid` | Returns the exact refusal reason for a user, or NULL. |
| `set_agent_config` | `p_key text, p_scope text, p_scope_id uuid, p_value jsonb, p_enabled boolean, p_changed_by text` | RPC upsert for partial unique indexes on `agent_config`. |
| `touch_agent_conversation` | `—` | Updates conversation recency on each message. |
| `touch_payments_updated_at` | `—` | Trigger: maintains `payments.updated_at`. |
| `trg_create_follow_ups_on_campaign` | `—` | Trigger: seeds follow-ups when a campaign is created. |

## Views

| View | Definition |
|---|---|
| `opener_performance` | `campaign_id, opener_key, sent, replied, reply_rate` over rows with a non-null `opener_key`. Diagnostic, not the learning source. |
| `reply_style_performance` | `campaign_id, reply_style, conversations, meetings` over rows with a non-null `reply_style`. Diagnostic. |

---

# Appendix E — Migration map (84 forward migrations + 17 rollback files)

Two numbers matter and they are usually conflated.

| Count | Meaning |
|---|---|
| **84** | Forward migrations that create or change production objects |
| **17** | Paired rollback files, kept beside their forward migration and **never applied in production** |
| **101** | Total `.sql` files in `supabase/migrations/` |

### Provenance note

Only **46** rows appear in `supabase_migrations.schema_migrations`, and the ledger stops on 29 August 2026. Everything after that (September–November: learning, cost gate, health, agent, plan limits, anti-abuse, admin console) was applied through the **Management API** (`POST /v1/projects/{ref}/database/query`) without CLI tracking.

That is a real operational gap: the repo is the source of truth for what ran, not the CLI ledger. Restoring the ledger is listed in Section VIII.

### Forward migrations

| # | Migration | What it introduced |
|---|---|---|
| 1 | `20260601010730_0f1f8d20-c04f-4426-aa7b-77bbb805e6f7.sql` | Profiles |
| 2 | `20260601010800_a92a3827-56fd-4afa-b24c-991b30c837c2.sql` | Revokes public EXECUTE on `handle_new_user()` — the trigger that creates a profile row must not be callable by clients. |
| 3 | `20260614000001_add_sending_limits.sql` | Add Gmail token columns to profiles |
| 4 | `20260822000002_add_unsubscribed.sql` | Adds `leads.unsubscribed` (NOT NULL default false) — the first per-lead opt-out flag. |
| 5 | `20260823000003_performance_indexes.sql` | Production performance indexes: every query filters by user_id via RLS |
| 6 | `20260823000004_secure_tokens_and_ai_quota.sql` | M1: move Gmail OAuth tokens out of profiles into a service-role-only vault |
| 7 | `20260823000005_referral_and_stats.sql` | Viral growth: referral tracking + public aggregate stats |
| 8 | `20260823000006_automation_upgrades.sql` | Automation upgrades: booking links, reply sentiment, daily digest |
| 9 | `20260823000007_autopilot.sql` | Autopilot: the cron robot finds leads and sends on the user's behalf |
| 10 | `20260823000008_stats_replies.sql` | Rewrites `public_stats()` to expose emails sent, agents, and replies detected. |
| 11 | `20260823000009_tools_rate_limit.sql` | No policies: denied for everyone except service_role (used by the tools function) |
| 12 | `20260823000010_lock_quota_rpc.sql` | consume_ai_quota is an internal function used by edge functions with the service role key. It must never be callable by anon/authenticated/PUBLIC, otherwise anyone can burn another user's AI quota by … |
| 13 | `20260824000001_email_ai_draft.sql` | Adds `emails_sent.ai_draft` — the generated body is kept next to what was actually sent. |
| 14 | `20260824120000_profile_signature.sql` | Adds `profiles.signature` — the footer appended to every outbound email. |
| 15 | `20260824130000_true_free_tier.sql` | Sets the default plan to `free`. The free tier stops being an exception and becomes the starting state. |
| 16 | `20260824140000_ab_autopilot.sql` | Adds `campaigns.ab_test`, `campaigns.autopilot`, `emails_sent.variant`, `emails_sent.autoreplied` — the A/B and autopilot foundations. |
| 17 | `20260824150000_send_queue.sql` | Send queue: decouples Launch click from actual sending. |
| 18 | `20260824160000_referrals_table.sql` | Creates `referrals` (pending | joined | rewarded) — the first viral growth loop. |
| 19 | `20260824170000_schedule_followup_cron.sql` | Schedule the follow-up agent (reply detection, follow-ups, autopilot, digests) |
| 20 | `20260824180000_reset_test_lead_suppression.sql` | Test-lead reset: un-suppress outreachai.team@gmail.com so live reply-detection testing can continue (lead was suppressed during unsubscribe-flow verification) |
| 21 | `20260824181000_reset_test_lead_again.sql` | Second test-lead reset (Gmail one-click retries likely re-suppressed it) |
| 22 | `20260824190000_conversation_mode.sql` | Conversation Mode: multi-turn AI thread handling |
| 23 | `20260824200000_lead_cap_trigger.sql` | Server-side enforcement of per-plan lead storage caps. UI caps were client-only; this trigger closes the direct-API hole. |
| 24 | `20260824210000_uniq_leads_email.sql` | Server-side duplicate-lead protection (case-insensitive per user) |
| 25 | `20260824220000_prod_architecture.sql` | ============================================================ PRODUCTION ARCHITECTURE HARDENING Multi-tenant-safe, concurrency-safe, auditable, policy-enforced =========================================… |
| 26 | `20260824230000_hardening_pass.sql` | ============================================================ PRODUCTION HARDENING PASS (post-audit fixes) ============================================================ |
| 27 | `20260825040000_profile_website_url.sql` | Owner website/app URL: when set, the AI answers prospect queries using the site's content as a knowledge base and funnels leads to this URL instead of only offering a booking link. Owners without a si… |
| 28 | `20260825050000_phase1_business_intelligence.sql` | Phase 1: Onboarding / Business Intelligence Adds structured business config columns to profiles. Existing offer, website_url, booking_link, signature are kept as-is. |
| 29 | `20260825060000_uniq_emails_first.sql` | UNIQUE CONSTRAINT for first-touch emails: prevents duplicate sends in lease-expiry race. The existing uniq_emails_step only covers sequence >= 2 (follow-ups). This closes the gap where two workers cou… |
| 30 | `20260825070000_alerts_kind_review.sql` | Add 'review' to owner_alerts CHECK constraint. Code uses kind='review' for autoresponder detection and reply-loop guard. Previously blocked by the constraint — these alerts were silently lost. |
| 31 | `20260825080000_cleanup_and_indexes.sql` | ============================================================ DATABASE CLEANUP — Part 5 audit findings ============================================================ |
| 32 | `20260826100000_lead_discovery_columns.sql` | Phase 1: Lead Discovery Engine — add category, place_id, source columns These fields store the business metadata from Google Maps / OSM discovery. |
| 33 | `20260826110000_email_verification_columns.sql` | Phase 2: Email verification columns on leads table Adds verification state so it persists after discovery |
| 34 | `20260826120000_lead_detail_columns.sql` | Phase 3: Add missing lead detail columns city, phone, address, website, rating — returned by find-leads but not persisted |
| 35 | `20260826130000_campaign_image_and_storage.sql` | Phase 4A: Campaign launch & approval support Add image column and campaign summary fields |
| 36 | `20260826140000_security_and_followup.sql` | ============================================================ SECURITY + FOLLOW-UP HARDENING ============================================================ |
| 37 | `20260827100000_followup_engine.sql` | ============================================================ PHASE 1: COMPLETE LONG-TERM FOLLOW-UP ENGINE ============================================================ 1. Fix follow_up_sequences timing… |
| 38 | `20260827110000_website_enrichment.sql` | Website email enrichment provenance columns Tracks where a lead's email was discovered from |
| 39 | `20260828120000_profile_phone.sql` | Phase 3: Add owner phone number shown to clients when the AI hands off (escalation replies offer a direct call to the owner). |
| 40 | `20260828140000_campaign_delivery.sql` | Phase 3: Per-campaign delivery preference. 'smart' (default) = send only during each lead's local business morning (8-11am); 'instant' = bypass the morning gate and send as soon as the campaign is lau… |
| 41 | `20260828160000_network_intros.sql` | Phase 3: Warm B2B network. profile.network_mode: opt-in "discoverable by other businesses". intro_requests: double opt-in intros between platform users (no contact exposure pre-accept). |
| 42 | `20260828170000_referral_rewards.sql` | Phase 3: Referral reward — referrer earns 7 free days of starter when a friend joins via their link. Effective plan is resolved at runtime (referral_reward_plan while active, otherwise subscription pl… |
| 43 | `20260828180000_owner_alerts_kinds.sql` | Phase 3: extend owner_alerts kind whitelist for new features added in 2026-08-28: network intros (network_intro / accepted / rejected) + referral rewards. |
| 44 | `20260828190000_ai_classification_reason.sql` | AI upgrade #2: classifier evidence. Every ai_classifications row should carry a one-line human-readable reason showing WHY the AI labeled it that way. |
| 45 | `20260829170000_support_chat.sql` | AI upgrade #5: persistent, account-aware support chat. Threads persist server-side so conversations survive across devices and the assistant can answer with the user's REAL account numbers (plan, usag… |
| 46 | `20260829190000_push_notifications.sql` | Push notifications: device subscriptions + a drain queue filled by a trigger on owner_alerts (high/medium only). The push-drainer edge function (scheduled via pg_cron) sends every queued alert to the … |
| 47 | `20260908000001_sender_health.sql` | 0a: mailbox connection anchor + deterministic sender-health reputation feedback. The intelligence layer stays advisory: every consumer falls back to today's ramp formula when this ledger has no (or st… |
| 48 | `20260908000002_agent_config.sql` | ============================================================ agent_config (Workstream 0b / design doc 2.5) Generic key/value config store for inbox-agent judgment knobs. Scope resolution: glob -> user… |
| 49 | `20260908000003_audit_events_decision_trail.sql` | ============================================================ audit_events decision attribution (Workstream 1 / design 2.1) Adds the attribution prerequisite for the learning loop. Nullable + additive:… |
| 50 | `20260908000004_intelligence_tables.sql` | ############################################################################# Stage 4: intelligence-layer state (lead_score / campaign_learning / strategy_state) + hourly learning-loop cron (the singl… |
| 51 | `20260908000006_queue_priority.sql` | Stage 6: advisory queue priority — ORDER-axis only. Contract (INTELLIGENCE-LAYER-DESIGN.md §2.2/§3): a fresh lead_score may move a job EARLIER within the claimable band; stale/missing => priority 0.5 … |
| 52 | `20260909000001_ai_cost_meter.sql` | Stage 7 (diff 1): metered AI spend. Contract (INTELLIGENCE-LAYER-DESIGN.md §6.1/§6.3): every LLM call in the system crosses _shared/groq.ts groqChat(), which captures response usage and writes ONE row… |
| 53 | `20260909000002_ai_cost_gate.sql` | Stage 7 (diff 2): the durable AI-cost gate. Contract (INTELLIGENCE-LAYER-DESIGN.md §6.3/§6.6): the HARD ceiling runs on an atomic reservation-debit, not on ledger SUM. Every gated LLM call debits ai_c… |
| 54 | `20260909000003_agent_config_writer.sql` | Stage 7 fix: agent_config uses PARTIAL unique indexes (glob_uq on (key) where scope='glob'; scoped_uq on (key,scope,scope_id) where scope in user/campaign), so PostgREST's insert-...-onConflict cannot… |
| 55 | `20260909000004_delete_account_erasure.sql` | Stage 8 hotfix (standalone, ships ahead of the Stage 8 memory work): close the delete-account erasure gaps found in the erasure-surface audit. 1. ai_spend_ledger.user_id was ON DELETE SET NULL on prof… |
| 56 | `20260909000005_stage8_memory.sql` | ############################################################################# Stage 8: conversation memory + erasure-by-design (INTELLIGENCE-LAYER-DESIGN.md §8) Adds: * thread_memory — facts-only conv… |
| 57 | `20260910000001_health_check.sql` | ============================================================ STAGE 9 — HOURLY HEALTH-CHECK (infra watchdog) Reuse, don't rebuild: * owner_alerts -> trg_alerts_to_push -> push_queue -> push-drainer is … |
| 58 | `20260910000002_health_cron_evidence.sql` | ============================================================ STAGE 9 — CRON OUTCOME EVIDENCE RPC Upgrade the cron probe from "did pg_cron DISPATCH?" (job_run_details, which records 'succeeded' for net… |
| 59 | `20260910000010_ai_cost_guest_gate.sql` | Stage: guest AI-cost gate for the public support-chat widget. Contract: mirrors 20260909000002_ai_cost_gate.sql exactly, but for the support- chat VISITOR bucket. ai_cost_state.profile_id has an FK to… |
| 60 | `20260912000000_followup_sendwindow_hardening.sql` | ============================================================ FOLLOW-UP SEND-WINDOW HARDENING (audit-2026-09-12) ============================================================ The reply-cancel trigger on… |
| 61 | `20260912120000_followup_default_sequence.sql` | ============================================================ Default follow-up sequence: 4 touches over 3 weeks (day 3,7,14,21) ============================================================ Replaces th… |
| 62 | `20260913000000_meetings_growth.sql` | ============================================================ MEETINGS GROWTH — webhook-confirmed real bookings (Calendly, phase 1) The meetings table was schema-only and never written. This adds the f… |
| 63 | `20260928060000_razorpay_payments.sql` | ============================================================ RAZORPAY PAYMENTS — order + payment ledger for the checkout flow. The previous processor only wrote profiles.plan and kept no transaction r… |
| 64 | `20260929120000_agent_action_state.sql` | Assistant action budget: per-message and per-conversation step counters. ai-cost_state already caps AI SPEND. It cannot cap STEPS -- a loop of cheap actions never trips a dollar budget. These counters… |
| 65 | `20260929130000_agent_conversations.sql` | ============================================================================ Agent chat: conversation history + the intent cache. The cache is the reason a repeated request costs nothing. The first ti… |
| 66 | `20260929140000_agent_confirm_single_use.sql` | Makes a confirmation single-use. Bug found by scripts/.stage8/prove-agent-live.mjs: the write branch returned "pending" BEFORE persisting the user message, so the follow-up "yes" could not find the in… |
| 67 | `20260929150000_agent_learned_phrases.sql` | ============================================================================ Learned vocabulary: the fast lane. The agent already understands meaning on the slow lane (one model call per new phrasing)… |
| 68 | `20260929160000_agent_conversation_recency.sql` | Conversation titles + updated_at so the UI can show a real chat list ordered by recency of the LAST message, not the date the chat was opened. Why updated_at and not created_at: a chat started last mo… |
| 69 | `20260929160001_agent_pending_state.sql` | Pending slot state: remember what we were trying to do when we asked. When the agent asks "Which campaign should I add them to?", it must carry the partial params (e.g. city/company/query) and the int… |
| 70 | `20260929160002_agent_pending_state_rls.sql` | Fix: the pending-state table was created with FORCE ROW LEVEL SECURITY. FORCE applies RLS to the table owner too, which silently blocked the edge function's service-role writes. Every clarifying quest… |
| 71 | `20260929170000_agent_profile.sql` | Persistent business context the agent acquires by listening. The agent could hold a pending clarification for 15 minutes, but it forgot everything else. Someone would describe their business in real d… |
| 72 | `20261009000001_plan_limits.sql` | Plan limits: one source of truth for what each plan allows, plus server-side enforcement so no client or agent can exceed it. daily_emails : emails a user may send per day (enforced in send-worker via… |
| 73 | `20261011000001_website_crawl.sql` | Website email backfill for the shared map. saved_businesses is our permanent, shared "our own map". Rows that a search found with a website but no email are never enriched after the fact, so the map k… |
| 74 | `20261011000002_search_usage.sql` | Google Places search budget: one true daily counter for every live Google Maps search the whole app makes, so the background "leftover quota" workers can spend whatever the day's user traffic did NOT … |
| 75 | `20261030000001_opener_learning.sql` | Opener learning: record which attention angle produced each email. send-worker has always picked one of seven opening angles per lead by hashing name+company+title, so a natural experiment has been ru… |
| 76 | `20261030000002_reply_style_learning.sql` | Reply-style learning: the same record -> measure -> act loop as openers. The reply prompt used to be one fixed instruction string, so no outcome could be attributed to a "shape". inbox-agent now picks… |
| 77 | `20261101000001_anti_abuse_mvp.sql` | ============================================================ ANTI-ABUSE MVP 1. Free tier becomes a LIFETIME cap (50 emails ever, 10/day) so farming accounts stops paying: N accounts buys N x 50 emails… |
| 78 | `20261101000002_send_requires_identity.sql` | ============================================================ ANTI-ABUSE MVP — part 2: business identity is required to SEND Why a second migration instead of editing part 1: part 1 is already applied … |
| 79 | `20261101000003_guard_protected_profile_cols.sql` | ============================================================ ANTI-ABUSE MVP — part 3: protected profile columns Found while building the UI: the "own profile update" RLS policy is `USING (auth.uid() =… |
| 80 | `20261101000004_send_block_reason_scoped.sql` | ============================================================ ANTI-ABUSE MVP — part 4: send_block_reason keeps to the caller's own account The function takes a user id so the server (send-worker, servi… |
| 81 | `20261101000005_require_street_address.sql` | ============================================================ ANTI-ABUSE MVP — part 5: the address must actually be an address "India", "United States" and "London" were accepted, because the only rule… |
| 82 | `20261101000006_compat_block_reason.sql` | ============================================================ ANTI-ABUSE MVP — part 6: keep the reason string compatible The database change in part 5 shipped before the frontend did (Vercel deploys on… |
| 83 | `20261101000007_restore_address_reason.sql` | ============================================================ ANTI-ABUSE MVP — part 7: restore the specific address reason Part 6 deliberately reported 'business_identity_required' for a bad address be… |
| 84 | `20261103000001_admin_console.sql` | ============================================================ ADMIN CONSOLE — part 1 of 2: who is an admin, and the read model Until now the anti-abuse tables (signup_signals, admin-free) had no reader… |

### Rollback files (kept, not applied)

| # | File | Rolls back |
|---|---|---|
| 1 | `20260908000001_sender_health.rollback.sql` | `20260908000001_sender_health.sql` |
| 2 | `20260908000002_agent_config.rollback.sql` | `20260908000002_agent_config.sql` |
| 3 | `20260908000003_audit_events_decision_trail.rollback.sql` | `20260908000003_audit_events_decision_trail.sql` |
| 4 | `20260908000004_intelligence_tables.rollback.sql` | `20260908000004_intelligence_tables.sql` |
| 5 | `20260909000001_ai_cost_meter.rollback.sql` | `20260909000001_ai_cost_meter.sql` |
| 6 | `20260909000002_ai_cost_gate.rollback.sql` | `20260909000002_ai_cost_gate.sql` |
| 7 | `20260909000004_delete_account_erasure.rollback.sql` | `20260909000004_delete_account_erasure.sql` |
| 8 | `20260909000005_stage8_memory.rollback.sql` | `20260909000005_stage8_memory.sql` |
| 9 | `20260910000001_health_check.rollback.sql` | `20260910000001_health_check.sql` |
| 10 | `20260910000002_health_cron_evidence.rollback.sql` | `20260910000002_health_cron_evidence.sql` |
| 11 | `20260929120000_agent_action_state.rollback.sql` | `20260929120000_agent_action_state.sql` |
| 12 | `20260929130000_agent_conversations.rollback.sql` | `20260929130000_agent_conversations.sql` |
| 13 | `20260929140000_agent_confirm_single_use.rollback.sql` | `20260929140000_agent_confirm_single_use.sql` |
| 14 | `20260929150000_agent_learned_phrases.rollback.sql` | `20260929150000_agent_learned_phrases.sql` |
| 15 | `20261009000001_plan_limits.rollback.sql` | `20261009000001_plan_limits.sql` |
| 16 | `20261011000001_website_crawl.rollback.sql` | `20261011000001_website_crawl.sql` |
| 17 | `20261011000002_search_usage.rollback.sql` | `20261011000002_search_usage.sql` |

---

# Appendix F — Frontend route map (33 routes)

TanStack Start file-based routing. `_authenticated` is a pathless layout: every child requires a session and completed onboarding (except `/admin`, which only requires `is_admin()`).

| Route file | Path | Purpose |
|---|---|---|
| `__root.tsx` | `(root)` | Root layout, router context, global error and not-found components. |
| `_authenticated.tsx` | `(layout)` | Session guard + onboarding gate + app shell. Hides the admin link, but access is re-checked server-side. |
| `_authenticated/admin.tsx` | `/admin` | Operator console: totals, accounts, device/IP clusters, signup signals, recent decisions, flag/clear. |
| `_authenticated/agent.tsx` | `/agent` | Chat agent UI: conversations, pending confirmations, action results. |
| `_authenticated/billing.tsx` | `/billing` | Plans, Razorpay checkout, payment history. |
| `_authenticated/campaign-edit.$campaignId.tsx` | `/campaign-edit/{campaignId}` | Campaign editor: audience, offer, sequence, delivery mode, launch. |
| `_authenticated/campaign-review.$campaignId.tsx` | `/campaign-review/{campaignId}` | Pre-launch review: summary counts, eligibility, warnings before enqueue. |
| `_authenticated/campaigns.tsx` | `/campaigns` | Campaign list and creation. |
| `_authenticated/dashboard.tsx` | `/dashboard` | Owner dashboard: sends, replies, meetings, queue and health. |
| `_authenticated/emails.tsx` | `/emails` | Sent-email timeline and thread view. |
| `_authenticated/lead-edit.$leadId.tsx` | `/lead-edit/{leadId}` | Lead detail: edit, history, AI draft, follow-up state. |
| `_authenticated/lead-finder.tsx` | `/lead-finder` | Lead discovery: niche x area, filters, import to campaign. |
| `_authenticated/leads.tsx` | `/leads` | Lead list with lifecycle, verification and suppression state. |
| `_authenticated/onboarding.tsx` | `/onboarding` | Business identity (brand + street address), Gmail connection, first campaign. |
| `_authenticated/settings.tsx` | `/settings` | Profile, business identity, signature, Gmail, domain, danger zone. |
| `_authenticated/verify-domain.tsx` | `/verify-domain` | DNS TXT verification flow for a flagged account. |
| `about.tsx` | `/about` | Marketing: what the product is and who it is for. |
| `agency.tsx` | `/agency` | Agency / high-volume offer. |
| `auth.callback.tsx` | `/auth/callback` | Email-confirmation callback. |
| `auth.google.callback.tsx` | `/auth/google/callback` | Google OAuth callback. |
| `auth.tsx` | `/auth` | Sign in and sign up. |
| `gmail.callback.tsx` | `/gmail/callback` | Gmail OAuth callback. |
| `honesty.tsx` | `/honesty` | Explicit limitations page (what the product does not do). |
| `index.tsx` | `/` | Marketing home: positioning, pricing, FAQ, social proof. |
| `preview-hero-nodes.tsx` | `/preview-hero-nodes` | Internal visual preview of the hero animation. |
| `privacy.tsx` | `/privacy` | Privacy policy. |
| `refunds.tsx` | `/refunds` | Refund policy. |
| `security.tsx` | `/security` | Security and data-handling page. |
| `stats.tsx` | `/stats` | Public aggregate stats. |
| `status.tsx` | `/status` | Public status page fed by public_stats / health. |
| `terms.tsx` | `/terms` | Terms of service, including the free-trial clause. |
| `tools.tsx` | `/tools` | Free public tools (lead-generation utilities). |
| `unsubscribe.tsx` | `/unsubscribe` | Public one-click opt-out. |

---

# Appendix G — Shared modules (40 files in `_shared`)

These are the libraries every Edge Function imports. Most are pure (no I/O) so the Node test harness can execute the exact shipped logic.

| Module | Responsibility |
|---|---|
| `action-budget.ts` | — |
| `agent-account-context.ts` | Loads the OWNER + ACCOUNT facts for one agent turn. The agent used to start every reply knowing only what the person had typed into this chat. The support chatbot already loads a live snapsh… |
| `agent-capabilities.ts` | What the agent can actually do, described as GOALS rather than word lists. This is the single source of truth. The prompt is built from it, and the model's answer is validated back against i… |
| `agent-config.ts` | AGENT CONFIG — config-driven judgment for inbox-agent (0b). Reads per-invocation: glob -> user -> campaign (most specific wins). Emergency default: the compile-time constants below are used … |
| `agent-executor.ts` | AGENT EXECUTOR — turns a routed intent into a database read or write. Two rules hold everywhere in this file: 1. Every query is scoped by user_id. The caller passes a service-role client, so… |
| `agent-learning.ts` | The fast lane: learned vocabulary. One function answers "what did this account teach us about these words?" and another records the outcome so the next time costs nothing. The promotion rule… |
| `agent-pending.ts` | Remembering what we were in the middle of. The agent asks "Which campaign should I add them to?" and the person answers "Q3 push". Without help, that answer looks like a brand-new message: t… |
| `agent-profile.ts` | — |
| `agent-router.ts` | AGENT ROUTER — intent-first, deterministic, zero AI calls. This is the whole point of the design: a known request is a string match and a database query, not a model call. Only a request we … |
| `agent-slots.ts` | Words that are capitalised for grammar, not because they name a place. |
| `agent-understand.ts` | The slow lane: understanding. This runs ONLY when the fast lane misses, so it is allowed to be as flexible as it likes. It is deliberately permitted to do the thing the old router made impos… |
| `ai-cost-gate.ts` | AI-COST-GATE — Stage 7 request-time consumer contract. Design: INTELLIGENCE-LAYER-DESIGN.md §6.3→§6.6. Principles enforced HERE, in one place: * The hard ceiling is a DURABLE atomic reservat… |
| `ai-lib.ts` | AI-LIB — shared prompt intelligence for every AI surface. Few-shot voice examples, attention-opening playbook, lead language detection, and deterministic opener selection so a lead never rec… |
| `app-base-url.ts` | supabase/functions/_shared/app-base-url.ts — THE ONE shared frontend base URL. Every clickable link this agent can put in front of a lead (the digest's per-lead /lead-edit/{uuid}, its /leads… |
| `areas.ts` | Area intelligence for the lead finder. Curated major-metro lists per country + sampled country-level searches so results vary per demand, plus quick Google probe scoring for "best areas". |
| `audit.ts` | Audit trail: every automated action must be traceable. |
| `business-context.ts` | Business + account context for AI prompts. WHY THIS FILE EXISTS The business facts already live in `profiles` - Settings writes them for the email-writing AI (business_description, offer, pr… |
| `cors.ts` | Shared CORS config — restrict to the production frontend origin. Cron-only functions should omit CORS headers entirely (they're not called from browsers). |
| `crypto.ts` | AES-GCM encryption for OAuth credentials at rest. Key: GOOGLE_TOKEN_ENC_KEY env secret (64 hex chars = 32 bytes). Format: "v1:<iv_b64>:<ct_b64>" — legacy plaintext values pass through. |
| `effective-plan.ts` | Effective plan resolution. Referral rewards grant a temporary free upgrade ('starter') that stacks ABOVE the subscription plan and never downgrades it. |
| `email-verifier.ts` | Email verification + disposable detection — used by find-leads, send-campaign, send-worker DNS-only validation (no SMTP probes). Deno runtime. |
| `gmail.ts` | Gmail access layer: token lifecycle + raw send with ID capture. Credentials are decrypted transparently; tokens never leave the server. |
| `google-maps.ts` | Google Maps Places API (New) lead finder — finds businesses + enriches their websites for emails Uses Places API (New) Text Search Essentials — 10,000 free searches/month https://developers.… |
| `groq.ts` | TPM-budget escape hatches: when the primary model's token-per-minute pool is exhausted (429), retry the SAME prompt on a model with its OWN per-model TPM pool. Groq rate-limits per API key A… |
| `health-engine.ts` | Pure decision engine for the hourly health-check. No Deno, no DB. Shared by supabase/functions/health-check/index.ts (runtime) and scripts/.ops/prove-health-sim.mjs (simulation proof) so the… |
| `intelligence-reads.ts` | INTELLIGENCE-READS — Stage 5 request-time consumer contract. Design: INTELLIGENCE-LAYER-DESIGN.md §2.2, §2.3, §2.5, §3. Principles enforced HERE, in one place: * Staleness = "no opinion": le… |
| `lead-ai.ts` | Lead-finder AI intelligence ============================================ Uses the shared Groq client to (1) plan better search queries/locations and (2) curate the discovered pool into the h… |
| `osm.ts` | Shared OpenStreetMap lead-finder (used by find-leads API and autopilot cron) |
| `policy.ts` | POLICY ENGINE — the ONLY component allowed to decide actions. AI provides structured classification; this module is deterministic. ===========================================================… |
| `razorpay-plans.ts` | RAZORPAY PLAN CATALOG — single source of truth. The amount is decided HERE, server-side, from the plan id the client sends. The browser never gets to state a price: it asks for a plan, we lo… |
| `reply-address.ts` | Per-lead inbound reply address. Outbound mail sets Reply-To to this address; the provider's inbound-parse webhook extracts the lead id and routes the reply back into the app. No Gmail read s… |
| `reply-styles.ts` | Reply shape — the decision variable that makes reply-style learning possible. Before this file the reply prompt was a single fixed instruction string, so there was nothing to attribute an ou… |
| `sanitize.ts` | Pure text sanitising for prompts, with no network imports so it stays usable (and unit-testable) outside the Deno runtime. |
| `saved-businesses.ts` | "Our own map": a permanent, ever-growing ledger of every business the lead finder has legitimately found (Google, OpenStreetMap, website enrichment). Searches check this table FIRST — zero e… |
| `search-budget.ts` | Google Maps search budget — the single daily allowance every live Google Places search draws from, and the meter the background "leftover quota" workers read to know how much of the day's al… |
| `search-cache.ts` | Shared DB-backed cache for the lead finder so Google Places quota is spent on NEW chemistry only, never on repeat searches. TTLs: areas 7 days, lead results 12h. All access via the service-r… |
| `support-boundary.ts` | The capability line in code: `isPersonalContactRequest()` detects requests for private people's contact data, `personalContactAnswer()` returns the deterministic refusal with business-only alternatives. Pure, no imports, unit-tested. |
| `sender-health.ts` | 0a shared: downstream daily-cap resolution. Reads gmail_tokens.connected_at for the warm-up anchor and sender_health for health-adjusted caps. Fail-safe: when the health ledger has no row, o… |
| `thread-memory.ts` | THREAD-MEMORY — the durable memory writer (Stage 8, §8.5/§8.6). Produces facts from a Gmail thread slice into thread_memory, routed through the ai-cost-gate with kind `summarize` (an L1, non… |
| `website-email-enrichment.ts` | Website email enrichment — crawls public business websites to find displayed email addresses Only collects publicly displayed emails from contact/about/team/footer pages. Deno runtime. Used … |

---
