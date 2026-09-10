SELECT event, count(*) FROM audit_events
WHERE created_at > now() - interval '14 days'
  AND event IN ('ai.reply_sent','ai.reply_generated','email.replied','ai.classified','booking.detected','human.takeover','loop.stopped','agent.handoff')
GROUP BY event ORDER BY event;