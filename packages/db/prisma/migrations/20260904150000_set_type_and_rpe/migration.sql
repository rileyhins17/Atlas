-- What kind of set it was, and what it cost.
--
-- A tracker that records only weight and reps knows what you moved and nothing
-- about how hard it was. Two sets of 100kg x 5 are not the same session if one
-- was comfortable and the other was everything you had.
--
-- `setType` defaults to 'normal' and every existing row is backfilled from the
-- `warmup` boolean, which stays: volume, records and every screen already read
-- it, and rewriting all of that to derive from a string would be risk with no
-- payoff. The service keeps the two in step at write time, so there is exactly
-- one writer and no chance of drift.
--
-- `rpe` is TENTHS (75 = RPE 7.5) and nullable. Integer because the value only
-- ever lands on a half, and a float column for that is an invitation to
-- 7.499999 — the same reasoning as weight being stored in grams. NULL means it
-- was not recorded, which is not the same as easy.
ALTER TABLE "workout_sets" ADD COLUMN "setType" TEXT NOT NULL DEFAULT 'normal';
ALTER TABLE "workout_sets" ADD COLUMN "rpe" INTEGER;

UPDATE "workout_sets" SET "setType" = 'warmup' WHERE "warmup" = true;
