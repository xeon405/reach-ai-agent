SELECT key, scope, scope_id, value, enabled, version FROM agent_config
WHERE key IN ('campaign_learning.enabled','lead_score.enabled') ORDER BY key, scope;