-- Scope external-id uniqueness to the owning user.
--
-- The original constraints were global: UNIQUE(source, externalId). An external
-- id is only unique within an account, not across accounts -- e.g. a Google
-- Calendar event shared between two Atlas users carries the same event id for
-- both. Under the old constraint the second user's sync would collide with the
-- first user's row (and an upsert would silently update another tenant's data).
--
-- Postgres treats NULLs as distinct, so purely local rows (externalId IS NULL)
-- never conflicted before and still don't.

-- events
DROP INDEX IF EXISTS "events_source_externalId_key";
CREATE UNIQUE INDEX "events_userId_source_externalId_key" ON "events"("userId", "source", "externalId");

-- accounts
DROP INDEX IF EXISTS "accounts_source_externalId_key";
CREATE UNIQUE INDEX "accounts_userId_source_externalId_key" ON "accounts"("userId", "source", "externalId");

-- transactions
DROP INDEX IF EXISTS "transactions_source_externalId_key";
CREATE UNIQUE INDEX "transactions_userId_source_externalId_key" ON "transactions"("userId", "source", "externalId");
