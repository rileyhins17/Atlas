-- Finance domain / Plaid connector: additive, nullable bank-connection metadata.
-- Applied via `migrate deploy` (not `migrate dev`) because the Neon dev DB has a
-- Neon-managed `pg_session_jwt` extension that trips migrate dev's drift check
-- into wanting a destructive reset. See docs/GOTCHAS.md.

-- AlterTable
ALTER TABLE "accounts" ADD COLUMN     "institution" TEXT,
ADD COLUMN     "mask" TEXT;

-- AlterTable
ALTER TABLE "transactions" ADD COLUMN     "merchantName" TEXT,
ADD COLUMN     "pending" BOOLEAN NOT NULL DEFAULT false;
