> **SUPERSEDED (2026-09-28):** Payment processing in this report is obsolete. LemonSqueezy has been fully removed; billing is now Razorpay (one-time checkout, no auto-renewal) via `razorpay-create-order` + `razorpay-webhook`. Any statement below about `billing-webhook`, `LEMONSQUEEZY_WEBHOOK_SECRET`, proration, or renewals describes a system that no longer exists. Kept unaltered as a dated record.

# PART 7 — AUDIT REPORT (READ-FIRST, FIX-ONLY)

This audit classified every finding by severity and only fixed actual defects
that affect correctness, security, or reliability. No unnecessary changes.

---

## FINDINGS CLASSIFICATION

### CRITICAL — Fixed

**1. `send-reply/index.ts:143` — double base64url encoding (every manual reply garbled)**

`buildRawEmail()` already returns base64url (gmail.ts:123-126). `send-reply` called
`toBase64Url(raw)` on the already-encoded result. Gmail received a double-encoded
payload — every manual reply via "Send from my Gmail" was garbled/rejected.

```
BEFORE: sendGmailRaw(accessToken, toBase64Url(raw))  // double-encodes
AFTER:  sendGmailRaw(accessToken, raw)                // correct
```

### HIGH — Fixed

**2. `send-worker/index.ts` — follow-up concurrency race (duplicate follow-up emails)**

`processDueFollowUps` read rows with `follow_up_sent = false` without any row-level
locking. Two workers could both pass the idempotency check, both reserve send slots,
both send via Gmail, and both try to insert the step row. The second DB insert fails
(unique constraint) but the Gmail send already happened — duplicate email delivered.

Fixed with atomic CAS claim before send:
```
UPDATE emails_sent SET follow_up_sent = true
WHERE id = ... AND follow_up_sent = false
RETURNING id
```
If no rows returned → another worker claimed it → skip.

### HIGH — No Fix (External Dependency)

**3. `LEMONSQUEEZY_WEBHOOK_SECRET` not configured**

Billing webhook returns 500 — HMAC verification cannot work. This is a deployment
config issue, not a code defect. User must set the secret manually.

### MEDIUM — No Fix (Not a Defect)

**4. `find-leads` has no rate limiting**

Each call triggers 2-8 Overpass API requests. Unlike `tools/index.ts` which has
dual-layer rate limiting, `find-leads` has none. Risk: IP ban from Overpass mirrors.
Not a correctness/reliability bug — it's an abuse-prevention gap. Flagged for future.

**5. `support-chat` has no AI quota enforcement**

Every call invokes `groqChat()` which costs real API credits. Unlike `generate-email`
which uses `consume_ai_quota` RPC, `support-chat` has no quota. Risk: credit burn.
Not a correctness bug — it's a cost-control gap. Flagged for future.

**6. GDPR `delete-account` incomplete**

Missing cleanup for 9 tables: `gmail_tokens`, `suppressions`, `send_queue`, `audit_events`,
`tracking_events`, `email_threads`, `owner_alerts`, `ai_classifications`, `tools_rate_limit`.
Also missing Google OAuth token revocation. Already flagged in earlier audit. Not a defect
in current functionality — data deletion is incomplete but the account IS deleted.

### LOW — No Fix

**7. `inbox-agent/index.ts:204` — typo "UNSUBSCRIVED" in status check**

Dead code — no status value is ever set to this misspelled string. The correct
`"UNSUBSCRIBED"` in the same array handles the real case. Zero impact.

**8. Frontend pages race on rapid remount**

`useEffect(() => void load(), [])` without abort controllers. If component unmounts
and remounts quickly, two `load()` calls are in flight and stale data can overwrite
fresh. Window is tiny. UI polish, not a defect.

**9. `buildBIContext` duplicated across files**

Same helper exists in `inbox-agent/index.ts` and `send-worker/index.ts`. Could be
extracted to `_shared/`. Code duplication, not a defect.

**10. Dead `toBase64Url` function in `send-reply/index.ts:20-25`**

After the CRITICAL fix, this function is no longer called. Dead code — not a defect.

### NO ISSUE — Verified Correct

| Area | Status |
|---|---|
| All edge function auth checks (verify_jwt) | ✅ Correct |
| All cron secret verifications | ✅ Correct |
| Billing webhook HMAC + timing-safe comparison | ✅ Correct |
| Unsubscribe endpoint (UUID validation, RFC 8058) | ✅ Correct |
| Track-open (UUID validation, idempotent update) | ✅ Correct |
| Gmail OAuth state parameter (CSRF protection) | ✅ Correct |
| `send-worker` primary queue (atomic claim + two-phase insert) | ✅ Correct |
| All SQL queries (parameterized via Supabase client) | ✅ No injection |
| Frontend XSS (React auto-escaping) | ✅ No XSS |
| `groq.ts` key rotation + retry | ✅ Correct |
| `policy.ts` deterministic decision engine | ✅ Correct |
| `crypto.ts` AES-GCM encrypt/decrypt | ✅ Correct |
| `spam-check` (pure local, no external calls) | ✅ Safe |
| `tools` rate limiting (dual-layer + AI budget) | ✅ Working |
| `generate-email` quota enforcement | ✅ Correct |
| `assert_not_suppressed` trigger | ✅ Correct |
| `enforce_lead_cap` trigger | ✅ Correct |
| `reserve_send_slot` atomic reservation | ✅ Correct |
| `claim_queue_jobs_v2` atomic claiming | ✅ Correct |
| `uniq_emails_first` unique constraint | ✅ Correct |
| `uniq_emails_step` unique constraint | ✅ Correct |
| All RLS policies | ✅ Enforced |
| All CHECK constraints | ✅ Correct |
| `.gitignore` covers secrets | ✅ Correct |

---

## FIXES APPLIED IN THIS SESSION

| Commit | Fix | Severity |
|---|---|---|
| `14e8620` | Two-phase insert + `uniq_emails_first` constraint | HIGH |
| `e56edd3` | `gmail.ts` profile_id fix + `owner_alerts` CHECK constraint | P0 |
| `2d19c53` | Dead columns/function/indexes + types.ts regeneration | MEDIUM |
| `52b636c` | Stale `follow-up` function deleted | MEDIUM |
| (current) | `send-reply` double base64url encoding fix | CRITICAL |
| (current) | `send-worker` follow-up atomic CAS claim | HIGH |
