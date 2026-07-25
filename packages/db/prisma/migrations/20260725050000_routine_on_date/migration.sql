-- Date-specific routine blocks. `onDate` (YYYY-MM-DD, the user's local calendar
-- date) makes irregular/shift schedules expressible: those users have no weekly
-- rule, they have "working 7-3 this Tuesday". Null keeps the existing weekly
-- behaviour, so every existing row is untouched.

-- AlterTable
ALTER TABLE "routine_blocks" ADD COLUMN     "onDate" TEXT;

-- CreateIndex
CREATE INDEX "routine_blocks_userId_onDate_idx" ON "routine_blocks"("userId", "onDate");
