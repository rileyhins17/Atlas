# Handoff — 4 September 2026

Written for the next agent picking this up cold. It says where the code is, what
was just changed and why, and what is genuinely still open. Read
[`AGENTS.md`](./AGENTS.md) for the rules and [`docs/GOTCHAS.md`](./docs/GOTCHAS.md)
for traps already paid for.

The active refactor's expanded objective is recorded in
[`docs/REFACTOR-GOAL.md`](./docs/REFACTOR-GOAL.md): rethink the product and implement
it end to end, while retaining the safety and verification gates.

## Active refactor update — 7 September 2026

Phase 0's synthetic restore path is verified in CI in PR #3. Phase 1's focused
PRs #4–#11 are also individually green. The combined branch
`codex/phase-1-correctness-gate` assembles them and adds the timer mutation
regressions and repository-wide list-bound contract. Its local gates passed
(build 6/6, forced typecheck 10/10, lint 0 errors and 3 existing warnings,
1,367 unit tests, plus 15 Python restore tests). Combined PR #12 is green at
`9b19cc3` in runs `34179388103` and `34179363460`: 50 browser passes, one skip,
both independent regressions and both database checks passed. Phase 2 has
started on `codex/phase-2-domain-contract`. See
[`docs/phase-1-validation.md`](./docs/phase-1-validation.md) for tested commits,
observed runs, audit scope and current verification.

The historical status and measurements below are retained for context. They
are not fresh observations of the live origin or production database. The
private production dump remains off limits to agents and CI.

---

## Historical state at the original handoff

Green on `main` at `8de8e20`:

```
build 6/6 · typecheck 10/10 · lint clean · 1275 unit tests · e2e 48/48
```

`atlaslife.app` is serving 200. Three real accounts use it. The database holds
2,194 tasks, 636 journal entries, 2,698 timeline rows and 147 workouts — this is
not a toy dataset, and a destructive mistake is not recoverable from a backup
that does not exist yet (see "Blocked on a human" below).

---

## What shipped in the last session

Ordered by how much each was hurting a real user.

| Fix | Root cause |
|---|---|
| Site died with a black "Application error" | The service worker cached the App Router's `?_rsc=` payloads by URL, so after any deploy it served a payload whose chunks no longer existed |
| Chat did not know the date | `chat()` was the one AI path that never included the `## Now` block |
| Cancelling an event was impossible | Calendar was the only domain whose AI summary omitted row ids, so `calendar.delete` had nothing to pass |
| Every AI-reported time was wrong | The same three lines rendered `toISOString()` — UTC, not the user's zone |
| "The display moves around when I swipe" | Inputs under 16px triggered iOS zoom on focus; the viewport then stayed zoomed and every later swipe panned the app |
| The logo was a blank grey square on mobile | The SVG gradient used a hardcoded `id` and the mark renders twice per page; `url(#id)` resolved into the hidden sidebar |
| The same task created four times | The tool loop had no dedupe |
| A mid-loop model failure lost the undo record | `runToolLoop` threw and discarded `toolExecutions` for writes already applied |

