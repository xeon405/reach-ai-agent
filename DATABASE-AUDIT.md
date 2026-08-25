# DATABASE AUDIT — Part 5

Queried production database directly via Supabase Management API.
Compared actual schema against all edge function code and frontend code.

---

## Production Database Summary

| Object Type | Count |
|---|---|
| Tables | 16 |
| Indexes | 38 |
| Foreign Keys | 11 |
| Triggers | 6 |
| Functions/RPCs | 12 |
| RLS Policies | 14 |
| CHECK Constraints | 4 |

---

## BUGS FOUND & FIXED

### BUG 1: `gmail.ts:76` — delete by wrong column (P0)
**Impact**: Stale OAuth tokens never cleaned up when Google revokes a grant.

```
// BEFORE (broken):
await admin.from("gmail_tokens").delete().eq("user_id", userId);

// AFTER (fixed):
await admin.from("gmail_tokens").delete().eq("profile_id", userId);
```

The `gmail_tokens` table PK is `profile_id`. The `.eq("user_id", ...)` matched zero rows.

### BUG 2: `owner_alerts.kind` CHECK blocks `"review"` (P0)
**Impact**: Autoresponder detection and reply-loop guard alerts silently lost.

The CHECK constraint only allowed: `booking, opt_out, takeover, handoff, bounce, first_reply`.
Code inserts `kind: "review"` at `inbox-agent:542` and `inbox-agent:553`.
The `try/catch` around the row loop swallowed the constraint violation error.

Fixed by adding `'review'` to the CHECK constraint.

---

## VERIFIED: All Clear (no issues)

### Functions/RPCs
| Function | Called by | Status |
|---|---|---|
| `claim_queue_jobs_v2` | send-worker:280 | ✅ Exists |
| `reserve_send_slot` | send-worker | ✅ Exists |
| `release_send_slot` | send-worker:320,616,665 | ✅ Exists |
| `consume_ai_quota` | send-worker | ✅ Exists |
| `public_stats` | status.tsx | ✅ Exists |
| `referral_count` | settings.tsx | ✅ Exists |
| `claim_queue_jobs` (v1) | — (unused) | ⚠️ Dead function |

### Unique Constraints
| Constraint | Table | Status |
|---|---|---|
| `uniq_emails_first` | emails_sent | ✅ Exists (WHERE sequence = 1) |
| `uniq_emails_step` | emails_sent | ✅ Exists (WHERE sequence >= 2) |
| `uniq_queue_job` | send_queue | ✅ Exists |
| `uniq_queue_active_lead` | send_queue | ✅ Exists |
| `uniq_leads_user_normalized` | leads | ✅ Exists |
| `uniq_aiclass_message` | ai_classifications | ✅ Exists |
| `uniq_suppressions_user_plain` | suppressions | ✅ Exists |
| `email_threads_user_id_lead_id_key` | email_threads | ✅ Exists |

### RLS
- All 16 tables have RLS enabled
- 14 tables have user-isolation policies
- 2 tables (`gmail_tokens`, `tools_rate_limit`) have RLS ON but no user-facing policy — safe because only service-role edge functions access them

### Triggers
- `assert_not_suppressed()` fires on `emails_sent` and `send_queue` BEFORE INSERT
- `enforce_lead_cap()` fires on `leads` BEFORE INSERT
- `audit_campaigns_write()` fires on `campaigns` AFTER INSERT/UPDATE
- `audit_leads_insert()` fires on `leads` AFTER INSERT
- All trigger functions are `SECURITY DEFINER` with `search_path = 'public'`

---

## DEAD COLUMNS (never read or written by code)

| Table | Column | Notes |
|---|---|---|
| `send_queue` | `status_new` | Unused by all code |
| `usage_limits` | `ai_calls_today` | Upserted alongside `emails_sent_today` but never read |
| `gmail_tokens` | `access_token` | Always set to null; tokens minted on-demand via `getAccessToken()` |

## DEAD TABLES

| Table | Status |
|---|---|
| `meetings` | Only referenced in `delete-account` cleanup. No app logic creates rows. |
| `referrals` | Only read for export. No insert logic exists. Half-built feature. |

## DEAD FUNCTIONS

| Function | Status |
|---|---|
| `claim_queue_jobs` (v1) | Superseded by `claim_queue_jobs_v2`. No code calls v1. |

---

## MISSING INDEXES (performance recommendations)

These queries would benefit from composite indexes but currently don't have them:

| Query Pattern | File | Recommended Index |
|---|---|---|
| `leads WHERE campaign_id AND status = 'new'` | send-campaign | `(campaign_id, status)` |
| `emails_sent WHERE user_id AND replied = false` | inbox-agent | `(user_id, replied)` |
| `emails_sent WHERE ai_paused = false AND ai_turns < 3` | inbox-agent | `(ai_paused, ai_turns)` |
| `emails_sent WHERE user_id ORDER BY sent_at DESC` | daily-digest | `(user_id, sent_at)` |
| `audit_events WHERE user_id AND lead_id AND event` | inbox-agent | `(user_id, lead_id, event, created_at)` |

These are NOT bugs — the existing indexes work. These are performance recommendations for scale.

---

## types.ts DESYNC (frontend type safety)

`src/integrations/supabase/types.ts` only covers 8 of 16 tables and is missing 22+ columns that the edge functions read/write. This doesn't affect runtime but means TypeScript won't catch column-name bugs in the frontend.

Missing table types: `ai_classifications`, `audit_events`, `email_threads`, `owner_alerts`, `suppressions`, `usage_limits`, `meetings`, `referrals`.

Missing column types on existing tables: `leads.lifecycle`, `leads.conv_mode`, `leads.normalized_email`, `emails_sent.ai_turns`, `emails_sent.last_lead_msg_at`, `emails_sent.last_ai_msg_at`, `emails_sent.ai_paused`, `emails_sent.gmail_message_id`, `emails_sent.gmail_thread_id`, `emails_sent.opened_at`, `send_queue.last_error`, `send_queue.next_retry_at`, `send_queue.lease_until`, `send_queue.updated_at`, `profiles.gmail_account_type`, `profiles.gmail_state`, `profiles.signature`.
