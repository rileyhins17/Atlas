-- Routine blocks (user's typical week). Applied via migrate deploy — see GOTCHAS (Neon drift).

-- CreateTable
CREATE TABLE "routine_blocks" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'custom',
    "days" INTEGER NOT NULL DEFAULT 127,
    "startMin" INTEGER NOT NULL,
    "endMin" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "routine_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "routine_blocks_userId_idx" ON "routine_blocks"("userId");

-- AddForeignKey
ALTER TABLE "routine_blocks" ADD CONSTRAINT "routine_blocks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

