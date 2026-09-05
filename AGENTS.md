# AGENTS.md — Atlas

Instructions for any coding agent working in this repository (Codex, Cursor,
Gemini CLI, Cline, Windsurf). Claude Code reads [`CLAUDE.md`](./CLAUDE.md),
which carries the same rules in a different voice; where the two disagree, this
file is correct about **commands and constraints** and `CLAUDE.md` is correct
about **history and rationale**.

Read [`README.md`](./README.md) for what Atlas is,
[`HANDOFF.md`](./HANDOFF.md) for where the work currently stands, and
[`docs/GOTCHAS.md`](./docs/GOTCHAS.md) before debugging anything.

---

## 1. What this project is

**Atlas** — a personal Life OS, live at `atlaslife.app`, sold as a product.
TypeScript monorepo: pnpm workspaces + Turborepo, NestJS 11 API, Next.js 15 PWA,
Prisma 6 + Postgres/pgvector, DeepSeek for AI.

Build to a paid-SaaS standard on every change: userId-scoped queries, zod at the
boundary, a `take` on every list, typed errors, loading/empty/error states,
mobile-first, tested, accessible.

---

## 2. Before you change code

Do these in order:

1. Run `pnpm install`.
2. Run `pnpm --filter @atlas/db generate`. Every typecheck depends on the
   generated Prisma client existing.
3. Read `docs/GOTCHAS.md`. Most surprising behaviour here is already documented.
4. Search for the existing implementation before writing a new one. Four
   features reported as "missing" in this repo already existed. Grep first, and
   prefer running the thing over reading about it.

---

## 3. After you change code

Run all four, in this order, and report the real output:

```bash
pnpm build
pnpm typecheck --force
pnpm lint
pnpm test
```

Pass `--force` to typecheck. Turbo caches typecheck results and will report
green for code it did not check.

If your change affects `apps/web` behaviour, also run the end-to-end suite:

```bash
pnpm --filter @atlas/web exec playwright test
```

State the numbers you actually saw. If a check fails, say so and paste the
failure. Report a check as skipped when you skipped it.

---

## 4. What you can and cannot run in a sandbox

Assume a cloud sandbox has **no `.env`, no database, and no running Atlas
origin** unless you have verified otherwise.

| Command | Works with no DB? |
|---|---|
| `pnpm install` | yes |
| `pnpm --filter @atlas/db generate` | yes |
| `pnpm build` | yes |
| `pnpm typecheck --force` | yes |
| `pnpm lint` | yes |
| `pnpm test` | yes — every unit test mocks Prisma |
| `pnpm --filter @atlas/web exec playwright test` | **no** — needs a database and a running app |

To run the e2e suite you need Postgres **with pgvector** (the first migration
runs `CREATE EXTENSION vector`, so the stock `postgres` image fails), plus the
env vars. Copy exactly what CI does — see the `e2e` job in
`.github/workflows/ci.yml`:

```bash
docker run -d --name atlas-pg -p 5432:5432 \
  -e POSTGRES_USER=atlas -e POSTGRES_PASSWORD=atlas -e POSTGRES_DB=atlas_test \
  pgvector/pgvector:pg16

export DATABASE_URL=postgresql://atlas:atlas@localhost:5432/atlas_test
export DIRECT_DATABASE_URL=$DATABASE_URL
export SESSION_SECRET=ci-e2e-session-secret-0123456789
export APP_ENCRYPTION_KEY=0000000000000000000000000000000000000000000000000000000000000000
export AI_DAILY_TOKEN_CAP=100000

pnpm --filter @atlas/db migrate:deploy
pnpm build
pnpm --filter @atlas/web exec playwright install --with-deps chromium
pnpm --filter @atlas/web test:e2e
```

When you cannot run the e2e suite, say so plainly and rely on CI. Do not claim
it passed.

---

## 5. Rules that are not negotiable

Each line states what to do. The reason follows, because the reasons are what
make these stick.

- **Build the API with `tsc`.** Never `tsx`, `esbuild`, `swc` or `ts-node`.
  NestJS dependency injection needs `emitDecoratorMetadata`, which only `tsc`
  emits. The app compiles fine under the others and then fails at runtime with
  unresolvable providers.
- **Import the database only through `@atlas/db`.** Never import `@prisma/client`
  directly from an app or package.
- **Put pure logic in `packages/shared`.** The UI and the API must compute from
  one implementation; two copies drift, and this repo has paid for that.
- **Scope every query by `userId`,** and validate every request body with zod at
  the controller boundary.
- **Put a `take` on every list query.** Unbounded `findMany` is how a heavy
  account takes the API down.
- **Store weight as integer grams.** `lb`/`kg` is a display preference applied at
  the edge by `gramsToUnit`/`unitToGrams`. Storing a float accumulates error
  across a session's volume, and switching units must never rewrite a logged set.
  RPE follows the same rule in integer tenths (75 = RPE 7.5).
