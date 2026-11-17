# OutshipAi — Complete System Manual

**From the first commit to today — every subsystem, every function, every table, every migration.**

| Field | Value |
|---|---|
| Repository | `C:\Dev\reach-ai-agent` |
| Branch / HEAD | `main` / `74701dd` |
| First commit | 22 Aug 2026 |
| Last commit | 3 Nov 2026 |
| Commits | **324** |
| Migrations | **88 forward** (+17 rollback files = 105 SQL files) |
| Edge Functions | **36** |
| Tables / columns | **51 / 499** |
| SQL functions | **43** |
| RLS policies | **34** (RLS enabled on all 51 tables) |
| Triggers | **13** |
| Views | **2** |
| Frontend routes | **33** |
| Shared modules | **40** |
| Cron jobs | **10** |
| Node test harnesses | **22** |
| Live project | `zvohdvopmvzsujktrdmu` |

---

## Contents

| Part | Section |
|---|---|
| 0 | How to read this document |
| I | What OutshipAi is |
| II | The build, day 1 → today |
| III | The system today (stack, topology, data model) |
| IV | Engines: 4.1 anti-abuse · 4.2 learning · 4.3 agent · 4.4 deliverability · 4.5 discovery · 4.6 growth · 4.7 inbox · 4.8 AI cost · 4.9 security · 4.10 operations · 4.11 billing · 4.12 support chat |
| V | Live measured state |
| VI | Incident log |
| VII | Testing |
| VIII | Gaps, risks, next steps |
| IX | Glossary |
| X | Where everything lives |
| A | Appendix: all 324 commits |
| B | Appendix: all 36 Edge Functions |
| C | Appendix: all 51 tables / 499 columns |
| D | Appendix: all 43 SQL functions |
| E | Appendix: all 88 forward migrations (+17 rollback files) |
| F | Appendix: all 33 routes |
| G | Appendix: all 39 shared modules |

---

## 0. How to read this document

This manual has two halves.

**The narrative (Parts I–IV)** explains what the system is, how it evolved, and why each engine is built the way it is. Read this if you are evaluating the product or the architecture.

**The appendices (A–G)** are the exhaustive reference. Read these if you need to verify a claim:

| Appendix | Contents |
|---|---|
| A | All 324 commits, oldest first |
| B | All 36 Edge Functions, with purpose and auth class |
| C | All 51 tables and 499 columns, with constraints |
| D | All 43 SQL functions and 2 views |
| E | All 88 forward migrations and what each introduced |
| F | All 33 frontend routes |
| G | All 40 shared modules |

### Honesty rules used in this document

1. **Verified, not assumed.** Every number was read from the live database or the repository, not from memory.
2. **Corrections are explicit.** Where the product differs from a common assumption (for example, that this is Next.js + FastAPI), the document says so.
3. **Gaps are named.** Section VIII lists what is missing, broken, or untested. A manual that only praises itself is marketing, not architecture.
4. **Live state is separated from design.** A pipeline can be correct and still have zero data. Both facts appear.

---

## I. What OutshipAi is

OutshipAi is a B2B cold-outreach platform that runs entirely on the customer's **own Gmail account**.

The product loop:

```
Discover leads → verify emails → build a campaign → AI writes each email
      → queue → send via the user's Gmail → detect replies → AI drafts replies
      → book meetings → measure → learn → change the next send
```

Three things make it different from a bulk mailer:

1. **No shared sending infrastructure.** There is no OutshipAi mail server. Every message leaves through the customer's own mailbox, so deliverability is tied to their domain reputation, not to a shared IP pool. This is why the system spends so much effort on warm-up, bounce handling, and suppression.
2. **Learning is statistical, not theatrical.** Four learners change opener angle, subject variant, follow-up length, and reply shape — but only after explicit sample-size gates. Nothing is fine-tuned, and no hint can override a safety limit.
3. **The database is the product's spine.** Quotas, queue ownership, duplicate identity, domain ownership, admin authority, and AI budgets are all enforced in Postgres. Application code cannot talk its way past them.

### Commercial shape

| Plan | Price | Daily sends | Lifetime | Leads | Campaigns |
|---|---|---|---|---|---|
| Free | $0 | 10 | **50 total** | 25 | 1 |
| Starter | $37/mo | 50 | unlimited | 250 | 1 |
| Growth | $79/mo | 200 | unlimited | 1,000 | 5 |
| Agency | $149/mo | 500 | unlimited | 5,000 | unlimited |

The free tier is a **lifetime** budget, not a daily allowance. That single decision is the core of the anti-abuse model: creating N accounts buys N × 50 emails once, instead of 10 emails every day forever.

---

## II. The build, day 1 → today

The repository has 324 commits across four months. The migrations are the most reliable chronology, because each one is dated and states its reason. The phases below follow them.

### Phase 0 — Schema seed (June 2026)

Two migrations predate the first git commit: the initial `profiles` table and Gmail sending-limit columns. They are the seed of everything that follows. The git history proper begins on **22 August 2026** with the production release.

### Phase 1 — Production release and first hardening (22–25 Aug)

174 commits land in August, most of them in this window.

- **Release**: auth, campaigns, Gmail OAuth, AI email generation, the marketing site.
- **Token vault**: Gmail OAuth tokens move out of `profiles` into `gmail_tokens`, service-role only (`20260823000004`).
- **Referrals and public stats** (`20260823000005`): the first growth loop.
- **Autopilot** (`20260823000007`): a cron robot that finds leads and sends on the owner's behalf.
- **True free tier** (`20260824130000`): the first version of the 50-email cap.
- **Send queue** (`20260824150000`): decouples the Launch click from actual sending. This is the birth of the queue architecture.
- **Conversation mode** (`20260824190000`): multi-turn AI thread handling.
- **Lead cap trigger** (`20260824200000`): server-side enforcement, because the UI cap was client-only.
- **Unique lead email** (`20260824210000`): case-insensitive duplicate protection.
- **Production architecture + hardening pass** (`20260824220000`, `20260824230000`): concurrency, audit, policy enforcement.
- **First-touch uniqueness** (`20260825060000`): closes the lease-expiry race where two workers could send the same first email.
- **Business intelligence** (`20260825050000`): structured business config on the profile — the facts the AI writer needs.

