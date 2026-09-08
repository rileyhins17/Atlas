-- Run before dump AND after restore. This prevents an empty fixture from
-- passing a before/after equality check and exercises stored vector values.
DO $$
BEGIN
  IF (SELECT count(*) FROM users) <> 2
     OR (SELECT count(*) FROM tasks) <> 7
     OR (SELECT count(*) FROM journal_entries) <> 5
     OR (SELECT count(*) FROM workouts) <> 3
     OR (SELECT count(*) FROM accounts) <> 2
     OR (SELECT count(*) FROM transactions) <> 4
     OR (SELECT count(*) FROM timeline_events) <> 7
     OR (SELECT count(*) FROM embeddings) <> 2 THEN
    RAISE EXCEPTION 'Synthetic domain row counts do not match the fixture';
  END IF;
  IF (SELECT count(*) FROM embeddings WHERE vector_dims(embedding) = 768 AND embedding <-> embedding = 0) <> 2 THEN
    RAISE EXCEPTION 'Restored vectors are missing or unusable';
  END IF;
END $$;
