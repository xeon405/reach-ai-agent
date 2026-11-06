# Appendix C — Complete data model (51 tables, 499 columns)

Every table has RLS enabled. A table with zero policies is deny-all for `anon`/`authenticated` and reachable only through `service_role` or a `SECURITY DEFINER` function.


## `admin_actions`

Audit log of operator actions (flag / clear), with actor, target, note and time.

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` |
| `actor_id` | `uuid` | null |  |
| `target_id` | `uuid` | null |  |
| `action` | `text` | NOT NULL |  |
| `note` | `text` | null |  |
| `created_at` | `timestamp with time zone` | NOT NULL | `now()` |

**Constraints:** `admin_actions_pkey: PRIMARY KEY (id)`


## `admins`

Operator allowlist. Separate from `profiles`; authority is granted here, not by a profile flag.

| Column | Type | Null | Default |
|---|---|---|---|
| `user_id` | `uuid` | NOT NULL |  |
| `note` | `text` | null |  |
| `created_at` | `timestamp with time zone` | NOT NULL | `now()` |

**Constraints:** `admins_pkey: PRIMARY KEY (user_id)`; `admins_user_id_fkey: FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE`


## `agent_action_state`

Per-message and per-conversation action counters — the step budget that dollar budgets cannot bound.

| Column | Type | Null | Default |
|---|---|---|---|
| `conversation_id` | `uuid` | NOT NULL |  |
| `message_id` | `text` | null |  |
| `used_in_message` | `integer` | NOT NULL | `0` |
| `used_in_conversation` | `integer` | NOT NULL | `0` |
| `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |

**Constraints:** `agent_action_state_pkey: PRIMARY KEY (conversation_id)`; `agent_action_state_used_in_conversation_nonneg: CHECK ((used_in_conversation >= 0))`; `agent_action_state_used_in_message_nonneg: CHECK ((used_in_message >= 0))`


## `agent_config`

Scoped key/value judgment config and kill switches. Resolution `glob → user → campaign`.

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` |
| `key` | `text` | NOT NULL |  |
| `scope` | `text` | NOT NULL |  |
| `scope_id` | `uuid` | null |  |
| `value` | `jsonb` | NOT NULL |  |
| `version` | `integer` | NOT NULL | `1` |
| `enabled` | `boolean` | NOT NULL | `true` |
| `changed_by` | `text` | null |  |
| `created_at` | `timestamp with time zone` | NOT NULL | `now()` |
| `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |

**Constraints:** `agent_config_pkey: PRIMARY KEY (id)`; `agent_config_scope_check: CHECK ((scope = ANY (ARRAY['glob'::text, 'user'::text, 'campaign'::text])))`


## `agent_conversations`

Agent chat threads with titles and last-message recency.

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` |
| `user_id` | `uuid` | NOT NULL |  |
| `title` | `text` | NOT NULL | `'New chat'::text` |
| `created_at` | `timestamp with time zone` | NOT NULL | `now()` |
| `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |

**Constraints:** `agent_conversations_pkey: PRIMARY KEY (id)`; `agent_conversations_user_id_fkey: FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE`


## `agent_learned_phrases`

Fast-lane vocabulary cache: a phrasing mapped to an intent, promoted after a second conversation.

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | `bigint` | NOT NULL |  |
| `user_id` | `uuid` | NOT NULL |  |
| `scope` | `text` | NOT NULL | `'*'::text` |
| `phrase` | `text` | NOT NULL |  |
| `intent` | `text` | NOT NULL |  |
| `params` | `jsonb` | NOT NULL | `'{}'::jsonb` |
| `state` | `text` | NOT NULL | `'provisional'::text` |
| `uses` | `integer` | NOT NULL | `0` |
| `correct` | `integer` | NOT NULL | `0` |
| `last_used_at` | `timestamp with time zone` | NOT NULL | `now()` |
| `created_at` | `timestamp with time zone` | NOT NULL | `now()` |

**Constraints:** `agent_learned_correct_nonneg: CHECK ((correct >= 0))`; `agent_learned_intent_check: CHECK ((intent = ANY (ARRAY['list_campaigns'::text, 'campaign_stats'::text, 'find_contacts'::text, 'sender_health'::text, 'complianc`; `agent_learned_params_object: CHECK ((jsonb_typeof(params) = 'object'::text))`; `agent_learned_phrases_pkey: PRIMARY KEY (id)`; `agent_learned_phrases_user_id_fkey: FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE`; `agent_learned_state_check: CHECK ((state = ANY (ARRAY['provisional'::text, 'account'::text, 'retired'::text])))`; `agent_learned_uses_nonneg: CHECK ((uses >= 0))`


## `agent_messages`

