# Atlas — a personal Life OS

One data layer for tasks, calendar, habits, journal, notes, goals, finance,
fitness and your own daily trackers — plus a cheap cross-domain AI that briefs
you, files messy input, plans your day, and interviews you to fill its own gaps.

**The hook is the join.** A habit tracker knows you trained. A journal knows you
felt like a 2. Only something holding both can notice that your 2s cluster on
the days you did not. Nothing else you use knows your sleep schedule, your
training volume and your overdue tasks at the same time.

Live at **[atlaslife.app](https://atlaslife.app)**. Private beta — sign-up is
gated by an invite code.

---

## Read this before you change anything

| If you are… | Start here |
|---|---|
| Claude Code | [`CLAUDE.md`](./CLAUDE.md) |
| Codex, Cursor, Gemini CLI, or any other agent | [`AGENTS.md`](./AGENTS.md) |
| A human | this file, then [`CLAUDE.md`](./CLAUDE.md) |
| Picking this up cold | [`HANDOFF.md`](./HANDOFF.md) — current state, open work, what is blocked on a person |

Both agent files describe **what Atlas is now**, not how it got here — git
history is the changelog. [`docs/GOTCHAS.md`](./docs/GOTCHAS.md) is the list of
traps already paid for; read it before debugging anything, because most
surprising behaviour in this repo is already written down there.

---

## Stack

TypeScript monorepo, pnpm workspaces + Turborepo, ESM throughout.

| Layer | Choice | Note |
|---|---|---|
| API | NestJS 11 | Built with **`tsc`**, never `tsx` — DI needs `emitDecoratorMetadata` |
| Web | Next.js 15 (App Router, PWA) | |
| DB | Postgres + pgvector via Prisma 6 | Supabase in production |
| AI | DeepSeek direct | ~$0.00005 per chat, capped per user |
| Embeddings | `Xenova/bge-base-en-v1.5` | Local and in-process — no key, no per-call cost |
| Node | >= 20 (CI uses 24) | pnpm 11.13.1, pinned via `packageManager` |

```
packages/db          Prisma schema + client. Import the DB only via @atlas/db.
packages/shared      zod DTOs, enums, AI contracts, and PURE domain logic
                     (recurrence, fitness maths, markdown, trackers).
                     Browser-safe.
packages/connectors  Connector interface, DeepSeek, Google Calendar, Plaid.
packages/ai          pricing, CostGuard, context builder, tool loop, embedder.
apps/api             NestJS. core/ + auth/ + modules/{tasks,habits,trackers,
                     journal,notes,calendar,finance,fitness,routine,stats,
                     timeline,push,settings,account,ai}.
apps/web             Next 15. app/ routes, components/, lib/.
infra/               Caddyfile, docker-compose, start/health/backup scripts.
docs/                architecture, data model, roadmap, guides, ADRs, GOTCHAS.
```

**Two architectural rules that are easy to break, and expensive when broken:**

1. **Module = life domain.** Each implements `DomainModule` (`aiContext` +
   `getToolSpecs`) and self-registers. Adding a domain means copying the shape
   of `modules/tasks/`; core never changes.
2. **Pure logic lives in `packages/shared`, not in an app.** The fitness maths
   and the recurrence engine are shared so the UI and the API compute
   identically from one implementation.

---

## Local setup

```bash
pnpm install
cp .env.example .env
```

Then fill in `.env`. The two that must be generated rather than invented:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # SESSION_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # APP_ENCRYPTION_KEY (must be 64 hex chars)
```

Start a database with the pgvector extension available — the first migration
runs `CREATE EXTENSION vector`, so a plain `postgres` image will fail:

```bash
docker compose -f infra/docker-compose.yml up -d db
```

Then:

```bash
pnpm --filter @atlas/db generate
pnpm --filter @atlas/db migrate:deploy
pnpm build
pnpm --filter @atlas/api dev     # http://localhost:4000
pnpm --filter @atlas/web dev     # http://localhost:3000
```

Atlas runs without an AI key. Capture falls back to a local parser and the
fitness split builder matches free text against the catalog locally, so a
brand-new account works before anyone has pasted a DeepSeek key. **A feature
that needs an API key to work at all is broken for every new account** — treat
that as a rule, not a nicety.

---

## The checks

```bash
pnpm build
pnpm typecheck --force     # --force: turbo will otherwise report a cached green
pnpm lint
pnpm test                  # 1275 unit tests
pnpm --filter @atlas/web exec playwright test    # 48 e2e (Playwright + axe)
```

CI (`.github/workflows/ci.yml`) runs three jobs, and **nothing merges without all
three**: build → typecheck → lint → test; a Playwright job against a
`pgvector/pgvector:pg16` service; and a restore drill that builds a database
from this repo's own migrations, dumps it, and restores it — proving the shipped
schema round-trips through `pg_dump`, pgvector column included. The drill is
synthetic on purpose; see
[`docs/backup-restore-drill.md`](./docs/backup-restore-drill.md) for why the real
backup is verified locally instead.

Two things about this that have caught people:

- `pnpm typecheck` can report green from the turbo cache. Use `--force` before
  claiming green on anything CI re-checks from scratch.
- Typecheck covers test files too (`tsc && tsc -p tsconfig.test.json`), so a
  bare `tsc --noEmit` is not the same check.

---

## How it is deployed

Not Docker, and not a VPS. **atlaslife.app is served from Riley's PC through a
Cloudflare Tunnel**: Cloudflare terminates TLS → tunnel → local Caddy
(`infra/Caddyfile.tunnel`) → `/api/*` to the API on :4000, everything else to
Next on :3000. One origin, which is what makes the session cookie work.

The stack is started **by hand** from `infra/Atlas Server.cmd`. It refuses to
start on a half-configured `.env` — placeholders, or a `DATABASE_URL` still
pointing at localhost, and it names the offending keys and starts nothing,
because booting with dev values would put an empty database behind the public
domain and quietly accept real signups into it.

`infra/atlas-health.ps1` runs every two minutes as a scheduled task and restarts
whatever died. It exists because the public origin depends on four local
processes and the app gives no sign when one of them stops.

**Anything that polls on a timer must not touch the database.** A health check
that ran `SELECT 1` plus an embedding sweep that scanned every sixty seconds
kept Neon's compute from ever suspending and burned a monthly quota in about a
week — after which it refused every query, reads included. The rule now is that
an idle API makes no database calls. See `docs/GOTCHAS.md`.

Moving to a VPS is `docker compose --profile full up -d` plus one DNS change —
see [`docs/ship-to-iphone.md`](./docs/ship-to-iphone.md).

---

## Where the work is

- [`docs/master-plan.md`](./docs/master-plan.md) — the commercial plan, four
  phases, with an explicit "do not build" list. **Read before proposing
  features.**
- [`docs/production-readiness.md`](./docs/production-readiness.md) — the
  authoritative list of known gaps, ordered by what blocks shipping, written
  from a 154-assertion API stress pass. It says what was measured rather than
  what was assumed.
- [`docs/GOTCHAS.md`](./docs/GOTCHAS.md) — solved traps. Read it before
  debugging.
- [`docs/architecture.md`](./docs/architecture.md),
  [`docs/data-model.md`](./docs/data-model.md),
  [`docs/module-guide.md`](./docs/module-guide.md) — how to add a domain.

---

## Licence

None yet. Private repository; all rights reserved.
