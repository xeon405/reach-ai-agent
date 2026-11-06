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
