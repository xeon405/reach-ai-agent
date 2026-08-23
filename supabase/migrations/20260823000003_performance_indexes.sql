-- Production performance indexes: every query filters by user_id via RLS
CREATE INDEX IF NOT EXISTS idx_leads_user ON public.leads (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_campaign ON public.leads (campaign_id);
CREATE INDEX IF NOT EXISTS idx_emails_user ON public.emails_sent (user_id);
CREATE INDEX IF NOT EXISTS idx_emails_campaign ON public.emails_sent (campaign_id);
CREATE INDEX IF NOT EXISTS idx_emails_reply_scan ON public.emails_sent (replied, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_emails_followup ON public.emails_sent (follow_up_sent, replied, follow_up_at);
CREATE INDEX IF NOT EXISTS idx_campaigns_user ON public.campaigns (user_id);
