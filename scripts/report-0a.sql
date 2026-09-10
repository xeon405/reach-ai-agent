select
  sh.gmail_email,
  sh.phase,
  sh.current_cap,
  sh.warm_cap,
  sh.clean_days,
  sh.sends_7d,
  sh.bounces_7d,
  sh.unsubs_7d,
  sh.replies_7d,
  round(sh.bounce_rate_7d * 100, 2) as bounce_pct,
  round(sh.complaint_rate_7d * 100, 2) as unsub_pct,
  round(extract(epoch from (now() - sh.last_measured_at)) / 3600, 2) as age_hours
from public.sender_health sh
order by sh.last_measured_at desc;