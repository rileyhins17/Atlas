-- Supersets: exercises performed back to back, with rest only after the round.
--
-- Null is the overwhelming majority and means "on its own", so the column is
-- nullable with no default rather than a sentinel — an exercise that is part of
-- no superset should not have to claim membership of group -1.
--
-- Members of the same group WITHIN one template are performed together. The
-- number is scoped to the template and renumbered from zero on save, because it
-- is shown to people as "Superset A".
ALTER TABLE "template_exercises" ADD COLUMN "superset_group" INTEGER;
