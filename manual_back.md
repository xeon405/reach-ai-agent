---

## V. Live measured state

Read from the production database on 3 November 2026.

| Metric | Value | Reading |
|---|---|---|
| Accounts | 26 | pre-launch |
| Emails sent all time | 6 | 5 marked replied — own test replies |
| Leads | 16 | mostly test data |
| Meetings | 0 | no real booking yet |
| `campaign_learning` rows | 3 | folds ran, no winning hints |
| `opener_performance` rows | 0 | no tagged sends |
| `reply_style_performance` rows | 0 | no tagged conversations |
| Tagged sends | `variant` 6/6, `opener_key` 0/6, `reply_style` 0/6 | old rows predate tagging |
| `lead_score` rows | 6 | tiers A/B/C |
| `saved_businesses` | 6,745 | the shared map has real value already |
| Admin accounts | 2 | operator only |
| Payments | 10 created, 0 captured | checkout never completed |
| Cron jobs | 10 active, all last runs succeeded | |
| `audit_events` | 179,213 | append-only history |

Two conclusions that must be stated plainly:

1. **The learning engine has no eligible data.** It is correct and wired, but the sample is zero because all six sends predate the tagging columns. It needs roughly 50 real sends in one campaign before the first hint publishes.
2. **Billing is blocked on credentials.** Ten orders were created historically; none captured. The immediate failure is Razorpay's 401, not our code.

---

## VI. Incident log (verified)

These are real defects found and fixed, each visible in a migration or code comment. They matter because they show where the design was wrong, not just what it does now.

| Date | Defect | Impact | Fix |
|---|---|---|---|
| 2026-08-25 | Two workers could both pass the first-touch idempotency check | Duplicate first email | Partial unique index on first-touch (`20260825060000`) |
| 2026-08-25 | `owner_alerts` CHECK rejected `kind='review'` | Autoresponder alerts silently lost | Constraint extended (`20260825070000`) |
| 2026-09-09 | `reputation-nightly` dispatch reported success but the function never ran | Reputation brake blind for a night | Execution markers + evidence RPC (`20260910000002`) |
| 2026-09-12 | Reply-cancel trigger only matched `followup_status='active'` | Reply could arrive while a follow-up was `sending`; follow-up still went out | Trigger covers `sending` (`20260912000000`) |
| 2026-09-29 | Confirmation returned "pending" before persisting the user message | A "yes" could not find the intent it was confirming | Persist first + single-use marker (`20260929140000`) |
| 2026-09-29 | `agent_pending_state` created with FORCE RLS | Service-role writes silently failed; every clarifying question was forgotten | RLS corrected (`20260929160002`) |
| 2026-11-01 | RLS let a user PATCH `domain_verified: true` on their own row | The entire duplicate-business rule was decoration | `guard_protected_profile_cols()` (`20261101000003`) |
| 2026-11-01 | "India", "United States", "London" passed as addresses | Meaningless sender identity | Street-level predicate (`20261101000005`) |
| 2026-11-01 | `send_block_reason` accepted any user id from an authenticated caller | One user could probe another's limits | Caller scoping (`20261101000004`) |
| 2026-11-01 | New reason string shipped before the frontend had copy for it | Blank error banner | Compatibility shim, then restore (`2026...06`, `...07`) |
| 2026-11-03 | `domain-verify` counted the caller's own verified domain as "taken" | Legitimate owner told their own domain was unavailable | `.neq("user_id", userId)` |
| 2026-11-03 | Early `verified:true` paths did not clear `domain_required` | Verification succeeded but the account stayed blocked | Clear the flag on every return path |
| 2026-11-03 | Razorpay order creation fails | Checkout cannot start | **Open** — 401 from Razorpay, credentials |

The pattern is consistent: most defects were **authorization or state-ordering** bugs, not algorithmic ones. That is expected in a system where the database is the enforcement layer.

---

## VII. What is tested, and how

| Type | Count | What it covers |
|---|---|---|
| Node harnesses (`scripts/**/*.test.mjs`, `.stage8/`) | **22** | Agent router, policy engine, health state machine, sender health, learning gates, address parity, erasure, cost meter |
| SQL parity | 24/24 | `is_plausible_business_address` SQL ↔ `src/lib/address.ts` across country-only, city-only, whitespace, digit, street-word and neighbour cases |
| Simulation | `scripts/stage4-simulation.mjs` | Fold logic against synthetic data at the exact shipped constants |
| Live probes | `scripts/.ops/` | Domain verify end-to-end on the real domain, admin 200/403, cron evidence, payment probe |

Pure modules exist specifically so the tests execute **the shipped code**, not a copy: `agent-router.ts` has no imports or Deno globals, `health-engine.ts` has no DB, `sender-health.ts` is a pure state machine, and `intelligence-reads.ts` takes a structural `db`.

