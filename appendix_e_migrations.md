# Appendix E — Migration map (88 forward migrations + 17 rollback files)

Two numbers matter and they are usually conflated.

| Count | Meaning |
|---|---|
| **88** | Forward migrations that create or change production objects |
| **17** | Paired rollback files, kept in `supabase/rollbacks/` and **never applied in production** |
| **105** | Total forward + rollback `.sql` files |

### Provenance note

The ledger was repaired on **17 November 2026**. All **88** forward migrations are now recorded in `supabase_migrations.schema_migrations`, and `supabase db push --dry-run` reports the remote database is up to date.

Before the repair, only **49** rows were recorded and the ledger stopped on 29 August 2026; migrations after that (September–November: learning, cost gate, health, agent, plan limits, anti-abuse, admin console, developer API) had been applied through the **Management API** (`POST /v1/projects/{ref}/database/query`) without CLI tracking. Every missing migration's objects were verified against the live schema before its version was marked applied.

### Forward migrations

| # | Migration | What it introduced |
|---|---|---|
| 1 | `20260601010730_0f1f8d20-c04f-4426-aa7b-77bbb805e6f7.sql` | Profiles |
| 2 | `20260601010800_a92a3827-56fd-4afa-b24c-991b30c837c2.sql` | Revokes public EXECUTE on `handle_new_user()` — the trigger that creates a profile row must not be callable by clients. |
| 3 | `20260614000001_add_sending_limits.sql` | Add Gmail token columns to profiles |
| 4 | `20260822000002_add_unsubscribed.sql` | Adds `leads.unsubscribed` (NOT NULL default false) — the first per-lead opt-out flag. |
| 5 | `20260823000003_performance_indexes.sql` | Production performance indexes: every query filters by user_id via RLS |
| 6 | `20260823000004_secure_tokens_and_ai_quota.sql` | M1: move Gmail OAuth tokens out of profiles into a service-role-only vault |
| 7 | `20260823000005_referral_and_stats.sql` | Viral growth: referral tracking + public aggregate stats |
| 8 | `20260823000006_automation_upgrades.sql` | Automation upgrades: booking links, reply sentiment, daily digest |
| 9 | `20260823000007_autopilot.sql` | Autopilot: the cron robot finds leads and sends on the user's behalf |
| 10 | `20260823000008_stats_replies.sql` | Rewrites `public_stats()` to expose emails sent, agents, and replies detected. |
| 11 | `20260823000009_tools_rate_limit.sql` | No policies: denied for everyone except service_role (used by the tools function) |
| 12 | `20260823000010_lock_quota_rpc.sql` | consume_ai_quota is an internal function used by edge functions with the service role key. It must never be callable by anon/authenticated/PUBLIC, otherwise anyone can burn another user's AI quota by … |
| 13 | `20260824000001_email_ai_draft.sql` | Adds `emails_sent.ai_draft` — the generated body is kept next to what was actually sent. |
| 14 | `20260824120000_profile_signature.sql` | Adds `profiles.signature` — the footer appended to every outbound email. |
| 15 | `20260824130000_true_free_tier.sql` | Sets the default plan to `free`. The free tier stops being an exception and becomes the starting state. |
| 16 | `20260824140000_ab_autopilot.sql` | Adds `campaigns.ab_test`, `campaigns.autopilot`, `emails_sent.variant`, `emails_sent.autoreplied` — the A/B and autopilot foundations. |
| 17 | `20260824150000_send_queue.sql` | Send queue: decouples Launch click from actual sending. |
| 18 | `20260824160000_referrals_table.sql` | Creates `referrals` (pending | joined | rewarded) — the first viral growth loop. |
| 19 | `20260824170000_schedule_followup_cron.sql` | Schedule the follow-up agent (reply detection, follow-ups, autopilot, digests) |
| 20 | `20260824180000_reset_test_lead_suppression.sql` | Test-lead reset: un-suppress outreachai.team@gmail.com so live reply-detection testing can continue (lead was suppressed during unsubscribe-flow verification) |
| 21 | `20260824181000_reset_test_lead_again.sql` | Second test-lead reset (Gmail one-click retries likely re-suppressed it) |
| 22 | `20260824190000_conversation_mode.sql` | Conversation Mode: multi-turn AI thread handling |
| 23 | `20260824200000_lead_cap_trigger.sql` | Server-side enforcement of per-plan lead storage caps. UI caps were client-only; this trigger closes the direct-API hole. |
| 24 | `20260824210000_uniq_leads_email.sql` | Server-side duplicate-lead protection (case-insensitive per user) |
| 25 | `20260824220000_prod_architecture.sql` | ============================================================ PRODUCTION ARCHITECTURE HARDENING Multi-tenant-safe, concurrency-safe, auditable, policy-enforced =========================================… |
| 26 | `20260824230000_hardening_pass.sql` | ============================================================ PRODUCTION HARDENING PASS (post-audit fixes) ============================================================ |
| 27 | `20260825040000_profile_website_url.sql` | Owner website/app URL: when set, the AI answers prospect queries using the site's content as a knowledge base and funnels leads to this URL instead of only offering a booking link. Owners without a si… |
| 28 | `20260825050000_phase1_business_intelligence.sql` | Phase 1: Onboarding / Business Intelligence Adds structured business config columns to profiles. Existing offer, website_url, booking_link, signature are kept as-is. |
| 29 | `20260825060000_uniq_emails_first.sql` | UNIQUE CONSTRAINT for first-touch emails: prevents duplicate sends in lease-expiry race. The existing uniq_emails_step only covers sequence >= 2 (follow-ups). This closes the gap where two workers cou… |
| 30 | `20260825070000_alerts_kind_review.sql` | Add 'review' to owner_alerts CHECK constraint. Code uses kind='review' for autoresponder detection and reply-loop guard. Previously blocked by the constraint — these alerts were silently lost. |
| 31 | `20260825080000_cleanup_and_indexes.sql` | ============================================================ DATABASE CLEANUP — Part 5 audit findings ============================================================ |
| 32 | `20260826100000_lead_discovery_columns.sql` | Phase 1: Lead Discovery Engine — add category, place_id, source columns These fields store the business metadata from Google Maps / OSM discovery. |
| 33 | `20260826110000_email_verification_columns.sql` | Phase 2: Email verification columns on leads table Adds verification state so it persists after discovery |
| 34 | `20260826120000_lead_detail_columns.sql` | Phase 3: Add missing lead detail columns city, phone, address, website, rating — returned by find-leads but not persisted |
| 35 | `20260826130000_campaign_image_and_storage.sql` | Phase 4A: Campaign launch & approval support Add image column and campaign summary fields |
| 36 | `20260826140000_security_and_followup.sql` | ============================================================ SECURITY + FOLLOW-UP HARDENING ============================================================ |
| 37 | `20260827100000_followup_engine.sql` | ============================================================ PHASE 1: COMPLETE LONG-TERM FOLLOW-UP ENGINE ============================================================ 1. Fix follow_up_sequences timing… |
| 38 | `20260827110000_website_enrichment.sql` | Website email enrichment provenance columns Tracks where a lead's email was discovered from |
| 39 | `20260828120000_profile_phone.sql` | Phase 3: Add owner phone number shown to clients when the AI hands off (escalation replies offer a direct call to the owner). |
| 40 | `20260828140000_campaign_delivery.sql` | Phase 3: Per-campaign delivery preference. 'smart' (default) = send only during each lead's local business morning (8-11am); 'instant' = bypass the morning gate and send as soon as the campaign is lau… |
| 41 | `20260828160000_network_intros.sql` | Phase 3: Warm B2B network. profile.network_mode: opt-in "discoverable by other businesses". intro_requests: double opt-in intros between platform users (no contact exposure pre-accept). |
| 42 | `20260828170000_referral_rewards.sql` | Phase 3: Referral reward — referrer earns 7 free days of starter when a friend joins via their link. Effective plan is resolved at runtime (referral_reward_plan while active, otherwise subscription pl… |
| 43 | `20260828180000_owner_alerts_kinds.sql` | Phase 3: extend owner_alerts kind whitelist for new features added in 2026-08-28: network intros (network_intro / accepted / rejected) + referral rewards. |
| 44 | `20260828190000_ai_classification_reason.sql` | AI upgrade #2: classifier evidence. Every ai_classifications row should carry a one-line human-readable reason showing WHY the AI labeled it that way. |
| 45 | `20260829170000_support_chat.sql` | AI upgrade #5: persistent, account-aware support chat. Threads persist server-side so conversations survive across devices and the assistant can answer with the user's REAL account numbers (plan, usag… |
| 46 | `20260829190000_push_notifications.sql` | Push notifications: device subscriptions + a drain queue filled by a trigger on owner_alerts (high/medium only). The push-drainer edge function (scheduled via pg_cron) sends every queued alert to the … |
| 47 | `20260908000001_sender_health.sql` | 0a: mailbox connection anchor + deterministic sender-health reputation feedback. The intelligence layer stays advisory: every consumer falls back to today's ramp formula when this ledger has no (or st… |
| 48 | `20260908000002_agent_config.sql` | ============================================================ agent_config (Workstream 0b / design doc 2.5) Generic key/value config store for inbox-agent judgment knobs. Scope resolution: glob -> user… |
| 49 | `20260908000003_audit_events_decision_trail.sql` | ============================================================ audit_events decision attribution (Workstream 1 / design 2.1) Adds the attribution prerequisite for the learning loop. Nullable + additive:… |
| 50 | `20260908000004_intelligence_tables.sql` | ############################################################################# Stage 4: intelligence-layer state (lead_score / campaign_learning / strategy_state) + hourly learning-loop cron (the singl… |
| 51 | `20260908000006_queue_priority.sql` | Stage 6: advisory queue priority — ORDER-axis only. Contract (INTELLIGENCE-LAYER-DESIGN.md §2.2/§3): a fresh lead_score may move a job EARLIER within the claimable band; stale/missing => priority 0.5 … |
| 52 | `20260909000001_ai_cost_meter.sql` | Stage 7 (diff 1): metered AI spend. Contract (INTELLIGENCE-LAYER-DESIGN.md §6.1/§6.3): every LLM call in the system crosses _shared/groq.ts groqChat(), which captures response usage and writes ONE row… |
| 53 | `20260909000002_ai_cost_gate.sql` | Stage 7 (diff 2): the durable AI-cost gate. Contract (INTELLIGENCE-LAYER-DESIGN.md §6.3/§6.6): the HARD ceiling runs on an atomic reservation-debit, not on ledger SUM. Every gated LLM call debits ai_c… |
| 54 | `20260909000003_agent_config_writer.sql` | Stage 7 fix: agent_config uses PARTIAL unique indexes (glob_uq on (key) where scope='glob'; scoped_uq on (key,scope,scope_id) where scope in user/campaign), so PostgREST's insert-...-onConflict cannot… |
| 55 | `20260909000004_delete_account_erasure.sql` | Stage 8 hotfix (standalone, ships ahead of the Stage 8 memory work): close the delete-account erasure gaps found in the erasure-surface audit. 1. ai_spend_ledger.user_id was ON DELETE SET NULL on prof… |
| 56 | `20260909000005_stage8_memory.sql` | ############################################################################# Stage 8: conversation memory + erasure-by-design (INTELLIGENCE-LAYER-DESIGN.md §8) Adds: * thread_memory — facts-only conv… |
| 57 | `20260910000001_health_check.sql` | ============================================================ STAGE 9 — HOURLY HEALTH-CHECK (infra watchdog) Reuse, don't rebuild: * owner_alerts -> trg_alerts_to_push -> push_queue -> push-drainer is … |
| 58 | `20260910000002_health_cron_evidence.sql` | ============================================================ STAGE 9 — CRON OUTCOME EVIDENCE RPC Upgrade the cron probe from "did pg_cron DISPATCH?" (job_run_details, which records 'succeeded' for net… |
| 59 | `20260910000010_ai_cost_guest_gate.sql` | Stage: guest AI-cost gate for the public support-chat widget. Contract: mirrors 20260909000002_ai_cost_gate.sql exactly, but for the support- chat VISITOR bucket. ai_cost_state.profile_id has an FK to… |
| 60 | `20260912000000_followup_sendwindow_hardening.sql` | ============================================================ FOLLOW-UP SEND-WINDOW HARDENING (audit-2026-09-12) ============================================================ The reply-cancel trigger on… |
| 61 | `20260912120000_followup_default_sequence.sql` | ============================================================ Default follow-up sequence: 4 touches over 3 weeks (day 3,7,14,21) ============================================================ Replaces th… |
| 62 | `20260913000000_meetings_growth.sql` | ============================================================ MEETINGS GROWTH — webhook-confirmed real bookings (Calendly, phase 1) The meetings table was schema-only and never written. This adds the f… |
| 63 | `20260928060000_razorpay_payments.sql` | ============================================================ RAZORPAY PAYMENTS — order + payment ledger for the checkout flow. The previous processor only wrote profiles.plan and kept no transaction r… |
| 64 | `20260929120000_agent_action_state.sql` | Assistant action budget: per-message and per-conversation step counters. ai-cost_state already caps AI SPEND. It cannot cap STEPS -- a loop of cheap actions never trips a dollar budget. These counters… |
| 65 | `20260929130000_agent_conversations.sql` | ============================================================================ Agent chat: conversation history + the intent cache. The cache is the reason a repeated request costs nothing. The first ti… |
| 66 | `20260929140000_agent_confirm_single_use.sql` | Makes a confirmation single-use. Bug found by scripts/.stage8/prove-agent-live.mjs: the write branch returned "pending" BEFORE persisting the user message, so the follow-up "yes" could not find the in… |
| 67 | `20260929150000_agent_learned_phrases.sql` | ============================================================================ Learned vocabulary: the fast lane. The agent already understands meaning on the slow lane (one model call per new phrasing)… |
| 68 | `20260929160000_agent_conversation_recency.sql` | Conversation titles + updated_at so the UI can show a real chat list ordered by recency of the LAST message, not the date the chat was opened. Why updated_at and not created_at: a chat started last mo… |
| 69 | `20260929160001_agent_pending_state.sql` | Pending slot state: remember what we were trying to do when we asked. When the agent asks "Which campaign should I add them to?", it must carry the partial params (e.g. city/company/query) and the int… |
| 70 | `20260929160002_agent_pending_state_rls.sql` | Fix: the pending-state table was created with FORCE ROW LEVEL SECURITY. FORCE applies RLS to the table owner too, which silently blocked the edge function's service-role writes. Every clarifying quest… |
| 71 | `20260929170000_agent_profile.sql` | Persistent business context the agent acquires by listening. The agent could hold a pending clarification for 15 minutes, but it forgot everything else. Someone would describe their business in real d… |
| 72 | `20261009000001_plan_limits.sql` | Plan limits: one source of truth for what each plan allows, plus server-side enforcement so no client or agent can exceed it. daily_emails : emails a user may send per day (enforced in send-worker via… |
| 73 | `20261011000001_website_crawl.sql` | Website email backfill for the shared map. saved_businesses is our permanent, shared "our own map". Rows that a search found with a website but no email are never enriched after the fact, so the map k… |
| 74 | `20261011000002_search_usage.sql` | Google Places search budget: one true daily counter for every live Google Maps search the whole app makes, so the background "leftover quota" workers can spend whatever the day's user traffic did NOT … |
| 75 | `20261030000001_opener_learning.sql` | Opener learning: record which attention angle produced each email. send-worker has always picked one of seven opening angles per lead by hashing name+company+title, so a natural experiment has been ru… |
| 76 | `20261030000002_reply_style_learning.sql` | Reply-style learning: the same record -> measure -> act loop as openers. The reply prompt used to be one fixed instruction string, so no outcome could be attributed to a "shape". inbox-agent now picks… |
| 77 | `20261101000001_anti_abuse_mvp.sql` | ============================================================ ANTI-ABUSE MVP 1. Free tier becomes a LIFETIME cap (50 emails ever, 10/day) so farming accounts stops paying: N accounts buys N x 50 emails… |
| 78 | `20261101000002_send_requires_identity.sql` | ============================================================ ANTI-ABUSE MVP — part 2: business identity is required to SEND Why a second migration instead of editing part 1: part 1 is already applied … |
| 79 | `20261101000003_guard_protected_profile_cols.sql` | ============================================================ ANTI-ABUSE MVP — part 3: protected profile columns Found while building the UI: the "own profile update" RLS policy is `USING (auth.uid() =… |
| 80 | `20261101000004_send_block_reason_scoped.sql` | ============================================================ ANTI-ABUSE MVP — part 4: send_block_reason keeps to the caller's own account The function takes a user id so the server (send-worker, servi… |
| 81 | `20261101000005_require_street_address.sql` | ============================================================ ANTI-ABUSE MVP — part 5: the address must actually be an address "India", "United States" and "London" were accepted, because the only rule… |
| 82 | `20261101000006_compat_block_reason.sql` | ============================================================ ANTI-ABUSE MVP — part 6: keep the reason string compatible The database change in part 5 shipped before the frontend did (Vercel deploys on… |
| 83 | `20261101000007_restore_address_reason.sql` | ============================================================ ANTI-ABUSE MVP — part 7: restore the specific address reason Part 6 deliberately reported 'business_identity_required' for a bad address be… |
| 84 | `20261103000001_admin_console.sql` | ============================================================ ADMIN CONSOLE — part 1 of 2: who is an admin, and the read model Until now the anti-abuse tables (signup_signals, admin-free) had no reader… |
| 85 | `20261110000001_demo_rate_limit.sql` | Public demo rate limiting: one row per demo request, service-role only, RLS with no client policy. |
| 86 | `20261110000002_review_mode.sql` | Review-each-email mode: a new account drafts its first emails and holds them before anything leaves the mailbox. |
| 87 | `20261111000001_review_first5.sql` | The review period is the first 5 emails, not 20; moves stored values and the default without adding a constraint. |
| 88 | `20261112000001_developer_api.sql` | Developer surface: API keys, webhook endpoints, durable delivery outbox, per-account rules and per-campaign tone. |

### Rollback files (kept, not applied)

| # | File | Rolls back |
|---|---|---|
| 1 | `20260908000001_sender_health.rollback.sql` | `20260908000001_sender_health.sql` |
| 2 | `20260908000002_agent_config.rollback.sql` | `20260908000002_agent_config.sql` |
| 3 | `20260908000003_audit_events_decision_trail.rollback.sql` | `20260908000003_audit_events_decision_trail.sql` |
| 4 | `20260908000004_intelligence_tables.rollback.sql` | `20260908000004_intelligence_tables.sql` |
| 5 | `20260909000001_ai_cost_meter.rollback.sql` | `20260909000001_ai_cost_meter.sql` |
| 6 | `20260909000002_ai_cost_gate.rollback.sql` | `20260909000002_ai_cost_gate.sql` |
| 7 | `20260909000004_delete_account_erasure.rollback.sql` | `20260909000004_delete_account_erasure.sql` |
| 8 | `20260909000005_stage8_memory.rollback.sql` | `20260909000005_stage8_memory.sql` |
| 9 | `20260910000001_health_check.rollback.sql` | `20260910000001_health_check.sql` |
| 10 | `20260910000002_health_cron_evidence.rollback.sql` | `20260910000002_health_cron_evidence.sql` |
| 11 | `20260929120000_agent_action_state.rollback.sql` | `20260929120000_agent_action_state.sql` |
| 12 | `20260929130000_agent_conversations.rollback.sql` | `20260929130000_agent_conversations.sql` |
| 13 | `20260929140000_agent_confirm_single_use.rollback.sql` | `20260929140000_agent_confirm_single_use.sql` |
| 14 | `20260929150000_agent_learned_phrases.rollback.sql` | `20260929150000_agent_learned_phrases.sql` |
| 15 | `20261009000001_plan_limits.rollback.sql` | `20261009000001_plan_limits.sql` |
| 16 | `20261011000001_website_crawl.rollback.sql` | `20261011000001_website_crawl.sql` |
| 17 | `20261011000002_search_usage.rollback.sql` | `20261011000002_search_usage.sql` |
