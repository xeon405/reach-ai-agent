# Appendix D — SQL function reference (43 functions)

All live in `public`. `SECURITY DEFINER` functions set `search_path = public` and check authority themselves.

| Function | Arguments | Purpose |
|---|---|---|
| `admin_clear_flag` | `p_user uuid, p_note text` | Admin: clears a duplicate-business flag with a mandatory note; writes `admin_actions`. |
| `admin_console` | `—` | Admin: returns the full read model (totals, accounts, clusters, signals, decisions) or raises `not_admin`. |
| `admin_flag` | `p_user uuid, p_note text` | Admin: sets a flag with a note; writes `admin_actions`. |
| `advance_lead_followup` | `p_lead_id uuid, p_campaign_id uuid, p_current_step integer` | Moves a lead to the next follow-up step and schedules it. |
| `ai_cost_debit` | `p_profile_id uuid, p_debit numeric, p_pool_daily numeric, p_pool_monthly numeric` | Atomic reserve of AI budget before an LLM call (daily + monthly pools). |
| `ai_cost_guest_debit` | `p_debit numeric, p_pool_daily numeric, p_pool_monthly numeric` | Same reservation for the anonymous visitor bucket. |
| `ai_cost_guest_settle` | `p_delta numeric` | Settles the visitor reservation against actual spend. |
| `ai_cost_settle` | `p_profile_id uuid, p_delta numeric` | Settles a profile reservation against actual spend. |
| `assert_not_suppressed` | `—` | Raises if an address is suppressed; used by queue/sent triggers. |
| `audit_campaigns_write` | `—` | Trigger: writes a campaign audit event on insert/update. |
| `audit_leads_insert` | `—` | Trigger: writes a lead audit event on insert. |
| `bump_google_search_usage` | `p_cost integer` | Increments the daily Google Places search counter. |
| `cancel_lead_followup` | `p_lead_id uuid, p_reason text` | Cancels a lead's remaining follow-ups with a reason. |
| `claim_queue_jobs_v2` | `p_limit integer DEFAULT 10, p_lease_minutes integer DEFAULT 10` | Claims up to N send jobs with `FOR UPDATE SKIP LOCKED`, increments attempts, sets the lease. |
| `consume_ai_quota` | `uid uuid, cap integer` | Legacy quota consumption; locked to service role. |
| `create_default_follow_ups` | `p_user_id uuid, p_campaign_id uuid` | Seeds the 4-touch default sequence (day 3/7/14/21) for a campaign. |
| `create_default_follow_ups` | `—` | Seeds the 4-touch default sequence (day 3/7/14/21) for a campaign. |
| `delete_lead` | `p_user_id uuid, p_lead_id uuid` | Hard-deletes a lead and its dependent rows; ownership-gated. |
| `effective_plan` | `p_user uuid` | Resolves the active plan, including stacking referral rewards. |
| `enforce_campaign_limit` | `—` | Trigger: enforces the plan's campaign cap. |
| `enforce_lead_cap` | `—` | Trigger: enforces the plan's lead cap. |
| `enqueue_push_alert` | `—` | Enqueues a push notification for an alert. |
| `flag_duplicate_business` | `—` | Trigger: flags a later account with the same brand + address. |
| `forget_lead` | `p_user_id uuid, p_lead_id uuid, p_suppress boolean` | GDPR erase-in-place: removes personal fields, keeps aggregate outcome rows. |
| `guard_protected_profile_cols` | `—` | Trigger: restores `plan`, `domain_required`, `domain_verified` on user writes. |
| `handle_new_user` | `—` | Trigger: creates the profile row on signup. |
| `health_cron_evidence` | `—` | Returns execution markers + dispatch history for every cron job. |
| `health_last_cron_runs` | `—` | Returns the dispatch ledger (pre-marker fallback). |
| `init_lead_followup` | `p_lead_id uuid, p_campaign_id uuid, p_initial_send_at timestamptz` | Initialises follow-up state for a lead in a campaign. |
| `is_admin` | `—` | True when `auth.uid()` is in `public.admins`. |
| `is_plausible_business_address` | `p_address text` | Street-level address predicate (length, letters, digit, street-word). |
| `normalize_business_text` | `p_value text` | Normalises brand/address text for exact comparison. |
| `on_lead_reply_cancel_followup` | `—` | Trigger: cancels follow-ups when a reply arrives. |
| `public_stats` | `—` | Aggregate public counters for the marketing site. |
| `referral_count` | `—` | Counts successful referrals for a user. |
| `release_send_slot` | `p_user uuid` | Returns a reserved send slot after a failed send. |
| `reserve_send_slot` | `p_user uuid, p_cap integer` | THE choke point: atomically increments daily/total and enforces identity, address, caps and domain proof. |
| `rls_auto_enable` | `—` | Helper that enables RLS on new tables. |
| `send_block_reason` | `p_user uuid` | Returns the exact refusal reason for a user, or NULL. |
| `set_agent_config` | `p_key text, p_scope text, p_scope_id uuid, p_value jsonb, p_enabled boolean, p_changed_by text` | RPC upsert for partial unique indexes on `agent_config`. |
| `touch_agent_conversation` | `—` | Updates conversation recency on each message. |
| `touch_payments_updated_at` | `—` | Trigger: maintains `payments.updated_at`. |
| `trg_create_follow_ups_on_campaign` | `—` | Trigger: seeds follow-ups when a campaign is created. |

## Views

| View | Definition |
|---|---|
| `opener_performance` | `campaign_id, opener_key, sent, replied, reply_rate` over rows with a non-null `opener_key`. Diagnostic, not the learning source. |
| `reply_style_performance` | `campaign_id, reply_style, conversations, meetings` over rows with a non-null `reply_style`. Diagnostic. |
