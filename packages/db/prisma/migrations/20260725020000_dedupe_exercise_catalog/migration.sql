-- Remove duplicate SHARED catalog rows (userId IS NULL), keeping the earliest
-- of each name and re-pointing any logged set at the survivor.
--
-- Cause: `@@unique([userId, name])` cannot dedupe the seeded rows, because
-- Postgres treats NULLs as DISTINCT — so every boot re-inserted the whole
-- catalog. The seeder now checks names explicitly; this cleans up what the
-- earlier boots left behind. Only touches userId IS NULL, so a user's own
-- exercises are never affected.

WITH ranked AS (
  SELECT id,
         name,
         ROW_NUMBER() OVER (PARTITION BY name ORDER BY "createdAt", id) AS rn,
         FIRST_VALUE(id) OVER (PARTITION BY name ORDER BY "createdAt", id) AS keep_id
  FROM "exercises"
  WHERE "userId" IS NULL
)
UPDATE "workout_sets" s
SET "exerciseId" = r.keep_id
FROM ranked r
WHERE s."exerciseId" = r.id AND r.rn > 1;

WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY name ORDER BY "createdAt", id) AS rn
  FROM "exercises"
  WHERE "userId" IS NULL
)
DELETE FROM "exercises"
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);
