-- Link a calendar block back to the task it was reserved for.
--
-- This is what makes "how long does this actually take" answerable: the block
-- records when the work started, the task's completedAt records when it
-- stopped. Before this, accepting a "Plan my day" proposal created an event
-- that merely copied the task's title, so the connection was guesswork.
--
-- Nullable and ON DELETE SET NULL: most events have no task, and deleting a
-- task must never silently remove time from someone's calendar.
ALTER TABLE "events" ADD COLUMN "taskId" TEXT;

CREATE INDEX "events_userId_taskId_idx" ON "events"("userId", "taskId");

ALTER TABLE "events" ADD CONSTRAINT "events_taskId_fkey"
  FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
