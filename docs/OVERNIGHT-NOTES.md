# Overnight session notes

Log of autonomous overnight work sessions. Newest first.

## 2026-07-16 — Testing + CI foundation

**Goal:** add Vitest unit tests and GitHub Actions CI (Productization track, fully offline — no DB/network/secrets).

### Done
- **Vitest** added as a devDependency to `packages/ai` and `apps/api`, each with a `vitest.config.ts` (tests in each package's `test/` dir, so tsc builds ignore them). `pnpm test` at the root runs both suites via the existing turbo `test` task. `esbuild` added to `allowBuilds` in `pnpm-workspace.yaml` (vitest dependency with a build script).
- **27 unit tests, all passing:**
  - `packages/ai/test/pricing.test.ts` — `rateFor` known rates + non-zero fallback; `estimateCostMicros` math, ceiling, zero-token case.
  - `packages/ai/test/context-builder.test.ts` — `estimateTokens` (~4 chars/token, ceil); `buildContext` includes under budget, drops overflow chunks, never exceeds budget, can include a later small chunk after dropping a big one, empty input.
  - `apps/api/test/password.util.test.ts` — scrypt hash/verify round-trip, wrong password rejected, unique salts, malformed stored values rejected.
  - `apps/api/test/crypto.service.test.ts` — AES-256-GCM string + JSON round-trips, random IV, tampered ciphertext throws. Env stubbed in `test/setup.ts` (`APP_ENCRYPTION_KEY` = 64 test hex chars + dummy `DATABASE_URL`/`SESSION_SECRET` because `loadEnv()` validates the whole schema; `reflect-metadata` imported there for Nest decorators).
  - `apps/api/test/habits.util.test.ts` — streak counting with fake timers: done-today counts, consecutive days, gap breaks streak, in-progress today does NOT break an existing streak, per-day total must meet target, empty map.
- **Safe refactor:** `computeStreak` + `dayKey` moved from private functions in `habits.service.ts` to exported pure functions in `apps/api/src/modules/habits/habits.util.ts`; service imports them back. Behavior identical; full build green after.
- **CI:** `.github/workflows/ci.yml` — on push/PR to main: checkout, pnpm via `pnpm/action-setup@v4` (version taken from the `packageManager` field — do NOT also pass `version:`, the action errors on the conflict; that was the first run's failure), Node 24 with pnpm cache, `pnpm install --frozen-lockfile`, `pnpm --filter @atlas/db generate`, then build + typecheck + test. No database anywhere in CI.
- **Hygiene:** `.gitattributes` with `* text=auto eol=lf` (stops CRLF warning noise for new files; existing files not mass-renormalized).
- **Docs:** CLAUDE.md status + tracked-debt list updated (tests/CI no longer missing; remaining gap = e2e per module + cost-guard tests); roadmap Productization "Test + CI" marked done for the foundation.

### Verification
`pnpm build`, `pnpm typecheck`, `pnpm test` all green locally. CI on GitHub: first run failed on the pnpm version conflict (fixed by dropping `version:` from the action); second run (29553376372) fully green in 1m13s — install, Prisma generate, build, typecheck, test all passed. Minor annotation: checkout/setup-node/pnpm actions still target Node 20 (deprecated on runners); harmless now, bump to newer action majors when available.

### Follow-ups (not done tonight)
- Cost-guard unit tests (`packages/ai/src/cost-guard.ts`) — needs a Prisma mock or an injectable ledger interface; skipped to stay out of DB territory.
- One e2e happy-path per module (needs a test DB — decide approach: Neon branch, dockerized pg in CI, or pglite).
- Tests are not typechecked by `pnpm typecheck` (they live outside each package's tsconfig `include`); consider a `tsconfig.test.json` if that ever bites.
