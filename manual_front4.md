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

