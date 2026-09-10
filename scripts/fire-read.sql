select phase, current_cap, clean_days, sends_7d, bounces_7d, round(bounce_rate_7d * 100, 2) as b_pct,
  round(extract(epoch from (now() - last_measured_at)) / 60, 1) as age_min
from public.sender_health where profile_id = 'a3f0c001-0000-4000-8000-000000000001';