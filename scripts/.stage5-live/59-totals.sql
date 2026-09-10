SELECT event, count(*) AS n FROM audit_events
WHERE event IN ('ai.reply_sent','human.takeover','email.sent','email.replied')
GROUP BY 1 ORDER BY n DESC;