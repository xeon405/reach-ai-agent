# OutshipAi — Failure / Recovery Audit (Part 3)
**Date:** 2026-08-25

---

## Executive Summary

**11 failure scenarios tested. 3 bugs found (1 Critical, 2 Medium). System is generally resilient but has a structural flaw in the send path.**

The defense-in-depth architecture (3-level suppression, atomic slot reservation, `FOR UPDATE SKIP LOCKED`, lease-based reclamation, idempotent classification) is strong. Most failure modes fail safely. The critical bug is a **phantom-send** pattern: if Gmail fails after the `emails_sent` row is inserted, retry logic marks the job as "sent" even though no email went out.

---

## Scenario-by-Scenario Results

### 1. Worker crashes mid-send

**Mechanism:** Queue jobs claimed with 10-min lease via `claim_queue_jobs_v2`. `FOR UPDATE SKIP LOCKED` prevents double-claim.

**Recovery path:** Lease expires → next cron run re-claims → retries up to 4× with exponential backoff → dead-letters.

| Sub-scenario | Result |
|---|---|
| Crash before `emails_sent` insert | ✅ Clean retry — job re-claimed, nothing inserted |
| Crash after insert, before Gmail send | ⚠️ **BUG #1 (CRITICAL)** — see below |
| Crash after Gmail send, before status update | ✅ Idempotent — re-claim finds existing `emails_sent` row, marks job `sent` |

**BUG #1 — Phantom-send: email lost on Gmail failure after insert**

```
send-worker/index.ts processJob():
  Line 482: INSERT emails_sent row (no gmail_message_id yet)
  Line 502: sendGmailRaw() → THROWS (Gmail 5xx, timeout, etc.)
  → catch → failJob() → retries
  
  On re-claim:
  Line 418: SELECT emails_sent WHERE campaign_id=X AND lead_id=Y AND sequence=1
  → FINDS the phantom row → marks job as "sent" → SKIPS send
```

**Impact:** Email is permanently lost. `emails_sent` row exists with null `gmail_message_id`. No email was sent but the system thinks it was. Follow-up scheduler may later try to send follow-ups for an email that was never delivered.

**Fix:** Don't insert `emails_sent` until AFTER `sendGmailRaw` succeeds. Insert + send should be atomic from the caller's perspective.

---

### 2. Gmail API fails