Chat messages, including `executed_at` which makes a confirmation single-use.

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` |
| `conversation_id` | `uuid` | NOT NULL |  |
| `user_id` | `uuid` | NOT NULL |  |
| `role` | `text` | NOT NULL |  |
| `content` | `text` | NOT NULL |  |
| `intent` | `text` | null |  |
| `params` | `jsonb` | null |  |
| `used_ai` | `boolean` | NOT NULL | `false` |
| `created_at` | `timestamp with time zone` | NOT NULL | `now()` |
| `executed_at` | `timestamp with time zone` | null |  |

**Constraints:** `agent_messages_conversation_id_fkey: FOREIGN KEY (conversation_id) REFERENCES agent_conversations(id) ON DELETE CASCADE`; `agent_messages_pkey: PRIMARY KEY (id)`; `agent_messages_role_check: CHECK ((role = ANY (ARRAY['user'::text, 'assistant'::text, 'system'::text])))`; `agent_messages_user_id_fkey: FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE`


## `agent_pending_state`

Partial parameters held while the agent asks a clarifying question.

| Column | Type | Null | Default |
|---|---|---|---|
| `user_id` | `uuid` | NOT NULL |  |
| `conversation_id` | `uuid` | NOT NULL |  |
| `intent` | `text` | NOT NULL |  |
| `params` | `jsonb` | NOT NULL | `'{}'::jsonb` |
| `asked_at` | `timestamp with time zone` | NOT NULL | `now()` |

**Constraints:** `agent_pending_state_pkey: PRIMARY KEY (user_id, conversation_id)`; `agent_pending_state_user_id_fkey: FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE`


## `agent_profile`

Durable facts the agent learns about the owner across conversations.

| Column | Type | Null | Default |
|---|---|---|---|
| `user_id` | `uuid` | NOT NULL |  |
| `business_name` | `text` | null |  |
| `website` | `text` | null |  |
| `product` | `text` | null |  |
| `audience` | `text` | null |  |
| `goals` | `text` | null |  |
| `notes` | `text` | null |  |
| `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |

**Constraints:** `agent_profile_pkey: PRIMARY KEY (user_id)`; `agent_profile_user_id_fkey: FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE`


## `ai_classifications`

Structured classification of each inbound reply with evidence (`reason`).

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | `bigint` | NOT NULL |  |
| `user_id` | `uuid` | NOT NULL |  |
| `lead_id` | `uuid` | null |  |
| `message_id` | `text` | null |  |
| `intent` | `text` | null |  |
| `confidence` | `numeric` | null |  |
| `interested` | `boolean` | null |  |
| `booking_intent` | `boolean` | null |  |
| `unsubscribe` | `boolean` | null |  |
| `sentiment` | `text` | null |  |
| `requires_human` | `boolean` | null |  |
| `suggested_action` | `text` | null |  |
| `raw` | `jsonb` | null |  |
| `created_at` | `timestamp with time zone` | NOT NULL | `now()` |
| `reason` | `text` | null |  |

**Constraints:** `ai_classifications_pkey: PRIMARY KEY (id)`


## `ai_cost_guest_state`

Single-row global AI budget for anonymous support-chat visitors.

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | `boolean` | NOT NULL | `true` |
| `window_date` | `text` | NOT NULL |  |
| `window_month` | `text` | NOT NULL |  |
| `used_daily_usd` | `numeric(14,6)` | NOT NULL | `0` |
| `used_monthly_usd` | `numeric(14,6)` | NOT NULL | `0` |
| `last_reported_at` | `timestamp with time zone` | null |  |
| `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |

**Constraints:** `ai_cost_guest_state_id_check: CHECK (id)`; `ai_cost_guest_state_pkey: PRIMARY KEY (id)`


## `ai_cost_state`

Per-profile AI budget counters (daily + monthly windows).

| Column | Type | Null | Default |
|---|---|---|---|
| `profile_id` | `uuid` | NOT NULL |  |
| `window_date` | `text` | NOT NULL |  |
| `window_month` | `text` | NOT NULL |  |
| `used_daily_usd` | `numeric(14,6)` | NOT NULL | `0` |
| `used_monthly_usd` | `numeric(14,6)` | NOT NULL | `0` |
| `mode` | `text` | NOT NULL | `'ai'::text` |
| `trips` | `integer` | NOT NULL | `0` |
| `tripped_at` | `timestamp with time zone` | null |  |
| `tripped_reason` | `text` | null |  |
| `last_reported_at` | `timestamp with time zone` | null |  |
| `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |

**Constraints:** `ai_cost_state_mode_check: CHECK ((mode = ANY (ARRAY['ai'::text, 'template'::text, 'hard_stop'::text])))`; `ai_cost_state_pkey: PRIMARY KEY (profile_id)`; `ai_cost_state_profile_id_fkey: FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE`


## `ai_spend_ledger`

One row per LLM call: model, tokens, cost, caller context.

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` |
| `ts` | `timestamp with time zone` | NOT NULL | `now()` |
| `fn` | `text` | NOT NULL | `'unknown'::text` |
| `kind` | `text` | NOT NULL | `'generic'::text` |
| `model` | `text` | NOT NULL |  |
| `input_tokens` | `integer` | NOT NULL | `0` |
| `output_tokens` | `integer` | NOT NULL | `0` |
| `est_cost_usd` | `numeric(14,6)` | NOT NULL | `0` |
| `user_id` | `uuid` | null |  |
| `campaign_id` | `uuid` | null |  |
| `lead_id` | `uuid` | null |  |
| `decision_id` | `text` | null |  |
| `model_version` | `text` | null |  |

**Constraints:** `ai_spend_ledger_campaign_id_fkey: FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE SET NULL`; `ai_spend_ledger_est_cost_usd_check: CHECK ((est_cost_usd >= (0)::numeric))`; `ai_spend_ledger_input_tokens_check: CHECK ((input_tokens >= 0))`; `ai_spend_ledger_lead_id_fkey: FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL`; `ai_spend_ledger_output_tokens_check: CHECK ((output_tokens >= 0))`; `ai_spend_ledger_pkey: PRIMARY KEY (id)`; `ai_spend_ledger_user_id_fkey: FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE`


## `audit_events`

Append-only event trail with decision attribution (`decision_id`, `model_version`, `strategy_ref`).

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | `bigint` | NOT NULL |  |
| `user_id` | `uuid` | null |  |
| `lead_id` | `uuid` | null |  |
| `campaign_id` | `uuid` | null |  |
| `event` | `text` | NOT NULL |  |
| `payload` | `jsonb` | null |  |
| `created_at` | `timestamp with time zone` | NOT NULL | `now()` |
| `decision_id` | `uuid` | null |  |
| `model_version` | `text` | null |  |
| `strategy_ref` | `text` | null |  |

**Constraints:** `audit_events_pkey: PRIMARY KEY (id)`


## `billing_events`

Raw payment webhook events for reconciliation and replay analysis.

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` |
| `user_id` | `uuid` | null |  |
| `payment_id` | `uuid` | null |  |
| `event` | `text` | NOT NULL |  |
| `plan` | `text` | null |  |
| `amount_cents` | `bigint` | null |  |
| `currency` | `text` | null |  |
| `payload` | `jsonb` | NOT NULL | `'{}'::jsonb` |
| `created_at` | `timestamp with time zone` | NOT NULL | `now()` |

