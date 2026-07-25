-- Recurrence: RFC 5545 RRULE stored verbatim on the series root, plus a
-- self-link from a materialised instance back to that root. Both nullable, so
-- every existing row is a one-off and untouched.

-- AlterTable
ALTER TABLE "events" ADD COLUMN     "recurrence" TEXT,
ADD COLUMN     "recurrenceParentId" TEXT;

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "recurrence" TEXT,
ADD COLUMN     "recurrenceParentId" TEXT;

-- CreateIndex
CREATE INDEX "tasks_userId_recurrenceParentId_idx" ON "tasks"("userId", "recurrenceParentId");
