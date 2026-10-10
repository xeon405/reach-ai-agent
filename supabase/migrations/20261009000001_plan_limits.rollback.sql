-- Rollback for 20261009000001_plan_limits.sql

-- Restore the original hardcoded lead-cap function (20260824200000).
CREATE OR REPLACE FUNCTION public.enforce_lead_cap()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  cap int;
BEGIN
  cap := case (
    select coalesce(p.plan, 'free')
    from public.profiles p
    where p.id = new.user_id
  )
    when 'starter' then 250
    when 'growth'  then 1000
    when 'agency'  then 5000
    else 25
  end;

  if (select count(*) from public.leads where user_id = new.user_id) >= cap then
    raise exception 'Lead limit reached for your plan (%). Delete some leads or upgrade.', cap
      using errcode = 'P0001';
  end if;
  return new;
END; $$;

DROP TRIGGER IF EXISTS trg_enforce_campaign_limit ON public.campaigns;
DROP FUNCTION IF EXISTS public.enforce_campaign_limit();
DROP FUNCTION IF EXISTS public.effective_plan(UUID);
DROP POLICY IF EXISTS "plan limits readable" ON public.plan_limits;
DROP TABLE IF EXISTS public.plan_limits;