**Constraints:** `billing_events_payment_id_fkey: FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE SET NULL`; `billing_events_pkey: PRIMARY KEY (id)`; `billing_events_user_id_fkey: FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE`


## `campaign_learning`

Nightly learned state per campaign: variants, winners, opener/sequence/reply-style hints and samples.

| Column | Type | Null | Default |
|---|---|---|---|
| `campaign_id` | `uuid` | NOT NULL |  |
| `state` | `jsonb` | NOT NULL | `'{}'::jsonb` |
| `version` | `integer` | NOT NULL | `0` |
| `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |
| `triggered_by` | `text` | NOT NULL | `'learning-loop'::text` |

**Constraints:** `campaign_learning_campaign_id_fkey: FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE`; `campaign_learning_pkey: PRIMARY KEY (campaign_id)`


## `campaigns`

Outreach campaigns: audience, status, A/B flag, autopilot, delivery mode, image.

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` |
| `user_id` | `uuid` | NOT NULL |  |
| `name` | `text` | NOT NULL |  |
| `status` | `text` | NOT NULL | `'active'::text` |
| `target_icp` | `jsonb` | null |  |
| `created_at` | `timestamp with time zone` | NOT NULL | `now()` |
| `ab_test` | `boolean` | NOT NULL | `false` |
| `autopilot` | `boolean` | NOT NULL | `false` |
| `campaign_image_url` | `text` | null |  |
| `followups_enabled` | `boolean` | null | `true` |
| `delivery` | `text` | NOT NULL | `'smart'::text` |

**Constraints:** `campaigns_pkey: PRIMARY KEY (id)`; `campaigns_user_id_fkey: FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE`


## `domains`

DNS-verified domain ownership. Schema is 1-to-many per user; a verified domain is unique.

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` |
| `user_id` | `uuid` | NOT NULL |  |
| `domain` | `text` | NOT NULL |  |
| `verification_token` | `text` | NOT NULL |  |
| `verified_at` | `timestamp with time zone` | null |  |
| `created_at` | `timestamp with time zone` | NOT NULL | `now()` |

**Constraints:** `domains_pkey: PRIMARY KEY (id)`; `domains_user_id_fkey: FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE`


## `email_threads`

Thread-level state, including the erasure marker for GDPR forget.

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` |
| `user_id` | `uuid` | NOT NULL |  |
| `lead_id` | `uuid` | null |  |
| `gmail_thread_id` | `text` | null |  |
| `last_message_id` | `text` | null |  |
| `turn_count` | `integer` | NOT NULL | `0` |
| `high_priority` | `boolean` | NOT NULL | `false` |
| `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |
| `forget_at` | `timestamp with time zone` | null |  |
| `last_summarized_at` | `timestamp with time zone` | null |  |

**Constraints:** `email_threads_lead_id_fkey: FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE`; `email_threads_pkey: PRIMARY KEY (id)`; `email_threads_user_id_lead_id_key: UNIQUE (user_id, lead_id)`


## `emails_sent`

One row per delivered outreach email — the outcome record every learner reads.

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` |
| `user_id` | `uuid` | NOT NULL |  |
| `lead_id` | `uuid` | null |  |
| `campaign_id` | `uuid` | null |  |
| `subject` | `text` | null |  |
| `body` | `text` | null |  |
| `sent_at` | `timestamp with time zone` | NOT NULL | `now()` |
| `opened` | `boolean` | NOT NULL | `false` |
| `replied` | `boolean` | NOT NULL | `false` |
| `follow_up_sent` | `boolean` | NOT NULL | `false` |
| `follow_up_at` | `timestamp with time zone` | null |  |
| `sequence` | `integer` | NOT NULL | `1` |
| `reply_sentiment` | `text` | null |  |
| `ai_draft` | `text` | null |  |
| `variant` | `text` | null |  |
| `autoreplied` | `boolean` | NOT NULL | `false` |
| `ai_turns` | `integer` | NOT NULL | `0` |
| `last_lead_msg_at` | `timestamp with time zone` | null |  |
| `last_ai_msg_at` | `timestamp with time zone` | null |  |
| `ai_paused` | `boolean` | NOT NULL | `false` |
| `gmail_message_id` | `text` | null |  |
| `gmail_thread_id` | `text` | null |  |
| `opened_at` | `timestamp with time zone` | null |  |
| `opener_key` | `text` | null |  |
| `reply_style` | `text` | null |  |