### Phase 2 — Discovery, follow-ups, and the growth loop (26–28 Aug)

- **Lead discovery** (`20260826100000`–`120000`): Google Maps / OSM metadata, email verification state, city/phone/address/website/rating.
- **Campaign images and approval** (`20260826130000`).
- **Follow-up engine** (`20260827100000`): per-lead follow-up state, campaign toggle, timing.
- **Website email enrichment** (`20260827110000`): provenance for where an email was found.
- **Delivery preference** (`20260828140000`): `smart` (each lead's local morning) vs `instant`.
- **Network intros** (`20260828160000`): double opt-in warm introductions between users.
- **Referral rewards** (`20260828170000`): 7 days of Starter, stacked and never downgrading.
- **Classifier evidence** (`20260828190000`): every AI classification carries a human-readable reason.

### Phase 3 — Support and push (29 Aug)

- **Support chat** (`20260829170000`): persistent, account-aware threads that can quote the user's real numbers.
- **Push notifications** (`20260829190000`): subscriptions plus a drain queue fed by an `owner_alerts` trigger.

### Phase 4 — The intelligence layer (8–10 Sep)

This is the architectural centre of the product.

- **Sender health** (`20260908000001`): a reputation ledger and the nightly brake.
- **`agent_config`** (`20260908000002`): scoped judgment knobs, resolution `glob → user → campaign`.
- **Audit attribution** (`20260908000003`): `decision_id`, `model_version`, `strategy_ref` on `audit_events`.
- **Intelligence tables** (`20260908000004`): `lead_score`, `campaign_learning`, `strategy_state`.
- **Queue priority** (`20260908000006`): a fresh score may move a job earlier, never raise volume.

### Phase 5 — Cost, erasure, memory, health (9–10 Sep)

- **AI spend ledger** (`20260909000001`): one row per LLM call.
- **Durable AI cost gate** (`20260909000002`): atomic reserve-then-settle.
- **Config writer RPC** (`20260909000003`): partial unique indexes need a dedicated upsert.
- **Erasure gaps** (`20260909000004`): account deletion must not leave orphaned cost history.
- **Conversation memory** (`20260909000005`): facts only, never raw transcript.
- **Health check** (`20260910000001`): five probes, hourly.
- **Cron execution markers** (`20260910000002`): the fix for the 09-09 silent failure.
- **Guest AI gate** (`20260910000010`): a global budget for anonymous support visitors.

### Phase 6 — Follow-up correctness and real meetings (12–13 Sep)

- **Send-window hardening** (`20260912000000`): the reply-cancel trigger previously missed leads in the `sending` state.
- **Default sequence** (`20260912120000`): 4 touches over 21 days, replacing a 13-step / 4-year default.
- **Meetings growth** (`20260913000000`): provider-confirmed Calendly bookings with an idempotency key.

### Phase 7 — Billing and the agent (28–29 Sep)

- **Razorpay** (`20260928060000`): order + payment ledger, because the old flow only wrote `profiles.plan` and kept no transaction record.
- **Agent action budget** (`20260929120000`): dollar budgets cannot bound a loop of cheap actions.
- **Agent conversations** (`20260929130000`): history plus the intent cache.
- **Single-use confirmation** (`20260929140000`): a "yes" must not execute twice.
- **Learned vocabulary** (`20260929150000`): the fast lane.
- **Pending state** (`20260929160001`): a clarifying question must survive the next message.
- **Agent profile** (`20260929170000`): durable business context learned by listening.

### Phase 8 — Plan limits, crawl, search budget (9–11 Oct)

- **Plan limits** (`20261009000001`): one server-side source of truth.
- **Website crawl** (`20261011000001`): backfill emails for the shared map.
- **Search budget** (`20261011000002`): one daily counter for every live Google Places search.

### Phase 9 — Learning goes live (30 Oct)

- **Opener learning** (`20261030000001`): the angle was already being chosen by hash and then discarded. Now it is recorded and measured.
- **Reply-style learning** (`20261030000002`): three reply shapes, attributed to meetings.

### Phase 10 — Anti-abuse and the operator console (1–3 Nov)

- **Lifetime cap + identity + domains + signals** (`20261101000001`).
- **Identity required at send time** (`20261101000002`).
- **Protected columns** (`20261101000003`): closes the self-elevation hole.
- **Scoped block reason** (`20261101000004`).
- **Street-level address** (`20261101000005`).
- **Compatibility shim** (`20261101000006`) and **restored specific reason** (`20261101000007`).
- **Admin console** (`20261103000001`): separate authority, audited, reversible.

Two provenance facts belong here, because they affect how the history can be audited:

1. **88 forward migrations and 17 rollback files.** The forward migrations are in `supabase/migrations/`; the rollback files are in `supabase/rollbacks/` so the Supabase CLI does not read them as duplicate migration versions, and they were never applied to production.
2. **The CLI ledger stops on 29 August 2026.** `supabase_migrations.schema_migrations` holds only 49 rows. Every migration after that date was applied through the Management API, so the repository — not the ledger — is the record of what ran. Appendix E states this in full.

The full commit list is **Appendix A**. The full migration list is **Appendix E**.
