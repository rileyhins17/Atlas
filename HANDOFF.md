# Handoff — 4 September 2026

Written for the next agent picking this up cold. It says where the code is, what
was just changed and why, and what is genuinely still open. Read
[`AGENTS.md`](./AGENTS.md) for the rules and [`docs/GOTCHAS.md`](./docs/GOTCHAS.md)
for traps already paid for.

---

## State at handoff

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

### 1. The 383ms tax — half done, needs one human command

Every database round trip is **383ms**, measured, because the database is in
`aws-0-us-west-2` (Oregon) and the user is in Toronto. `/today` fires 14 calls
and still shows skeletons after 2.6 seconds. This is the single largest reason
the app feels slow, and it touches no application code.

Already done: the target project exists (`dieyrvswjgvocauixvwi`, `ca-central-1`),
a verified dump of the current database sits in `.db-moves/`, and
`infra/db-move.py` does dump/restore with credentials in `PG*` env vars rather
than argv.

**`.db-moves/` is gitignored and exists only on the machine that made it.** That
is not an oversight to fix by uploading it somewhere: the file is a full
production dump containing three real people's journal entries, finance
transactions and fitness logs. It must never reach CI, an artifact store, a
GitHub secret, or any environment an agent can read. Anything that needs to
prove a restore path works must generate its own synthetic dump.

Remaining, and only the owner can run the first line because it prompts for a
password:

```bash
powershell -File infra/supabase-connect.ps1 -ProjectRef dieyrvswjgvocauixvwi -Region ca-central-1 -WriteOnly
python infra/db-move.py restore DATABASE_URL
python infra/db-move.py counts DATABASE_URL      # compare against the old host
```

A running origin holds its DB config in memory, so it keeps serving the old host
throughout — the move needs no downtime.

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

**Phase 0 restore gate — partly done.** CI runs a synthetic restore drill on
every push: it builds a database from this repo's own migrations, seeds known
counts, dumps and restores it, and checks pgvector and the `embeddings.embedding`
column type. That proves the mechanism, needs no secrets, and works on a fork.

What it deliberately does NOT do is restore the production dump. An earlier
version of this gate downloaded that dump into the runner from a signed URL in a
GitHub secret; it was replaced, because the file holds three people's journals,
finance transactions and fitness logs, and anyone who can add a workflow to this
repo can print a secret.

Still outstanding, and needs a person: an actual restore of a real backup.
Docker Desktop does not start on this machine and the local PostgreSQL 17 server
needs a superuser password that is not in `.env`. Until one of those is fixed the
real dump is verified by inspection only — `pg_restore --list` shows 27 `public`
tables, and `atlas-backup.ps1` now fails any dump holding fewer than 15. See
[`docs/backup-restore-drill.md`](./docs/backup-restore-drill.md).

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
