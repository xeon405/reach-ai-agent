SELECT campaign_id, version, updated_at, state->>'reply_style_hint' AS hint,
       state->>'winner_variant' IS NOT NULL AS has_winner
FROM campaign_learning ORDER BY updated_at DESC LIMIT 10;