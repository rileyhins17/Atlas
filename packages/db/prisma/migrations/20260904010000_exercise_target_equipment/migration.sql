-- The specific muscle a movement trains, and what you do it with.
--
-- `muscle` stays exactly as it is: it is what the muscle-balance chart reads
-- and what every existing row already stores. It is simply too coarse to search
-- with — "legs" covers quads, hamstrings, glutes, calves, adductors AND
-- abductors, so a hip abduction machine was unfindable.
--
-- Both nullable and both left NULL for existing rows. A user's own addition
-- should be loggable without classifying it first, and a row written before
-- these columns existed is genuinely unclassified rather than wrongly so; the
-- catalog reseed fills in the shared entries.
ALTER TABLE "exercises" ADD COLUMN "target" TEXT;
ALTER TABLE "exercises" ADD COLUMN "equipment" TEXT;