- **Step days with `addDays` from `apps/web/lib/dates.ts`.** Never add
  `86_400_000`. A local day is 23 or 25 hours on the DST transitions and this app
  is used in a timezone that has them; nine sites had this wrong and each was a
  visible bug. `DAY_MS` exists only for genuinely elapsed time.
- **Give every AI domain summary the row id and local times.** `summarize()` must
  render `[id]` for each row and format times in the user's timezone. Without the
  id the model can name a row and cannot address one, so its update and delete
  tools silently do nothing — that shipped, in calendar, and looked like the
  model being unhelpful. `toISOString()` is UTC and is never the right format
  here.
- **Reach for the AI last.** Every feature must work with no API key present.
  Capture falls back to a local parser; the fitness split builder matches the
  catalog locally. A feature that needs a key to function at all is broken for
  every new account.
- **Keep timers off the database.** Anything on an interval must check
  `ActivityService` first. A health probe running `SELECT 1` plus a sweep
  scanning every sixty seconds kept the database from ever suspending and burned
  a monthly compute quota in about a week.
- **Give modal surfaces `z-index: 81`.** `.dialog-overlay` is z-80; anything
  rendered behind it but left below it becomes unclickable.
- **Size text inputs at 16px or larger.** Below 16px, iOS zooms the page on
  focus, and the viewport then stays zoomed so every later swipe pans the whole
  app. Fix the field. Do not pin `maximumScale` — that disables pinch-zoom for
  everyone and fails WCAG 1.4.4.
- **Use `--brand-on-tint` for brand-coloured text on a brand tint.** `--brand` is
  tuned to sit on a surface and measures 4.29:1 on a 12% tint of itself, which
  is an AA failure. This regression has returned twice.
- **Add a CSS rule for every className you introduce.** A class with no rule
  renders as the browser default, which is how a nag became the largest text on
  the Today screen.

---

## 6. Database migrations

1. Never run `prisma migrate dev`. Drift against the hosted database makes it
   offer only a destructive reset.
2. Run `prisma migrate diff` and read the output.
3. Confirm the change is additive.
4. Hand-write the migration SQL under
   `packages/db/prisma/migrations/<timestamp>_<name>/migration.sql`, with
   comments explaining the columns.
5. Run `prisma migrate deploy`, then `prisma generate`.

Before any destructive query, print the exact rows it will affect and stop for a
human. Delete by an exact allow-list of ids or addresses, never by a pattern: an
address that looked like test junk held the only live Google Calendar
credential.

---

## 7. Tests

- Put pure-logic tests next to the pure logic in `packages/shared/test/`.
- Put service tests in `apps/api/test/` with Prisma mocked.
- Append end-to-end tests to `apps/web/e2e/life-os.spec.ts`. A new spec file
  means another registration, and sign-up is throttled to 5 per minute per IP.
- Watch a regression test fail before the fix, and say in the commit that you
  did. A test never seen red is not evidence, and this repo has already shipped
  a regression spec that passed against the bug it was written for.
- Type into fields that a user types into: `click()` then `pressSequentially()`.
  `fill()` sets the value in one shot with no keystrokes, and it hid a bug that
  turned `185` into `0185` for anyone who actually tapped the box. On a React
  controlled input `fill()` can also dispatch a single event a commit misses,
  leaving state empty so no request is sent at all.
- Assert against a container that can only hold saved data. React mirrors a
  controlled textarea's value into its text content, so a loose `hasText` match
  passes the instant you type and proves nothing about persistence.
- Give each spec its own baseline. Specs share one account by necessity, so a
  spec that passes in a full run and fails alone is the dangerous shape — it
  hides in green. Verify a new spec both ways.
- Never let an assertion depend on which day it runs.

---

## 8. Branches, commits, pull requests

- Branch from `main`. Name it `codex/<short-topic>`.
- Do not commit directly to `main`.
- Never commit `.env`, `.db-moves/`, or anything containing a credential.
- Write commit subjects that name the user-visible problem, not the patch:
  `fix(ai): chat did not know what day it was`, not `fix: add nowBlock`.
- Put the measurement in the body when there is one. Numbers you ran beat
  adjectives.
- End the body with the check results you actually got:
  `build 6/6 · typecheck 10/10 · lint clean · 1275 unit tests · e2e 48/48`.
- Open a pull request against `main`. CI must be green before merge.

---

## 9. In CI (`CI=true`)

1. Never start a long-running dev server.
2. Never write to `.env`.
3. Treat any failing check as a stop condition and report it; do not retry in a
   loop.
4. Do not run the destructive database scripts under `infra/`.

---

## 10. Ask a human first

Stop and ask before you:

- delete or overwrite database rows,
- rotate or regenerate a credential,
- change anything under `infra/` that affects the live origin,
- add a runtime dependency,
- or change the deployment topology.

Everything else: make the change, run the checks, and report what you measured.
