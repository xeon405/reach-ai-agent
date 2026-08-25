-- Owner website/app URL: when set, the AI answers prospect queries using the
-- site's content as a knowledge base and funnels leads to this URL instead of
-- only offering a booking link. Owners without a site keep the handoff flow.
alter table public.profiles add column if not exists website_url text;
