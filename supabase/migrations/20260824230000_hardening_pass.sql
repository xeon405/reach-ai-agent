-- ============================================================
-- PRODUCTION HARDENING PASS (post-audit fixes)
-- ============================================================

-- A) FIX: ON CONFLICT target mismatch — expression index unusable for upserts.
--    All writers lowercase emails, so a plain unique index is equivalent and targetable.
drop index if exists uniq_suppressions_user_email;
create unique index if not exists uniq_suppressions_user_plain on public.suppressions (user_id, email);

-- B) IDEMPOTENCY: follow-up steps must never double-record/send on crash-retry.
create unique index if not exists uniq_emails_step
  on public.emails_sent (campaign_id, lead_id, sequence)
  where sequence >= 2;

-- C) IDEMPOTENCY: each inbound Gmail message processed once across crashes/overlaps.
create unique index if not exists uniq_aiclass_message on public.ai_classifications (user_id, message_id);

-- D) ATOMIC DAILY-LIMIT RESERVATION (concurrency-safe; no read-then-write race).
create or replace function public.reserve_send_slot(p_user uuid, p_cap int)
returns boolean language plpgsql as $fn$
declare v_ok boolean;
begin
  update public.profiles set
    emails_sent_date = current_date,
    emails_sent_today = case when emails_sent_date = current_date then coalesce(emails_sent_today,0) + 1 else 1 end
  where id = p_user
    and (case when emails_sent_date = current_date then coalesce(emails_sent_today,0) else 0 end) < p_cap
  returning true into v_ok;
  return coalesce(v_ok, false);
end $fn$;

create or replace function public.release_send_slot(p_user uuid)
returns void language sql as $fn$
  update public.profiles
  set emails_sent_today = greatest(coalesce(emails_sent_today,0) - 1, 0)
  where id = p_user;
$fn$;

-- E) Account-type aware ceiling (Gmail consumer ≈500/day, Workspace ≈2000/day envelopes).
alter table public.profiles add column if not exists gmail_account_type text not null default 'consumer';
alter table public.profiles add column if not exists gmail_state text not null default 'CONNECTED';

-- F) AUDIT COVERAGE for paths that had zero events (frontend-driven writes).
create or replace function public.audit_leads_insert() returns trigger as $fn$
begin
  insert into public.audit_events (user_id, lead_id, event, payload)
  values (new.user_id, new.id, 'lead.created', jsonb_build_object('email', lower(new.email)));
  return new;
end $fn$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_audit_lead_created on public.leads;
create trigger trg_audit_lead_created after insert on public.leads
  for each row execute function public.audit_leads_insert();

create or replace function public.audit_campaigns_write() returns trigger as $fn$
begin
  if tg_op = 'INSERT' then
    insert into public.audit_events (user_id, campaign_id, event, payload)
    values (new.user_id, new.id, 'campaign.created', jsonb_build_object('name', new.name));
  else
    if coalesce(old.status,'') is distinct from coalesce(new.status,'') then
      insert into public.audit_events (user_id, campaign_id, event, payload)
      values (new.user_id, new.id,
        case new.status when 'active' then 'campaign.started' when 'paused' then 'campaign.paused' else 'campaign.status_changed' end,
        jsonb_build_object('from', old.status, 'to', new.status));
    end if;
  end if;
  return new;
end $fn$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_audit_campaigns on public.campaigns;
create trigger trg_audit_campaigns after insert or update of status on public.campaigns
  for each row execute function public.audit_campaigns_write();

-- G) HOT-LOOP FIX: pending jobs with a future next_retry_at must not be reclaimed.
create or replace function public.claim_queue_jobs_v2(p_limit int default 10, p_lease_minutes int default 10)
returns setof public.send_queue language plpgsql as $fn$
begin
  return query
  with claimable as (
    select id from public.send_queue
    where (status = 'pending' and (next_retry_at is null or next_retry_at <= now()))
       or (status in ('claimed','processing') and coalesce(lease_until, now() - interval '1 hour') < now())
       or (status = 'failed' and next_retry_at is not null and next_retry_at <= now())
    order by created_at
    for update skip locked
    limit p_limit
  )
  update public.send_queue q
  set status = 'claimed',
      attempts = q.attempts + 1,
      lease_until = now() + (p_lease_minutes || ' minutes')::interval,
      updated_at = now()
  from claimable c
  where q.id = c.id
  returning q.*;
end $fn$;
