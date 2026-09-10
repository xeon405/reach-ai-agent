SELECT payload->>'trigger' AS trigger, count(*) AS n
FROM audit_events WHERE event = 'human.takeover'
GROUP BY 1 ORDER BY n DESC;