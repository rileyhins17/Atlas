-- AlterTable
ALTER TABLE "goals" ADD COLUMN     "horizon" TEXT NOT NULL DEFAULT 'short',
ADD COLUMN     "position" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "goals_userId_horizon_position_idx" ON "goals"("userId", "horizon", "position");

