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
