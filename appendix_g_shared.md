# Appendix G — Shared modules (40 files in `_shared`)

These are the libraries every Edge Function imports. Most are pure (no I/O) so the Node test harness can execute the exact shipped logic.

| Module | Responsibility |
|---|---|
| `action-budget.ts` | — |
| `agent-account-context.ts` | Loads the OWNER + ACCOUNT facts for one agent turn. The agent used to start every reply knowing only what the person had typed into this chat. The support chatbot already loads a live snapsh… |
| `agent-capabilities.ts` | What the agent can actually do, described as GOALS rather than word lists. This is the single source of truth. The prompt is built from it, and the model's answer is validated back against i… |
| `agent-config.ts` | AGENT CONFIG — config-driven judgment for inbox-agent (0b). Reads per-invocation: glob -> user -> campaign (most specific wins). Emergency default: the compile-time constants below are used … |
| `agent-executor.ts` | AGENT EXECUTOR — turns a routed intent into a database read or write. Two rules hold everywhere in this file: 1. Every query is scoped by user_id. The caller passes a service-role client, so… |
| `agent-learning.ts` | The fast lane: learned vocabulary. One function answers "what did this account teach us about these words?" and another records the outcome so the next time costs nothing. The promotion rule… |
| `agent-pending.ts` | Remembering what we were in the middle of. The agent asks "Which campaign should I add them to?" and the person answers "Q3 push". Without help, that answer looks like a brand-new message: t… |
| `agent-profile.ts` | — |
| `agent-router.ts` | AGENT ROUTER — intent-first, deterministic, zero AI calls. This is the whole point of the design: a known request is a string match and a database query, not a model call. Only a request we … |
| `agent-slots.ts` | Words that are capitalised for grammar, not because they name a place. |
| `agent-understand.ts` | The slow lane: understanding. This runs ONLY when the fast lane misses, so it is allowed to be as flexible as it likes. It is deliberately permitted to do the thing the old router made impos… |
| `ai-cost-gate.ts` | AI-COST-GATE — Stage 7 request-time consumer contract. Design: INTELLIGENCE-LAYER-DESIGN.md §6.3→§6.6. Principles enforced HERE, in one place: * The hard ceiling is a DURABLE atomic reservat… |
| `ai-lib.ts` | AI-LIB — shared prompt intelligence for every AI surface. Few-shot voice examples, attention-opening playbook, lead language detection, and deterministic opener selection so a lead never rec… |
| `app-base-url.ts` | supabase/functions/_shared/app-base-url.ts — THE ONE shared frontend base URL. Every clickable link this agent can put in front of a lead (the digest's per-lead /lead-edit/{uuid}, its /leads… |
| `areas.ts` | Area intelligence for the lead finder. Curated major-metro lists per country + sampled country-level searches so results vary per demand, plus quick Google probe scoring for "best areas". |
| `audit.ts` | Audit trail: every automated action must be traceable. |
| `business-context.ts` | Business + account context for AI prompts. WHY THIS FILE EXISTS The business facts already live in `profiles` - Settings writes them for the email-writing AI (business_description, offer, pr… |
| `cors.ts` | Shared CORS config — restrict to the production frontend origin. Cron-only functions should omit CORS headers entirely (they're not called from browsers). |
| `crypto.ts` | AES-GCM encryption for OAuth credentials at rest. Key: GOOGLE_TOKEN_ENC_KEY env secret (64 hex chars = 32 bytes). Format: "v1:<iv_b64>:<ct_b64>" — legacy plaintext values pass through. |
| `effective-plan.ts` | Effective plan resolution. Referral rewards grant a temporary free upgrade ('starter') that stacks ABOVE the subscription plan and never downgrades it. |
| `email-verifier.ts` | Email verification + disposable detection — used by find-leads, send-campaign, send-worker DNS-only validation (no SMTP probes). Deno runtime. |
| `gmail.ts` | Gmail access layer: token lifecycle + raw send with ID capture. Credentials are decrypted transparently; tokens never leave the server. |
| `google-maps.ts` | Google Maps Places API (New) lead finder — finds businesses + enriches their websites for emails Uses Places API (New) Text Search Essentials — 10,000 free searches/month https://developers.… |
| `groq.ts` | TPM-budget escape hatches: when the primary model's token-per-minute pool is exhausted (429), retry the SAME prompt on a model with its OWN per-model TPM pool. Groq rate-limits per API key A… |
| `health-engine.ts` | Pure decision engine for the hourly health-check. No Deno, no DB. Shared by supabase/functions/health-check/index.ts (runtime) and scripts/.ops/prove-health-sim.mjs (simulation proof) so the… |
| `intelligence-reads.ts` | INTELLIGENCE-READS — Stage 5 request-time consumer contract. Design: INTELLIGENCE-LAYER-DESIGN.md §2.2, §2.3, §2.5, §3. Principles enforced HERE, in one place: * Staleness = "no opinion": le… |
| `lead-ai.ts` | Lead-finder AI intelligence ============================================ Uses the shared Groq client to (1) plan better search queries/locations and (2) curate the discovered pool into the h… |
| `osm.ts` | Shared OpenStreetMap lead-finder (used by find-leads API and autopilot cron) |
| `policy.ts` | POLICY ENGINE — the ONLY component allowed to decide actions. AI provides structured classification; this module is deterministic. ===========================================================… |
| `razorpay-plans.ts` | RAZORPAY PLAN CATALOG — single source of truth. The amount is decided HERE, server-side, from the plan id the client sends. The browser never gets to state a price: it asks for a plan, we lo… |
| `reply-address.ts` | Per-lead inbound reply address. Outbound mail sets Reply-To to this address; the provider's inbound-parse webhook extracts the lead id and routes the reply back into the app. No Gmail read s… |
| `reply-styles.ts` | Reply shape — the decision variable that makes reply-style learning possible. Before this file the reply prompt was a single fixed instruction string, so there was nothing to attribute an ou… |
| `sanitize.ts` | Pure text sanitising for prompts, with no network imports so it stays usable (and unit-testable) outside the Deno runtime. |
| `saved-businesses.ts` | "Our own map": a permanent, ever-growing ledger of every business the lead finder has legitimately found (Google, OpenStreetMap, website enrichment). Searches check this table FIRST — zero e… |
| `search-budget.ts` | Google Maps search budget — the single daily allowance every live Google Places search draws from, and the meter the background "leftover quota" workers read to know how much of the day's al… |
| `search-cache.ts` | Shared DB-backed cache for the lead finder so Google Places quota is spent on NEW chemistry only, never on repeat searches. TTLs: areas 7 days, lead results 12h. All access via the service-r… |
| `support-boundary.ts` | The capability line in code: `isPersonalContactRequest()` detects requests for private people's contact data, `personalContactAnswer()` returns the deterministic refusal with business-only alternatives. Pure, no imports, unit-tested. |
| `sender-health.ts` | 0a shared: downstream daily-cap resolution. Reads gmail_tokens.connected_at for the warm-up anchor and sender_health for health-adjusted caps. Fail-safe: when the health ledger has no row, o… |
| `thread-memory.ts` | THREAD-MEMORY — the durable memory writer (Stage 8, §8.5/§8.6). Produces facts from a Gmail thread slice into thread_memory, routed through the ai-cost-gate with kind `summarize` (an L1, non… |
| `website-email-enrichment.ts` | Website email enrichment — crawls public business websites to find displayed email addresses Only collects publicly displayed emails from contact/about/team/footer pages. Deno runtime. Used … |
