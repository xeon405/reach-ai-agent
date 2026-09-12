-- ============================================================
-- FOLLOW-UP SEND-WINDOW HARDENING (audit-2026-09-12)
-- ============================================================
-- The reply-cancel trigger only matched followup_status = 'active'. send-worker
-- PASS 1 atomically claims a due lead to 'sending' between the CAS claim and the
-- wire send; a reply scanned in that window was silently ignored by the trigger,
-- then the worker's (old) no-post-claim re-check sent anyway.
--
-- Fix: the trigger now also cancels the 'sending' claim state. send-worker reads
-- the lead back immediately before sendGmailRaw and aborts when the claim no
-- longer holds (see send-worker/index.ts pre-send emitted-state re-check). Once a
-- reply flips the row to 'cancelled', the worker's fresh read sees
-- followup_status != 'sending' and releases the slot / cancels instead of sending.
--
-- 'paused' and 'completed' are untouched on reply (deliberate): a sequence that
-- already ran to completion or was manually paused is not resurrected by a reply.

CREATE OR REPLACE FUNCTION public.on_lead_reply_cancel_followup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.replied = true AND (OLD.replied = false OR OLD.replied IS NULL) THEN
    UPDATE leads SET
      followup_status = 'cancelled',
      next_followup_at = NULL
    WHERE id = NEW.lead_id AND followup_status IN ('active', 'sending');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_email_reply ON emails_sent;
CREATE TRIGGER on_email_reply
  AFTER UPDATE OF replied ON emails_sent
  FOR EACH ROW
  WHEN (NEW.replied = true AND (OLD.replied = false OR OLD.replied IS NULL))
  EXECUTE FUNCTION public.on_lead_reply_cancel_followup();