**Constraints:** `emails_sent_campaign_id_fkey: FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE SET NULL`; `emails_sent_lead_id_fkey: FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE`; `emails_sent_pkey: PRIMARY KEY (id)`; `emails_sent_user_id_fkey: FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE`


## `follow_up_sequences`

Per-campaign step plan (step number, delay, template).

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` |
| `user_id` | `uuid` | NOT NULL |  |
| `campaign_id` | `uuid` | NOT NULL |  |
| `step_number` | `integer` | NOT NULL |  |
| `delay_days` | `integer` | NOT NULL |  |
| `template` | `text` | null |  |
| `active` | `boolean` | NOT NULL | `true` |
| `created_at` | `timestamp with time zone` | NOT NULL | `now()` |

**Constraints:** `follow_up_sequences_campaign_id_fkey: FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE`; `follow_up_sequences_campaign_id_step_number_key: UNIQUE (campaign_id, step_number)`; `follow_up_sequences_pkey: PRIMARY KEY (id)`; `follow_up_sequences_user_id_fkey: FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE`


## `gmail_tokens`

Encrypted Gmail OAuth tokens. Service-role only; never exposed to the client.

| Column | Type | Null | Default |
|---|---|---|---|
| `profile_id` | `uuid` | NOT NULL |  |
| `refresh_token` | `text` | NOT NULL |  |
| `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |
| `connected_at` | `timestamp with time zone` | null |  |

**Constraints:** `gmail_tokens_pkey: PRIMARY KEY (profile_id)`; `gmail_tokens_profile_id_fkey: FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE`


## `google_search_usage`

One true daily counter for every live Google Places search.

| Column | Type | Null | Default |
|---|---|---|---|
| `day` | `date` | NOT NULL |  |
| `count` | `integer` | NOT NULL | `0` |
| `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |

**Constraints:** `google_search_usage_pkey: PRIMARY KEY (day)`


## `health_state`

Crash-loop deduplication and escalation state for health alerts.

| Column | Type | Null | Default |
|---|---|---|---|
| `check_key` | `text` | NOT NULL |  |
| `active_since` | `timestamp with time zone` | null |  |
| `last_alerted_at` | `timestamp with time zone` | null |  |
| `last_seen_at` | `timestamp with time zone` | null |  |
| `resolved_at` | `timestamp with time zone` | null |  |
| `escalated_at` | `timestamp with time zone` | null |  |
| `alert_count` | `integer` | NOT NULL | `0` |

**Constraints:** `health_state_pkey: PRIMARY KEY (check_key)`


## `inbound_emails`

Replies received through inbound parse, with provider message ids.

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` |
| `user_id` | `uuid` | NOT NULL |  |
| `lead_id` | `uuid` | null |  |
| `campaign_id` | `uuid` | null |  |
| `from_email` | `text` | null |  |
| `to_email` | `text` | null |  |
| `subject` | `text` | null |  |
| `body_text` | `text` | null |  |
| `body_html` | `text` | null |  |
| `message_id` | `text` | null |  |
| `content_hash` | `text` | null |  |
| `created_at` | `timestamp with time zone` | NOT NULL | `now()` |

**Constraints:** `inbound_emails_content_hash_key: UNIQUE (content_hash)`; `inbound_emails_pkey: PRIMARY KEY (id)`


## `intro_requests`

