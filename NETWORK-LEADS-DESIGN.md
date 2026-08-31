# Network Leads — Design Doc (Parked)

Status: **Planning only. Not implemented.**

## Idea
Reuse our own users' business data (they are businesses running outreach on the platform) as a
high-intent lead source. When another user runs an AI lead search, first match against other
users' businesses fitted to the search intent, and surface them as "network" leads.

## Why it's good
- We already store each user's business signal: `offer`, `website_url`, `country`, industry
  (derivable from offer/website), plan tier.
- Near-zero new data collection.
- Higher intent than scraped leads; the personalized first line is naturally stronger
  ("You run X on OutShipAI too...").

## The trap (why it must be warm, not cold)
If User A's AI cold-emails User B's personal Gmail as a lead, User B feels surveilled and churns.
Compliance (GDPR/anti-spam) plus retention rules mean we must not mine our paying customers'
private contact data for cold outreach.

## Recommended shape: consent-based warm network
1. **Off by default.** New profile flag `network_mode` (default `false`).
2. **Warm, not cold.** When a match is surfaced, the target's **email/phone is never exposed**.
   Results show: business name, offer, website, country, industry.
3. **Double opt-in intro.** Searcher requests an intro → target gets an **in-app notification**
   ("Acme wants to reach you") → accept/reject → only on accept does contact open (e.g. both
   sides see a contact thread; or the requestor may use the target's website/website form).
4. **Guardrails.**
   - Auto-exclude same-niche competitors from matching each other (compare offer/industry signal).
   - Honor `unsubscribed` / `bounced` / `suppressed` users immediately (never surface them).
   - Never expose personal email/phone to strangers in results (email only after accept).
   - Respect existing suppression/opt-out when follow-ups/conversations begin after accept.

## Data available today
- `profiles`: `name`, `gmail_email`, `email`, `country`, `offer`, `website_url`, `booking_link`,
  `phone`, `plan`, `created_at`.
- `campaigns` / `leads`: what each user targets, their niche keywords, active industries.
- Enrichment columns (lead discovery) for industry/geo classification.

## Schema proposal (if we build it)
- `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS network_mode boolean NOT NULL DEFAULT false;`
- `network_businesses` view: active profiles with `network_mode = true` + derived
  `industry`, `country`, `offer`, `website_url` (masked contact).
- `intro_requests` table:
  - `id`, `requester_user_id`, `target_user_id`, `campaign_id` (nullable), `message`,
    `status` (`pending` | `accepted` | `rejected` | `expired`), `created_at`, `resolved_at`.
- Match hook: in the AI lead-search path, run a similarity/tag query over the view and inject
  up to N network matches tagged `source: network` with richer first-line context.

## UI proposal
- Settings: "Discoverable by other businesses in the network" toggle (`network_mode`).
- Leads / Search: network matches appear with a "Network" badge; CTA = "Request intro" (not
  "Send email").
- Notifications: intro request/response as in-app `owner_alerts` (already built).

## Rollout phases
1. Migration + `network_mode` toggle (Settings) — off by default, no behavior change.
2. `intro_requests` + in-app notify path (request/accept/reject).
3. Search injection with `source: network` tag.
4. Niche/competitor exclusion + matching ranking.

## Open questions (defer)
- Match relevance bar / minimum confidence before a network match is shown.
- Whether accept should auto-create a lead + start a warm campaign, or just open contact.
- Rate limits on intro requests per user per day.
- Whether business info (as opposed to personal) may be shown even for opt-out profiles.

## Intentionally NOT doing
- No scraping of user emails/phones for cold outreach.
- No default participation ("everyone is a lead") — always opt-in.
- No exposing target contact details pre-accept.