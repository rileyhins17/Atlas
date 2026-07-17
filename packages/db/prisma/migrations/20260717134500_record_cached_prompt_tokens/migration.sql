-- Record how many prompt tokens the provider served from its prefix cache.
--
-- The provider reports this on every call and the cost calculation already uses
-- it, but it was being discarded. Prompt-cache regressions are silent -- no
-- error, no failing test, just a several-fold bill -- so this is the only
-- direct signal that caching still works. Without the column the hit rate can
-- only be inferred backwards from cost, which breaks whenever prices change.
ALTER TABLE "ai_usage" ADD COLUMN "cachedPromptTokens" INTEGER NOT NULL DEFAULT 0;
