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