Double opt-in warm introductions between platform users.

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` |
| `requester_user_id` | `uuid` | NOT NULL |  |
| `target_user_id` | `uuid` | NOT NULL |  |
| `message` | `text` | null |  |
| `status` | `text` | NOT NULL | `'pending'::text` |
| `created_at` | `timestamp with time zone` | NOT NULL | `now()` |
| `resolved_at` | `timestamp with time zone` | null |  |

**Constraints:** `intro_requests_pkey: PRIMARY KEY (id)`; `intro_requests_requester_user_id_fkey: FOREIGN KEY (requester_user_id) REFERENCES profiles(id) ON DELETE CASCADE`; `intro_requests_status_check: CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'rejected'::text, 'expired'::text])))`; `intro_requests_target_user_id_fkey: FOREIGN KEY (target_user_id) REFERENCES profiles(id) ON DELETE CASCADE`


## `lead_finder_caches`

DB-backed cache of discovery results (areas 7d, results 12h).

| Column | Type | Null | Default |
|---|---|---|---|
| `kind` | `text` | NOT NULL |  |
| `cache_key` | `text` | NOT NULL |  |
| `payload` | `jsonb` | NOT NULL |  |
| `expires_at` | `timestamp with time zone` | NOT NULL |  |
| `created_at` | `timestamp with time zone` | NOT NULL | `now()` |

**Constraints:** `lead_finder_caches_pkey: PRIMARY KEY (kind, cache_key)`


## `lead_refresh`

Per-lead refresh scheduling for the background lead engine.

| Column | Type | Null | Default |
|---|---|---|---|
| `niche` | `text` | NOT NULL |  |
| `country` | `text` | NOT NULL |  |
| `city` | `text` | NOT NULL |  |
| `last_live_search_at` | `timestamp with time zone` | NOT NULL | `now()` |
| `refreshes` | `integer` | NOT NULL | `1` |
| `query` | `text` | null |  |

**Constraints:** `lead_refresh_pkey: PRIMARY KEY (niche, country, city)`


## `lead_score`

Hourly deterministic lead score with tier, features and expiry.

| Column | Type | Null | Default |
|---|---|---|---|
| `lead_id` | `uuid` | NOT NULL |  |
| `score` | `numeric` | NOT NULL |  |
| `tier` | `text` | NOT NULL | `'D'::text` |
| `features` | `jsonb` | NOT NULL | `'{}'::jsonb` |
| `score_version` | `integer` | NOT NULL | `1` |
| `computed_at` | `timestamp with time zone` | NOT NULL | `now()` |
| `expires_at` | `timestamp with time zone` | NOT NULL | `(now() + '24:00:00'::interval)` |

**Constraints:** `lead_score_lead_id_fkey: FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE`; `lead_score_pkey: PRIMARY KEY (lead_id)`; `lead_score_score_check: CHECK (((score >= (0)::numeric) AND (score <= (1)::numeric)))`; `lead_score_tier_check: CHECK ((tier = ANY (ARRAY['A'::text, 'B'::text, 'C'::text, 'D'::text])))`


## `leads`

Prospect records: identity, company, category, verification, lifecycle, follow-up state.

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` |
| `user_id` | `uuid` | NOT NULL |  |
| `campaign_id` | `uuid` | null |  |
| `name` | `text` | null |  |
| `email` | `text` | null |  |
| `company` | `text` | null |  |
| `job_title` | `text` | null |  |
| `country` | `text` | null |  |
| `status` | `text` | NOT NULL | `'new'::text` |
| `created_at` | `timestamp with time zone` | NOT NULL | `now()` |
| `unsubscribed` | `boolean` | NOT NULL | `false` |
| `normalized_email` | `text` | null |  |
| `lifecycle` | `text` | NOT NULL | `'NEW'::text` |
| `conv_mode` | `text` | NOT NULL | `'AI_AUTOPILOT'::text` |
| `category` | `text` | null |  |
| `place_id` | `text` | null |  |
| `lead_source` | `text` | null |  |
| `email_status` | `text` | null |  |
| `email_confidence` | `integer` | null |  |
| `email_is_role` | `boolean` | null | `false` |
| `email_is_disposable` | `boolean` | null | `false` |
| `email_verification_reason` | `text` | null |  |
| `city` | `text` | null |  |
| `phone` | `text` | null |  |
| `address` | `text` | null |  |
| `website` | `text` | null |  |
| `rating` | `numeric(2,1)` | null |  |
| `followup_step` | `integer` | null | `0` |
| `next_followup_at` | `timestamp with time zone` | null |  |
| `followup_status` | `text` | null | `'none'::text` |
| `email_source` | `text` | null |  |
| `email_source_url` | `text` | null |  |

**Constraints:** `leads_campaign_id_fkey: FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE SET NULL`; `leads_pkey: PRIMARY KEY (id)`; `leads_user_id_fkey: FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE`


## `meetings`

