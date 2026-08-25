-- ============================================================
-- DATABASE CLEANUP — Part 5 audit findings
-- ============================================================

-- 1. Drop dead column: send_queue.status_new (never read or written)
ALTER TABLE public.send_queue DROP COLUMN IF EXISTS status_new;

-- 2. Drop dead column: gmail_tokens.access_token (always null; tokens minted on-demand)
ALTER TABLE public.gmail_tokens DROP COLUMN IF EXISTS access_token;

-- 3. Drop dead column: usage_limits.ai_calls_today (never read)
ALTER TABLE public.usage_limits DROP COLUMN IF EXISTS ai_calls_today;

-- 4. Drop dead function: claim_queue_jobs v1 (superseded by claim_queue_jobs_v2)
DROP FUNCTION IF EXISTS public.claim_queue_jobs(integer);

-- ============================================================
-- PERFORMANCE INDEXES — from Part 5 audit
-- ============================================================

-- send-campaign: leads WHERE campaign_id AND status = 'new'
CREATE INDEX IF NOT EXISTS idx_leads_campaign_status
  ON public.leads (campaign_id, status);

-- inbox-agent: emails_sent WHERE user_id AND replied
CREATE INDEX IF NOT EXISTS idx_emails_user_replied
  ON public.emails_sent (user_id, replied);

-- inbox-agent: emails_sent WHERE ai_paused AND ai_turns
CREATE INDEX IF NOT EXISTS idx_emails_ai_paused_turns
  ON public.emails_sent (ai_paused, ai_turns);

-- daily-digest: emails_sent WHERE user_id ORDER BY sent_at
CREATE INDEX IF NOT EXISTS idx_emails_user_sent
  ON public.emails_sent (user_id, sent_at DESC);

-- inbox-agent: audit_events WHERE user_id AND lead_id AND event
CREATE INDEX IF NOT EXISTS idx_audit_user_lead_event
  ON public.audit_events (user_id, lead_id, event, created_at DESC);

-- send-worker: follow-up query (follow_up_sent, replied, sequence, follow_up_at)
CREATE INDEX IF NOT EXISTS idx_emails_followup_query
  ON public.emails_sent (follow_up_sent, replied, sequence, follow_up_at);

-- campaigns dashboard: campaigns WHERE user_id ORDER BY created_at
CREATE INDEX IF NOT EXISTS idx_campaigns_user_created
  ON public.campaigns (user_id, created_at DESC);

-- lead-finder: suppressions WHERE user_id AND email
CREATE INDEX IF NOT EXISTS idx_suppressions_user_email
  ON public.suppressions (user_id, lower(email));

-- track-open: tracking_events WHERE email_id
-- (already has idx_tracking_email, skip)

-- owner_alerts: WHERE user_id AND read ORDER BY created_at
CREATE INDEX IF NOT EXISTS idx_alerts_user_read
  ON public.owner_alerts (user_id, read, created_at DESC);
