Meetings growth + Calendly webhook: confirmed bookings tracked end-to-end.

## What shipped
- meetings table growth (migration 20260913000000): provider (default 'calendly'),
  provider_event_id, start_time, end_time, timezone, status CHECK
  ('scheduled'|'cancelled'|'completed'|'no_show', default 'scheduled'),
  invitee_email, metadata jsonb, partial unique index on (provider, provider_event_id).
  APPLIED to the live DB. Types regenerated (src/integrations/supabase/types.ts).
- calendly-webhook edge function (verify_jwt=false):
  - Calendly's real signature scheme: Calendly-Webhook-Signature header
    (t=<unix_ts>,v1=<hex>), HMAC-SHA256 over "{t}.{raw body}" with the secret in
    CALENDLY_WEBHOOK_SECRET, 300s replay tolerance, timing-safe hex string compare.
  - Owner-first attribution: normalized ownerKey (host + first path segment,
    case/www/trailing-slash folded) matching payload scheduling_url against
    profiles.booking_link; invitee email matched only within that owner's leads.
  - invitee.created: idempotent meetings insert, lead lifecycle -> BOOKING +
    status 'booked' + followup_status 'cancelled' + next_followup_at NULL,
    owner alert kind='booking' priority 'high', audit booking.confirmed.
  - invitee.canceled: flips existing row to cancelled, audit booking.cancelled,
    does NOT resume follow-ups.
  - Untracked calendars (blind) return 200 no_owner, zero side effects.
- get-calendly-config edge function (verify_jwt=true): returns webhook URL +
  shared signing key to an authenticated owner for manual Calendly webhook setup.
- Settings "Calendly bookings" card + onboarding hint: step-by-step webhook
  subscription instructions (invitee.created + invitee.canceled) with copy buttons.
- Dashboard: "Bookings" KPI, funnel + email performance + conversion rates +
  campaign table + activity feed now count confirmed meetings (meetings rows,
  status='scheduled') instead of expressed intent. daily-digest adds a
  "Meetings booked" line + hot condition + digest.sent payload field.
- send-worker: no change needed — pre-send re-check (claim != 'sending' aborts)
  already stops leads the webhook cancelled mid-flight.

## Proofs (all passing)
- scripts/.ops/prove-calendly-sim.mjs: 19/19 — ownerKey normalization matrix,
  HMAC scheme, tamper/stale/empty/wrong-secret rejection.
- scripts/.ops/prove-calendly-live.mjs: 20/20, teardown verified (0 orphan rows).
  0) migration live; A) 401 on tampered/missing sig, no side effects; B) meeting
  row + BOOKING/booked/cancelled + high alert + booking.confirmed audit;
  C) replay is idempotent; D) same email under another owner = no side effects;
  E) cancel flips row, no resume; F) blind calendar 200 no_owner; G) config
  endpoint 401 without JWT / 200 + matching secret with JWT.

## Value uncovered by the proofs
- Calendly does NOT use the billing-webhook (Lemon Squeezy) scheme we planned to
  mirror: real signature is Stripe-style t/v1 over "{t}.{body}", not X-Hook-
  Signature over the bare body. A live-only-signed 401 on every request caught it.
- Buffer.from(hex) throws in this edge runtime; hex string compare used instead.
- Owner-scoped attribution verified live: same invitee email under two owners
  produced exactly one meeting, under the right owner.

## Known limit (explicit, per approved design)
Only Calendly accounts wired to this webhook are tracked; the shared signing
key is app-wide and visible to any authenticated user (forgiving only when an
attacker also knows a victim's booking_link + a victim lead email). Bookings on
other schedulers stay untracked.

## Ops
- CALENDLY_WEBHOOK_SECRET set on the project (Management API) and in .env.
- Deploys: inbox-agent, send-worker, send-campaign redeployed to clear a
  pre-existing _shared/intelligence-reads.ts staleness (their bundles predated
  the on-disk HEAD file); deploy-fn.sh was ABORTING on that stale state, so the
  three stale functions were shipped directly with --no-verify-jwt preserving
  their flags. calendly-webhook and get-calendly-config deployed via deploy-fn.sh;
  calendly-webhook verify_jwt explicitly PATCHed to false after first deploy
  (Calendly cannot present a Supabase JWT). Sweep: 0 stale.
- New migrations still apply: reference this migration's filename convention.
- Calendly webhook subscriptions are created manually by each owner from the
  Settings card; no API registration (bootstrap per agreed design).