-- Proactive engine per-user preferences (additive, defaulted). Applied via
-- `migrate deploy` — see docs/GOTCHAS.md for why not `migrate dev` on Neon.

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "briefHour" INTEGER NOT NULL DEFAULT 7,
ADD COLUMN     "proactiveEnabled" BOOLEAN NOT NULL DEFAULT true;
