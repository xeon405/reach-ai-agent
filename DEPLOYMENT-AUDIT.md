> **SUPERSEDED (2026-09-28):** Payment processing in this report is obsolete. LemonSqueezy has been fully removed; billing is now Razorpay (one-time checkout, no auto-renewal) via `razorpay-create-order` + `razorpay-webhook`. Any statement below about `billing-webhook`, `LEMONSQUEEZY_WEBHOOK_SECRET`, proration, or renewals describes a system that no longer exists. Kept unaltered as a dated record.

# DEPLOYMENT AUDIT — Part 6

Verified production deployment state on 2026-08-25.

---

## VERCEL FRONTEND

| Check | Status |
|---|---|
| `https://outreach-ochre-sigma.vercel.app` | ✅ 200 OK |
| `/status` page | ✅ 200 OK |
| `/unsubscribe` page | ✅ 200 OK |
| Git push triggers auto-deploy | ✅ Confirmed |
| Publishable key in code | ✅ `sb_publishable_HzeVbGj6DI3klatdPuQnhA_qqTzZ0uM` (public, expected) |
| No localhost references | ✅ Clean |
| No secrets in frontend code | ✅ Clean |

---

## SUPABASE EDGE FUNCTIONS (16 deployed)

All 16 functions deployed and ACTIVE. Local code matches deployed versions.

| Function | Version | Status | Last Deployed |
|---|---|---|---|
| send-worker | v18 | ✅ ACTIVE | 2026-08-25 (two-phase insert fix) |
| inbox-agent | v14 | ✅ ACTIVE | 2026-08-25 (review kind fix) |
| send-reply | v13 | ✅ ACTIVE | 2026-08-25 (gmail.ts fix) |
| daily-digest | v4 | ✅ ACTIVE | 2026-08-25 (gmail.ts fix) |
| find-leads | v27 | ✅ ACTIVE | Latest |
| send-campaign | v60 | ✅ ACTIVE | Latest |
| generate-email | v23 | ✅ ACTIVE | Latest |
| gmail-oauth | v20 | ✅ ACTIVE | Latest |
| tools | v16 | ✅ ACTIVE | Latest |
| billing-webhook | v9 | ✅ ACTIVE | Latest |
| delete-account | v9 | ✅ ACTIVE | Latest |
| support-chat | v7 | ✅ ACTIVE | Latest |
| unsubscribe | v7 | ✅ ACTIVE | Latest |
| track-open | v5 | ✅ ACTIVE | Latest |
| spam-check | v3 | ✅ ACTIVE | Latest |
| **follow-up** | v58 | ⚠️ **STALE** | Deprecated shim (410 GONE) |

### STALE FUNCTION: `follow-up`

Deployed version 58 returns `410 GONE`. No cron job calls it. No code references it.
Should be deleted from Supabase to avoid confusion.

---

## CRON JOBS (3 active)

| Job | Schedule | Target | Secret | Status |
|---|---|---|---|---|
| `outreachai_send_worker_hourly` | `5 * * * *` | send-worker | ✅ Match | ✅ ACTIVE |
| `outreachai_inbox_agent_hourly` | `20 * * * *` | inbox-agent | ✅ Match | ✅ ACTIVE |
| `outreachai_daily_digest` | `0 4 * * *` | daily-digest | ✅ Match | ✅ ACTIVE |

All 3 cron jobs use the correct `CRON_SECRET` (value redacted in VCS).
All 3 target the correct function URLs at `https://zvohdvopmvzsujktrdmu.supabase.co/functions/v1/`.

---

## SECRETS (16 configured)

### User-managed secrets
| Secret | Status |
|---|---|
| `CRON_SECRET` | ✅ Configured, matches cron job commands |
| `GOOGLE_CLIENT_ID` | ✅ Configured |
| `GOOGLE_CLIENT_SECRET` | ✅ Configured |
| `GOOGLE_REDIRECT_URI` | ✅ Configured |
| `GOOGLE_TOKEN_ENC_KEY` | ✅ Configured |
| `GROQ_API_KEYS` | ✅ Configured (code has `GROQ_API_KEY` fallback) |
| `GROQ_MODEL` | ✅ Configured |
| `SENDER_ADDRESS` | ✅ Configured |
| `APOLLO_API_KEY` | ✅ Configured |

### Missing secrets
| Secret | Impact |
|---|---|
| `LEMONSQUEEZY_WEBHOOK_SECRET` | ⚠️ **Not configured** — billing webhook returns 500. HMAC verification cannot work. |

### Auto-managed by Supabase (not user-configurable)
`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`, `SUPABASE_JWKS`, `SUPABASE_PUBLISHABLE_KEYS`, `SUPABASE_SECRET_KEYS`

### Hardcoded defaults in code (no secret needed)
| Secret | Default | Status |
|---|---|---|
| `AI_DAILY_CAP` | `200` | ✅ Has fallback |
| `PLAN_VARIANT_MAP` | Empty | ✅ Has fallback logic |

---

## PRODUCTION URLs

| URL | Used In | Status |
|---|---|---|
| `https://outreach-ochre-sigma.vercel.app` | SITE constant in inbox-agent, send-reply, send-worker, unsubscribe, osm | ✅ Correct |
| `https://zvohdvopmvzsujktrdmu.supabase.co` | Cron job targets, pixel URLs | ✅ Correct |

---

## TRACKING / UNSUBSCRIBE ENDPOINTS

| Endpoint | HTTP Status | Notes |
|---|---|---|
| `track-open?id=test` | 200 | ✅ Responds (200 even for invalid IDs — pixel always fires) |
| `unsubscribe?l=test&c=test` | 400 | ✅ Responds (400 for invalid IDs — expected, requires valid lead/campaign) |
| Frontend `/unsubscribe` | 200 | ✅ Renders unsubscribe page |

---

## GIT / SECRETS SAFETY

| Check | Status |
|---|---|
| `.gitignore` covers `.env*` | ✅ |
| `.gitignore` covers `.cron-secret.txt` | ✅ |
| `.gitignore` covers `.new-token.txt` | ✅ |
| No secret files in git history | ✅ Clean |
| No hardcoded API keys in code | ✅ Only publishable key (public) |
| No localhost references | ✅ Clean |

---

## ISSUES FOUND

| # | Severity | Issue | Fix |
|---|---|---|---|
| 1 | **P1** | `follow-up` function deployed but stale (v58, returns 410) | Delete from Supabase |
| 2 | **P1** | `LEMONSQUEEZY_WEBHOOK_SECRET` not configured | Set via `supabase secrets set` |
