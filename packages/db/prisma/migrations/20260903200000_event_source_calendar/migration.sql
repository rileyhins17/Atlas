-- Which calendar at the source an event came from.
--
-- Additive and nullable on purpose: every existing synced row came from
-- `primary`, because that is the only calendar Atlas could see, and NULL is
-- read as primary everywhere. No backfill, so no chance of a wrong one.
--
-- Not added to the unique index. A meeting you are invited to carries the same
-- Google event id on every calendar it appears on; including the calendar in
-- the key would import it once per calendar and show it twice on one day.
ALTER TABLE "events" ADD COLUMN "sourceCalendarId" TEXT;