Features added: supersets (fitness), per-user daily trackers ("rate anything
1–10", feeding the same cross-domain contrast engine as mood), a markdown-
rendering chat rail, and a plate calculator.

**One regression was introduced and caught in the same session.** The new
tool-loop error handling swallowed the "no API key" error, which turned a 424
into a 200 and silently disarmed the local capture fallback — meaning a
brand-new account's first capture would write nothing. Three e2e specs went red.
The guard is now `if (toolExecutions.length === 0) throw err;`. Do not remove it.

---

## Open work, in priority order

### 1. ~~The 383ms tax~~ — done

`atlaslife.app` now runs on `ca-central-1`. Measured on the same machine within
the same minute: a round trip was **387 ms** to us-west-2 through the
transaction pooler, and is **26 ms** to ca-central-1 through the session
endpoint. API endpoints measured 540 ms → 310 ms from moving off the pooler
alone.

Two things worth keeping from how it went:

- **Use the session endpoint (5432), not the transaction pooler (6543).**
  The pooler is for many short-lived clients sharing few connections. Atlas is
  one long-lived process with Prisma's own pool, so Supavisor was pure overhead
  — 135 ms versus 26 ms for the identical query against the identical database.
  `connection_limit=10` is pinned on the URL so Prisma does not open more
  session connections than a free tier wants.
- **Create pgvector in the schema the SOURCE used.** us-west-2 has it in
  `public`, so the dump says `public.vector(768)`. Putting it in `extensions` on
  the target — Supabase's default, and where `pgcrypto` already lived — fails
  only the `embeddings` table, with `type "public.vector" does not exist`, while
  the other 26 restore cleanly. That looks like a corrupt dump and is not one.

The us-west-2 project still holds the data as of the switch. Leave it until the
new host has some runtime behind it.

### 2. Known gaps

[`docs/production-readiness.md`](./docs/production-readiness.md) is the
authoritative list, written from a 154-assertion API stress pass. It is ordered
by what blocks shipping and says what was measured rather than assumed. Read it
before planning any "make it production ready" work.

### 3. Never audited

`docs/master-plan.md` has an audit plan whose **Phase 6 (UI/UX consistency) has
no findings behind it** — the sweep died on a rate limit before returning
anything. It is the one phase in that document with no measured evidence. If you
work on UI consistency, run the sweep rather than trusting the checklist.

---

## Blocked on a human

These cannot be done by an agent and are listed so nobody re-discovers them:

**Phase 0 restore gate:** CI uses `infra/db-move.py` to dump and restore synthetic
domain rows in disposable pgvector and requires exact counts for every public
table. No production dump or secret is involved. Its scope and limits are in
[`docs/backup-restore-drill.md`](./docs/backup-restore-drill.md). Do not start the
later refactor phases until the Phase 0 PR has an observed green restore job
and the remaining CI checks pass. This proves the mechanism, not the private
production archive's integrity or the nightly backup schedule.

1. **Nightly backups are not running.** `infra/atlas-backup.ps1` is written and
   tested, and PostgreSQL 17 is now installed, so the blocker is gone. Someone
   needs to run `powershell -File infra/atlas-backup.ps1 -Register`, choose an
   off-machine destination, and do a restore drill. Supabase free takes no
   backups; an unrestored backup is a hypothesis.
2. **Rotate the Plaid production secret** — it was pasted into a chat transcript.
   Needs the owner's Plaid login.
3. **`SENTRY_DSN` is unset**, so the error reporting that is wired in reports
   nothing.
4. **Google's OAuth consent screen is in "Testing"**, so refresh tokens die every
   7 days. Publishing the consent screen is what stops it recurring.
5. **~30 throwaway accounts accumulate per full e2e run.** Purge only with an
   exact allow-list of addresses, never a pattern — an address that looked like
   test junk once held the only live Google Calendar credential.

---

## How to verify your work

```bash
pnpm install
pnpm --filter @atlas/db generate
pnpm build && pnpm typecheck --force && pnpm lint && pnpm test
```

Those four run with no database and no `.env`. The e2e suite needs Postgres with
pgvector — copy the `e2e` job in `.github/workflows/ci.yml`, or see
[`AGENTS.md` §4](./AGENTS.md).

Verifying live matters here. Every serious bug in this project was invisible to
unit tests: wrong raw-SQL column names, timezone bucketing, a cache slot that
stranded finished workouts on screen, a 404ing manifest, a client bundle
pointing at localhost, a session cookie missing `Secure`. After building, drive
it in a real browser.

To look at the UI rather than read about it:

```bash
SHOTS=1 pnpm --filter @atlas/web exec playwright test e2e/screenshots.spec.ts
```

It shoots every route at 1440px and 390px. Most of the design work in this repo
came from reading those PNGs.