What is **not** covered: no browser E2E suite, no load test, no chaos test, and no automated test for the Razorpay webhook signature path.

---

## VIII. Gaps, risks, and next steps

### Correctness

1. **No lease-based quota reservation.** A crash between reserve and send loses one email. Fix: `send_reservations` with expiry and a sweeper.
2. **Bounce handling is rate-based.** A single hard bounce suppresses the address but does not pause the mailbox. Defensible, but should be stated in the product docs.
3. **No real spam-complaint feed.** Unsubscribe rate is the proxy. At scale a feedback loop is required.
4. **`audit_events` will need partitioning** by month before it reaches tens of millions of rows.

### Learning

5. **Per-campaign only.** Small accounts learn slowly. A pooled consumer of `strategy_state` is the next step, once cell floors can be met.
6. **Zero eligible rows today.** This is a data problem, not a code problem.
7. **Body copy does not learn.** Only opener, subject, sequence length, and reply shape.

### Product

8. **Payments blocked** on Razorpay credentials.
9. **Two live accounts lack a valid street address**; one (`Saminfo`) is blocked with `business_address_incomplete`.
10. **No system mailer**, so password reset and domain proof rely on DNS or the user's own mailbox.

### Operational

11. **Single-region Supabase project.** No disaster-recovery drill has been run.
12. **Secrets rotation** is manual; there is no automated rotation or expiry alert.
13. **No status-page automation** beyond `public_stats` / `health-check`.
14. **Migration history is repaired.** `schema_migrations` now records all 88 forward migrations, and `supabase db push --dry-run` reports the remote database is up to date. Rollback files moved to `supabase/rollbacks/` so the CLI no longer sees duplicate versions.

### What I would fix first, in order

1. Rotate the Razorpay key pair, verify a USD order, register the webhook, capture one real payment.
2. Run one real campaign with 50–100 leads in a single campaign — the only way the learning layer produces anything.
3. Add the reservation lease, so a crash cannot consume a customer's quota.
4. Add auth tests for `domain-verify`, `admin_clear_flag`, and the Razorpay webhook.
5. Partition `audit_events` before growth, not after.

---

## IX. Glossary

| Term | Meaning |
|---|---|
| **Choke point** | The single function every send must pass through (`reserve_send_slot`) |
| **Opener angle** | One of seven attention angles the AI is told to lead with |
| **Reply shape** | One of three reply structures: answer-first, detail-first, question-first |
| **Fold** | A scheduled aggregation that turns raw outcomes into learned state |
| **Gate** | A minimum sample/lift threshold that must be cleared before a hint publishes |
| **Hint** | Advisory text read by a sender; missing hint means default behaviour |
| **Kill switch** | A scoped `agent_config` row that disables a consumer |
| **Warm cap** | The ramp ceiling for a newly connected mailbox |
| **Recovery** | The reduced-cap state entered after a reputation breach |
| **Suppression** | A permanent per-address block, stronger than a lead flag |
| **Signal** | A device/IP observation recorded at signup; never blocks |
| **Fast lane / slow lane** | Deterministic router vs LLM fallback in the agent |
| **Fail-closed** | On uncertainty, refuse the action (safety path) |
| **Fail-safe** | On uncertainty, use the safe default (intelligence path) |

---

## X. Where everything lives

| Path | Contents |
|---|---|
| `src/routes/` | 33 TanStack Start routes |
| `src/integrations/supabase/` | Generated DB types and client |
| `src/lib/` | Address rules, shared client utilities |
| `supabase/functions/` | 36 Edge Functions + 40 shared modules |
| `supabase/migrations/` | 88 forward migrations, append-only |
| `supabase/rollbacks/` | 17 rollback files, never applied to production |
| `scripts/.ops/` | Live probes, preflight checks, deno check config |
| `scripts/.stage8/` | Agent and erasure proofs |
| `scripts/stage4-simulation.mjs` | Learning-gate simulation |
| `ARCHITECTURE.md` | The short architecture brief |
| `SYSTEM-MANUAL.md` | This document |
| `AUDIT-*.md`, `*-AUDIT.md` | Historical audit reports |
| `INTELLIGENCE-LAYER-DESIGN.md` | The design doc the learning layer implements |

---

## Closing note

OutshipAi is a small system with an unusually strict spine. The parts that look over-engineered — the single SQL choke point, the sticky duplicate flag, the DNS proof, the unequally gated learners, the reservation-based AI budget — exist because the simpler versions of each were tried and failed in ways documented in Section VI.

The honest summary for a reviewer:

> The safety and correctness layer is production-grade. The learning layer is production-grade but data-starved. The billing layer is built and blocked on a credential. The product is one real campaign and one working key pair away from being able to prove itself.