Provider-confirmed bookings (Calendly) with an idempotency key.

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` |
| `user_id` | `uuid` | NOT NULL |  |
| `lead_id` | `uuid` | null |  |
| `campaign_id` | `uuid` | null |  |
| `booked_at` | `timestamp with time zone` | NOT NULL | `now()` |
| `provider` | `text` | NOT NULL | `'calendly'::text` |
| `provider_event_id` | `text` | null |  |
| `start_time` | `timestamp with time zone` | null |  |
| `end_time` | `timestamp with time zone` | null |  |
| `timezone` | `text` | null |  |
| `status` | `text` | NOT NULL | `'scheduled'::text` |
| `invitee_email` | `text` | null |  |
| `metadata` | `jsonb` | null |  |

**Constraints:** `meetings_campaign_id_fkey: FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE SET NULL`; `meetings_lead_id_fkey: FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE`; `meetings_pkey: PRIMARY KEY (id)`; `meetings_status_check: CHECK ((status = ANY (ARRAY['scheduled'::text, 'cancelled'::text, 'completed'::text, 'no_show'::text])))`; `meetings_user_id_fkey: FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE`


## `owner_alerts`

In-app alerts; a trigger copies high/medium alerts into `push_queue`.

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | `bigint` | NOT NULL |  |
| `user_id` | `uuid` | NOT NULL |  |
| `lead_id` | `uuid` | null |  |
| `kind` | `text` | NOT NULL |  |
| `title` | `text` | NOT NULL |  |
| `body` | `text` | null |  |
| `priority` | `text` | NOT NULL | `'normal'::text` |
| `read` | `boolean` | NOT NULL | `false` |
| `created_at` | `timestamp with time zone` | NOT NULL | `now()` |

**Constraints:** `owner_alerts_kind_check: CHECK ((kind = ANY (ARRAY['booking'::text, 'opt_out'::text, 'takeover'::text, 'handoff'::text, 'bounce'::text, 'first_reply'::text, 're`; `owner_alerts_pkey: PRIMARY KEY (id)`; `owner_alerts_priority_check: CHECK ((priority = ANY (ARRAY['normal'::text, 'high'::text])))`


## `payments`

Razorpay order and payment ledger: plan, amount, currency, status, ids.

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` |
| `user_id` | `uuid` | NOT NULL |  |
| `razorpay_order_id` | `text` | null |  |
| `razorpay_payment_id` | `text` | null |  |
| `razorpay_signature` | `text` | null |  |
| `plan` | `text` | NOT NULL |  |
| `amount_cents` | `bigint` | NOT NULL |  |
| `currency` | `text` | NOT NULL | `'USD'::text` |
| `status` | `text` | NOT NULL | `'created'::text` |
| `source` | `text` | NOT NULL | `'checkout'::text` |
| `method` | `text` | null |  |
| `failure_reason` | `text` | null |  |
| `created_at` | `timestamp with time zone` | NOT NULL | `now()` |
| `paid_at` | `timestamp with time zone` | null |  |
| `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |
| `idempotency_key` | `text` | null |  |
| `notes` | `jsonb` | NOT NULL | `'{}'::jsonb` |

**Constraints:** `payments_pkey: PRIMARY KEY (id)`; `payments_razorpay_order_id_key: UNIQUE (razorpay_order_id)`; `payments_status_check: CHECK ((status = ANY (ARRAY['created'::text, 'paid'::text, 'failed'::text, 'refunded'::text])))`; `payments_user_id_fkey: FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE`


## `plan_limits`

Single source of truth for plan caps: daily, lifetime, leads, campaigns.

| Column | Type | Null | Default |
|---|---|---|---|
| `plan` | `text` | NOT NULL |  |
| `daily_emails` | `integer` | NOT NULL |  |
| `leads` | `integer` | null |  |
| `campaigns` | `integer` | null |  |
| `lifetime_emails` | `integer` | null |  |

**Constraints:** `plan_limits_pkey: PRIMARY KEY (plan)`


## `profiles`

Account, business identity, plan, Gmail state, send counters, anti-abuse flags.

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | `uuid` | NOT NULL |  |
| `email` | `text` | null |  |
| `name` | `text` | null |  |
| `company` | `text` | null |  |
| `plan` | `text` | NOT NULL | `'free'::text` |
| `onboarded` | `boolean` | NOT NULL | `false` |
| `icp` | `jsonb` | null |  |
| `offer` | `text` | null |  |
| `gmail_connected` | `boolean` | NOT NULL | `false` |
| `notify_replies` | `boolean` | NOT NULL | `true` |
| `created_at` | `timestamp with time zone` | NOT NULL | `now()` |
| `gmail_email` | `text` | null |  |
| `emails_sent_today` | `integer` | NOT NULL | `0` |
| `emails_sent_date` | `date` | null |  |
| `ai_generated_today` | `integer` | NOT NULL | `0` |
| `ai_generated_date` | `date` | null |  |
| `referral_code` | `text` | null |  |
| `referred_by` | `text` | null |  |
| `booking_link` | `text` | null |  |
| `last_digest_date` | `date` | null |  |
| `autopilot` | `boolean` | null | `false` |
| `autopilot_country` | `text` | null |  |
| `autopilot_niche` | `text` | null |  |
| `signature` | `text` | null |  |
| `gmail_account_type` | `text` | NOT NULL | `'consumer'::text` |
| `gmail_state` | `text` | NOT NULL | `'CONNECTED'::text` |
| `website_url` | `text` | null |  |
| `business_description` | `text` | null |  |
| `problem_solved` | `text` | null |  |
| `target_customer` | `text` | null |  |
| `cities` | `text[]` | null | `'{}'::text[]` |
| `communication_style` | `text` | null |  |
| `dont_claim` | `text` | null |  |
| `has_product_image` | `boolean` | null | `false` |
| `phone` | `text` | null |  |
| `network_mode` | `boolean` | NOT NULL | `false` |
| `referral_reward_plan` | `text` | null |  |
| `referral_reward_until` | `timestamp with time zone` | null |  |
| `emails_sent_total` | `integer` | NOT NULL | `0` |
| `business_address` | `text` | null |  |
| `domain_required` | `boolean` | NOT NULL | `false` |
| `domain_verified` | `boolean` | NOT NULL | `false` |

**Constraints:** `profiles_id_fkey: FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE`; `profiles_pkey: PRIMARY KEY (id)`; `profiles_referral_code_key: UNIQUE (referral_code)`


## `push_queue`

Queued push notifications awaiting delivery.

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | `bigint` | NOT NULL | `nextval('push_queue_id_seq'::regclass)` |
| `user_id` | `uuid` | NOT NULL |  |
| `title` | `text` | NOT NULL |  |
| `body` | `text` | null |  |
| `kind` | `text` | null |  |
| `lead_id` | `uuid` | null |  |
| `priority` | `text` | null |  |
| `created_at` | `timestamp with time zone` | NOT NULL | `now()` |

**Constraints:** `push_queue_pkey: PRIMARY KEY (id)`; `push_queue_user_id_title_body_key: UNIQUE (user_id, title, body)`


## `push_subscriptions`

Browser/device push endpoints and keys.

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` |
| `user_id` | `uuid` | NOT NULL |  |
| `endpoint` | `text` | NOT NULL |  |
| `p256dh` | `text` | NOT NULL |  |
| `auth_secret` | `text` | NOT NULL |  |
| `created_at` | `timestamp with time zone` | NOT NULL | `now()` |

**Constraints:** `push_subscriptions_pkey: PRIMARY KEY (id)`; `push_subscriptions_user_id_endpoint_key: UNIQUE (user_id, endpoint)`; `push_subscriptions_user_id_fkey: FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE`


## `referrals`

Referral links, claims and reward windows.

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` |
| `referrer_id` | `uuid` | NOT NULL |  |
| `referred_email` | `text` | null |  |
| `status` | `text` | NOT NULL | `'pending'::text` |
| `reward_days` | `integer` | NOT NULL | `0` |
| `created_at` | `timestamp with time zone` | NOT NULL | `now()` |

**Constraints:** `referrals_pkey: PRIMARY KEY (id)`; `referrals_referrer_id_fkey: FOREIGN KEY (referrer_id) REFERENCES auth.users(id) ON DELETE CASCADE`


## `refresh_usage`

Budget counters for lead-refresh operations.

| Column | Type | Null | Default |
|---|---|---|---|
| `day` | `text` | NOT NULL |  |
| `count` | `integer` | NOT NULL | `0` |

**Constraints:** `refresh_usage_pkey: PRIMARY KEY (day)`


## `saved_businesses`

The permanent shared business map (≈6,700 rows): every legitimately discovered business, reused for free.

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` |
| `place_id` | `text` | null |  |
| `email` | `text` | null |  |
| `website` | `text` | null |  |
| `domain` | `text` | null |  |
| `name` | `text` | null |  |
| `company` | `text` | null |  |
| `job_title` | `text` | null |  |
| `niche` | `text` | NOT NULL |  |
| `country` | `text` | NOT NULL |  |
| `city` | `text` | null |  |
| `source` | `text` | null |  |
| `category` | `text` | null |  |
| `phone` | `text` | null |  |
| `address` | `text` | null |  |
| `rating` | `numeric` | null |  |
| `email_source` | `text` | null |  |
| `email_source_url` | `text` | null |  |
| `email_status` | `text` | null |  |
| `email_confidence` | `numeric` | null |  |
| `email_is_role` | `boolean` | null |  |
| `email_is_disposable` | `boolean` | null |  |
| `email_verification_reason` | `text` | null |  |
| `first_seen` | `timestamp with time zone` | NOT NULL | `now()` |
| `last_seen` | `timestamp with time zone` | NOT NULL | `now()` |
| `discovered_by` | `uuid[]` | NOT NULL | `'{}'::uuid[]` |
| `forgotten_by` | `uuid[]` | NOT NULL | `'{}'::uuid[]` |
| `email_crawl_at` | `timestamp with time zone` | null |  |

**Constraints:** `saved_businesses_pkey: PRIMARY KEY (id)`; `saved_businesses_place_id_key: UNIQUE (place_id)`


## `send_queue`

Durable send jobs with status, priority, attempts, lease and retry time.

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` |
| `user_id` | `uuid` | NOT NULL |  |
| `campaign_id` | `uuid` | NOT NULL |  |
| `lead_id` | `uuid` | NOT NULL |  |
| `variant` | `text` | null |  |
| `status` | `text` | NOT NULL | `'pending'::text` |
| `attempts` | `integer` | NOT NULL | `0` |
| `created_at` | `timestamp with time zone` | NOT NULL | `now()` |
| `updated_at` | `timestamp with time zone` | null |  |
| `last_error` | `text` | null |  |
| `next_retry_at` | `timestamp with time zone` | null |  |
| `lease_until` | `timestamp with time zone` | null |  |
| `priority` | `numeric` | NOT NULL | `0.5` |

**Constraints:** `send_queue_campaign_id_fkey: FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE`; `send_queue_lead_id_fkey: FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE`; `send_queue_pkey: PRIMARY KEY (id)`; `send_queue_priority_check: CHECK (((priority >= (0)::numeric) AND (priority <= (1)::numeric)))`; `send_queue_user_id_fkey: FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE`


## `sender_health`

Mailbox reputation ledger: phase, cap, 7-day rates, clean days.

| Column | Type | Null | Default |
|---|---|---|---|
| `profile_id` | `uuid` | NOT NULL |  |
| `gmail_email` | `text` | null |  |
| `phase` | `text` | NOT NULL | `'ramp'::text` |
| `current_cap` | `integer` | NOT NULL | `5` |
| `warm_cap` | `integer` | NOT NULL | `5` |
| `sends_7d` | `integer` | NOT NULL | `0` |
| `bounces_7d` | `integer` | NOT NULL | `0` |
| `replies_7d` | `integer` | NOT NULL | `0` |
| `unsubs_7d` | `integer` | NOT NULL | `0` |
| `bounce_rate_7d` | `numeric` | NOT NULL | `0` |
| `complaint_rate_7d` | `numeric` | NOT NULL | `0` |
| `reply_rate_7d` | `numeric` | NOT NULL | `0` |
| `clean_days` | `integer` | NOT NULL | `0` |
| `last_measured_at` | `timestamp with time zone` | NOT NULL | `now()` |
| `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |

**Constraints:** `sender_health_phase_check: CHECK ((phase = ANY (ARRAY['ramp'::text, 'steady'::text, 'recovery'::text])))`; `sender_health_pkey: PRIMARY KEY (profile_id)`; `sender_health_profile_id_fkey: FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE`


## `signup_signals`

Device id + salted IP hash recorded at signup. Observation only; no client access.

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` |
| `user_id` | `uuid` | null |  |
| `device_id` | `text` | null |  |
| `ip_hash` | `text` | null |  |
| `user_agent` | `text` | null |  |
| `created_at` | `timestamp with time zone` | NOT NULL | `now()` |

**Constraints:** `signup_signals_pkey: PRIMARY KEY (id)`; `signup_signals_user_id_fkey: FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE`


## `strategy_state`

Anonymised global aggregates. No user, lead or campaign identity; GDPR rows excluded.

| Column | Type | Null | Default |
|---|---|---|---|
| `feature_bucket` | `text` | NOT NULL |  |
| `model_version` | `text` | NOT NULL |  |
| `window_start` | `timestamp with time zone` | NOT NULL |  |
| `window_end` | `timestamp with time zone` | NOT NULL |  |
| `deltas` | `jsonb` | NOT NULL | `'{}'::jsonb` |
| `sent` | `integer` | NOT NULL | `0` |
| `replied` | `integer` | NOT NULL | `0` |
| `meets` | `integer` | NOT NULL | `0` |
| `excluded_gdpr` | `integer` | NOT NULL | `0` |
| `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |

**Constraints:** `strategy_state_pkey: PRIMARY KEY (feature_bucket, model_version, window_start)`


## `support_chat_messages`

Support chat messages.

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` |
| `thread_id` | `uuid` | NOT NULL |  |
| `role` | `text` | NOT NULL |  |
| `content` | `text` | NOT NULL |  |
| `created_at` | `timestamp with time zone` | NOT NULL | `now()` |

**Constraints:** `support_chat_messages_pkey: PRIMARY KEY (id)`; `support_chat_messages_role_check: CHECK ((role = ANY (ARRAY['user'::text, 'assistant'::text])))`; `support_chat_messages_thread_id_fkey: FOREIGN KEY (thread_id) REFERENCES support_chat_threads(id) ON DELETE CASCADE`


## `support_chat_threads`

Support chat threads.

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` |
| `user_id` | `uuid` | null |  |
| `status` | `text` | NOT NULL | `'auto'::text` |
| `created_at` | `timestamp with time zone` | NOT NULL | `now()` |
| `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |
| `guest_id` | `text` | null |  |

**Constraints:** `support_chat_threads_pkey: PRIMARY KEY (id)`; `support_chat_threads_user_id_fkey: FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE`


## `suppressions`

Permanent opt-out / bounce list; triggers block queue and sent inserts.

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` |
| `user_id` | `uuid` | NOT NULL |  |
| `lead_id` | `uuid` | null |  |
| `email` | `text` | NOT NULL |  |
| `reason` | `text` | NOT NULL |  |
| `source` | `text` | null |  |
| `created_at` | `timestamp with time zone` | NOT NULL | `now()` |

**Constraints:** `suppressions_lead_id_fkey: FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE`; `suppressions_pkey: PRIMARY KEY (id)`; `suppressions_reason_check: CHECK ((reason = ANY (ARRAY['unsubscribed'::text, 'bounced'::text, 'manual'::text, 'complaint'::text])))`; `suppressions_user_id_fkey: FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE`


## `thread_memory`

Facts-only conversation memory (never raw transcript).

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` |
| `thread_id` | `uuid` | NOT NULL |  |
| `lead_id` | `uuid` | NOT NULL |  |
| `fact_kind` | `text` | NOT NULL |  |
| `value` | `text` | NOT NULL |  |
| `source_message_id` | `text` | null |  |
| `source_ts` | `timestamp with time zone` | null |  |
| `confidence` | `numeric` | null |  |
| `created_at` | `timestamp with time zone` | NOT NULL | `now()` |
| `superseded_at` | `timestamp with time zone` | null |  |

**Constraints:** `thread_memory_confidence_check: CHECK (((confidence >= (0)::numeric) AND (confidence <= (1)::numeric)))`; `thread_memory_fact_kind_whitelist: CHECK ((fact_kind = ANY (ARRAY['interest_level'::text, 'objection'::text, 'timing_window'::text, 'availability'::text, 'decis`; `thread_memory_lead_id_fkey: FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE`; `thread_memory_pkey: PRIMARY KEY (id)`; `thread_memory_thread_id_fkey: FOREIGN KEY (thread_id) REFERENCES email_threads(id) ON DELETE CASCADE`; `thread_memory_value_len: CHECK ((char_length(value) <= 200))`


## `tools_rate_limit`

Per-tool, per-user rate limiting for the tools gateway.

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | `bigint` | NOT NULL |  |
| `ip` | `text` | NOT NULL |  |
| `action` | `text` | NOT NULL | `'any'::text` |
| `created_at` | `timestamp with time zone` | NOT NULL | `now()` |

**Constraints:** `tools_rate_limit_pkey: PRIMARY KEY (id)`


## `tracking_events`

Opens and clicks.

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | `bigint` | NOT NULL |  |
| `email_id` | `uuid` | null |  |
| `user_id` | `uuid` | NOT NULL |  |
| `lead_id` | `uuid` | null |  |
| `campaign_id` | `uuid` | null |  |
| `event` | `text` | NOT NULL |  |
| `occurred_at` | `timestamp with time zone` | NOT NULL | `now()` |

**Constraints:** `tracking_events_email_id_fkey: FOREIGN KEY (email_id) REFERENCES emails_sent(id) ON DELETE CASCADE`; `tracking_events_event_check: CHECK ((event = ANY (ARRAY['open'::text, 'click'::text])))`; `tracking_events_pkey: PRIMARY KEY (id)`


## `usage_limits`

Legacy daily mirror of sends; counters are owned by `reserve_send_slot`.

| Column | Type | Null | Default |
|---|---|---|---|
| `user_id` | `uuid` | NOT NULL |  |
| `emails_sent_today` | `integer` | NOT NULL | `0` |
| `limit_date` | `date` | NOT NULL | `CURRENT_DATE` |
| `updated_at` | `timestamp with time zone` | NOT NULL | `now()` |

**Constraints:** `usage_limits_pkey: PRIMARY KEY (user_id)`; `usage_limits_user_id_fkey: FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE`

