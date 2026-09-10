SELECT lead_id, score, tier, score_version, computed_at, expires_at
FROM lead_score ORDER BY computed_at DESC LIMIT 5;