| Scenario | Handling | Verdict |
|---|---|---|
| `sendGmailRaw` returns non-200 | Throws → `failJob` → retry/dead-letter | ✅ Safe (except BUG #1 above) |
| `sendGmailRaw` network timeout | Same as above | ✅ Safe |
| Gmail `messages/list` fails in inbox-agent | `if (!searchRes.ok) continue` — skips row | ✅ Safe — will retry next cron cycle |
| Gmail `messages/get` fails | Falls back to empty body, classifies on snippet | ✅ Graceful degradation |
| `getAccessToken` fails transiently | Sets `gmail_state: TOKEN_REFRESH_FAILED`, throws | ✅ Safe — next run retries |

---

### 3. OAuth expires

**Mechanism:** `getAccessToken()` → `mintAccessToken()` → Google returns `invalid_grant`.

**Handling (`gmail.ts:73-79`):**
1. Deletes `gmail_tokens` row
2. Sets `gmail_connected: false, gmail_state: ACCESS_REVOKED`
3. Throws `GMAIL_ACCESS_REVOKED`

**In send-worker:** `getUserCtx` catches and returns `null` → `failJob("gmail_disconnected")` → dead-letter immediately.

**In inbox-agent:** `getAccessToken` throws → `if (!tok) continue` → skips that user's emails.

✅ **Safe.** Token deleted, profile marked, no further attempts. User must re-consent.

---

### 4. OAuth revoked

Same as #3. `invalid_grant` from Google means revoked. Identical handling.

✅ **Safe.**

---

### 5. AI provider fails (Groq)

**Mechanism (`groq.ts`):**
- Retries up to `max(3, keys.length * 2)` times
- Rotates API keys on each attempt
- Exponential backoff: 700ms × attempt on 429/5xx
- Throws `"AI service temporarily unavailable"` after exhaustion

**In send-worker `generateEmail`:** Throws → `failJob` → retry/dead-letter. Slot released via `release_send_slot` in catch block.

**In inbox-agent classification:** Catch stores error in `groqFail`, uses heuristic fallback (`parseClassification("", snippet)` → regex-based, 0.3 confidence → `requires_human = true` → routes to human review).

**In inbox-agent draft generation:** Catch stores error, `draft` stays empty → `AUTO_REPLY` with empty draft doesn't send (line 366: `if (decision.action === "AUTO_REPLY" && draft)`).

✅ **Safe.** AI failure degrades to human review, never to silent bad behavior.

---

### 6. AI returns malformed JSON

**Classification (`policy.ts:145-180`):** `parseClassification` tries `JSON.parse` on first `{...}` block. If it fails, falls back to regex heuristics (booking detection, unsubscribe detection, pricing questions). Returns a `Classification` with `confidence: 0.3`.

**Email generation (`send-worker:186-197`):** Tries `JSON.parse`. On failure, splits by newlines: first line → subject, rest → body. Always produces output.

**Alt subjects (`send-worker:226-236`):** Split by newlines, strip numbering. Falls back to empty array → variant B becomes variant A.

✅ **Safe.** Malformed JSON never crashes; always produces a usable fallback.

---

### 7. AI returns low confidence

**Mechanism (`inbox-agent:256-258, 577-579`):**
```typescript
if (!cls.confidence || cls.confidence < CONFIDENCE_FLOOR) {
  cls.requires_human = true;
}
```

`CONFIDENCE_FLOOR = 0.55`. Heuristic fallback scores 0.3 → always routes to human.

**Policy engine:** `requires_human: true` → `HANDOFF_TO_HUMAN` action → `ai_paused: true`, owner alert sent.

✅ **Safe.** Low confidence never triggers auto-send; always escalates to human.

---

### 8. Lead unsubscribes during queue processing

**Defense-in-depth (4 levels):**

1. **DB trigger (`assert_not_suppressed`):** `BEFORE INSERT` on `send_queue` and `emails_sent` — checks `leads.unsubscribed`, `leads.status`, and `suppressions` table. Raises exception if suppressed. This is the hard backstop.

2. **`eligibilityBlock` (send-worker:383-404):** Re-checks `lead.unsubscribed`, `lead.status`, `lead.lifecycle`, `suppressions` table before every send.

3. **`processDueFollowUps` (send-worker:546-553):** Re-checks all blocking conditions before every follow-up.

4. **`suppressLead` (inbox-agent:751-766):** Sets `unsubscribed: true`, upserts into `suppressions`, cancels pending/claimed queue jobs.

**Race window:** Lead unsubscribes via link → `suppressLead` runs → cancel pending jobs. Meanwhile, worker claims a job just before the cancel. Worker enters `processJob` → `eligibilityBlock` re-checks → finds `lead.unsubscribed = true` → returns `"lead_unsubscribed"` → job cancelled.

**Edge case:** If `eligibilityBlock` passes but the DB trigger fires on `emails_sent` insert → exception → `failJob` → dead-letter after 4 attempts. No email sent.

✅ **Safe.** 4 overlapping defense layers. Race windows are caught by at least one layer.

---

### 9. Lead replies while follow-up is queued

**Mechanism:**
- `processDueFollowUps` query: `.eq("replied", false)` — only picks up emails where no reply detected yet.
- Inbox-agent marks `replied: true` when it detects a reply (line 220).

**Race window:** Inbox-agent marks `replied: true` → follow-up query already fetched the row → follow-up tries to send.

**In practice:** The follow-up checks `lead.conv_mode` and `lead.lifecycle`. If the reply triggered a policy action (e.g., `HANDOFF_TO_HUMAN`), `conv_mode` becomes `PAUSED` → follow-up checks `(lead.conv_mode ?? "AI_AUTOPILOT") === "HUMAN"` → cancels.

**If reply was classified as "MAYBE" (no mode change):** Follow-up could still send. This is arguably correct — the lead's reply was non-committal, a gentle follow-up is reasonable.

✅ **Mostly safe.** Minor edge case where a follow-up might send after a non-committal reply, but this is defensible behavior.

---

### 10. Bounce arrives while follow-up is queued

**Mechanism:**
- Bounce sweep (inbox-agent:151-196) scans for `mailer-daemon`/`postmaster` DSNs.
- Sets `lead.status: "bounced", lifecycle: "BOUNCED"`.
- Cancels pending/claimed queue jobs.

**Follow-up re-check:** `processDueFollowUps` line 547: `["unsubscribed", "bounced", "suppressed"].includes(lead.status)` → cancels.

**Race window:** Bounce sweep marks lead as bounced → follow-up query already fetched → follow-up checks → finds `lead.status === "bounced"` → cancels.

**If follow-up already sent before bounce detection:** Email goes out to dead address. Bounce will arrive later, handled by next bounce sweep. Not ideal but harmless — the address is already dead.

✅ **Safe.** Bounce detection + follow-up re-check overlap. Worst case: one extra email to a dead address.

---

### 11. Two workers claim simultaneously

**Mechanism:** `claim_queue_jobs_v2` uses `FOR UPDATE SKIP LOCKED`. Worker A locks row → Worker B skips it → gets different rows (or none).

**If both somehow claim the same job (shouldn't happen with SKIP LOCKED):**
- Idempotency check at `send-worker:418-423` finds existing `emails_sent` row → marks job as `sent` → skips.
- Unique index `uniq_queue_job` on `(campaign_id, lead_id) WHERE status IN ('pending','claimed','processing')` prevents duplicate live jobs.

✅ **Safe.** `SKIP LOCKED` + unique index + idempotency check = triple protection.

---

### 12. Retry occurs

**Mechanism:** `failJob` → `status: "failed"` + `next_retry_at` with exponential backoff: `min(60min, 2^attempts × 5min)`.

| Attempt | Backoff |
|---|---|
| 1 | 10 min |
| 2 | 20 min |
| 3 | 40 min |
| 4+ | Dead-letter |

**Re-claim condition:** `status = 'failed' AND next_retry_at <= now()`.

**Hot-loop fix:** `next_retry_at` is checked — jobs with future retry times are NOT reclaimed.

✅ **Safe.** Exponential backoff prevents hammering. Dead-letter after 4 attempts.

---

### 13. Lease expires

**Mechanism:** `claim_queue_jobs_v2` re-claims jobs where `status IN ('claimed','processing') AND lease_until < now()`. Default lease: 10 minutes.

**If worker is slow (processing > 10 min):** Lease expires → another worker re-claims → processes again.

**Protection:** Idempotency check (existing `emails_sent` row) prevents double-send in most cases. Except BUG #1 (phantom-send).

⚠️ **Mostly safe.** BUG #1 is the exception — a phantom row from a slow worker's failed send would cause the re-claiming worker to skip the job.

---

### 14. Daily cap is reached

**Mechanism:** `reserve_send_slot` RPC atomically checks and increments `emails_sent_today`. Returns `false` if at cap.

**In send-worker main loop:** `if (!reserved)` → defers job 1 hour (`next_retry_at = now + 1hr`). Sets `ctx.exhausted = true` → all subsequent jobs for that user in this run are deferred without attempting reservation.

**In follow-ups:** `if (!reserved)` → defers follow-up 1 hour (`follow_up_at = now + 1hr`).

**Cap calculation:** `min(planLimit, 5 + daysWarm × 5, gmailTypeCap)` — warm-up ramp.

✅ **Safe.** Atomic reservation prevents over-sending. Deferral prevents job loss.

---

### 15. Human takes over

**Mechanism:** Owner sends manual reply → inbox-agent detects it (line 503-517) → sets `ai_paused: true`, `conv_mode: "HUMAN"`, lifecycle to `HUMAN_TAKEOVER`.

**Protection:**
- `processJob` eligibility: `(lead.conv_mode ?? "AI_AUTOPILOT") === "HUMAN"` → blocks.
- `processDueFollowUps`: Same check → cancels follow-up.
- Policy engine: `conv_mode === "HUMAN"` → `DO_NOTHING` (except booking still notifies).
- DB trigger: Doesn't block on `HUMAN` mode (only on suppressed), but the code checks before insert.

✅ **Safe.** Human takeover immediately stops all AI activity on that thread.

---

### 16. Duplicate webhook/message is received

| Webhook | Duplicate handling |
|---|---|
| **Billing (Lemon Squeezy)** | HMAC verified. Same event re-applies same plan update (idempotent `.update()`). No harm. ✅ |
| **Unsubscribe link** | `unsubscribed: true` is idempotent. `suppressions` upsert with `onConflict`. Queue cancel is idempotent. ✅ |
| **Gmail message (same reply)** | `ai_classifications` unique constraint on `message_id` → duplicate insert rejected → `last_lead_msg_at` updated → skips. ✅ |
| **Queue job (same campaign+lead)** | `uniq_queue_job` partial unique index blocks duplicate live jobs. ✅ |
| **Cron trigger (overlapping runs)** | `FOR UPDATE SKIP locked` prevents double-claim. ✅ |

✅ **Safe.** All entry points are idempotent or deduplicated.

---

## Bug Summary

| # | Severity | Bug | Location | Impact |
|---|---|---|---|---|
| 1 | **CRITICAL** | Phantom-send: `emails_sent` row inserted before Gmail send; on failure + retry, idempotency check finds phantom row and marks as "sent" | `send-worker/index.ts:482-508` | Email permanently lost, follow-ups may fire for undelivered email |
| 2 | **MEDIUM** | Booking self-serve path doesn't increment `ai_turns`; lead can trigger unlimited AI replies if they keep messaging | `inbox-agent/index.ts:654-656` | Reply loop: lead sends many messages → AI replies to each → no turn limit enforced |
| 3 | **MEDIUM** | Follow-up step 3 can be orphaned: if step 2 follow-up is cancelled (lead replied, campaign paused), step 3 placeholder remains with `follow_up_sent: false` | `send-worker/index.ts:625-630` | Stale follow-up sends days later to a lead who already replied |

---

## Recommended Fixes

### BUG #1 (CRITICAL): Move `emails_sent` insert AFTER Gmail send

**Current flow:**
```
1. INSERT emails_sent (no gmail_message_id)
2. sendGmailRaw() → FAIL
3. Retry → idempotency finds row → marks sent → LOST
```

**Fixed flow:**
```
1. sendGmailRaw() → SUCCESS (get ids)
2. INSERT emails_sent (with gmail_message_id)
3. On failure → no row exists → clean retry
```

The challenge: `buildRawEmail` needs the tracking pixel URL which needs the `emailRow.id`. Two options:
- **Option A:** Insert a minimal row (no pixel), send, then update with pixel URL. Complex.
- **Option B:** Generate a deterministic tracking ID (e.g., UUID) before insert, use it in pixel, insert row + send atomically. Cleanest.
- **Option C:** Remove tracking pixel from first-touch emails (use `emailThread` tracking instead). Simplest but loses open tracking.

### BUG #2 (MEDIUM): Increment `ai_turns` in booking self-serve path

Add `ai_turns: (t.ai_turns ?? 0) + 1` to the update at line 655.

### BUG #3 (MEDIUM): Cancel orphaned step 3 when step 2 is cancelled

In `processDueFollowUps`, when cancelling a follow-up, also cancel any pending step 3 for the same (campaign_id, lead_id).
