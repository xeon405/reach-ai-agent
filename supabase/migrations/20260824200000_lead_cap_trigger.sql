-- Server-side enforcement of per-plan lead storage caps.
-- UI caps were client-only; this trigger closes the direct-API hole.

create or replace function public.enforce_lead_cap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cap int;
begin
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
end;
$$;

drop trigger if exists leads_lead_cap on public.leads;
create trigger leads_lead_cap
  before insert on public.leads
  for each row execute function public.enforce_lead_cap();
