SELECT indexname, indexdef FROM pg_indexes
WHERE tablename = 'ai_classifications';