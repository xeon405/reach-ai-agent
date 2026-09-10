INSERT INTO send_queue (user_id, campaign_id, lead_id, variant, status, attempts)
VALUES ('39b65a0f-2c1d-48e2-9ee7-a358ba8d0570', 'e1edea76-95c5-462a-9bc7-5306f3cbc52c', '396a562c-e8a8-4f2a-a94a-d47531e4fd64', 'A', 'pending', 0)
RETURNING id;