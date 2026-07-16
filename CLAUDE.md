# Atlas — Claude context anchor

**READ THIS FIRST, EVERY THREAD.** This file is the single source of truth for where the project is and what to do next. It is auto-loaded when a Claude thread starts in `C:\Users\riley\atlas`. Keep it accurate: **at the end of every work chunk, update the "Current status" and "NEXT ACTION" sections and append any new gotcha.** The approved foundation plan lives at `C:\Users\riley\.claude\plans\federated-gathering-tome.md`.

> Owner: Riley (rileyhinsperger@gmail.com). Global CLAUDE.md forces **caveman mode** for chat replies (terse; code/commits normal). Multi-week project. Riley may start each session in a fresh thread — this file must carry all context so no rabbit hole is re-hit.

## What Atlas is
Personal "Life OS": one unified data layer for tasks, calendar, habits, journal, finance, plus a cheap cross-domain AI (DeepSeek via OpenRouter) that briefs, auto-organizes messy input, nudges, chats over your life, and **asks you questions to fill its own gaps**. Self-hosted on a cheap VPS. Budget: AI credits < $5/mo. Accessible from phone + laptop (PWA).

Unique hook: silos become one graph; the AI curates its own knowledge by interviewing the user (`ai_questions` table surfaced as UI cards).

## Architecture spine (do not violate)
1. **Module = life-domain.** Each domain (tasks, calendar, …) is a self-contained NestJS module implementing `DomainModule` (`apps/api/src/core/domain-module.ts`): `aiContext(userId)` + `getToolSpecs()`, self-registers in `onModuleInit`. Adding a domain = copy `apps/api/src/modules/tasks/` shape. Core never changes.
2. **Connector = external API key.** Implements `Connector` (`packages/connectors/src/connector.ts`). Secrets stored AES-256-GCM encrypted in `credentials` table; a connector only gets a `ConnectorContext.getSecret()`. Registered in `ConnectorsService` (`apps/api/src/core/connectors.service.ts`).
3. **Unified timeline.** Every mutation also writes a `timeline_events` row via `TimelineService`. The AI reads this compact cross-domain log, never the whole DB.
4. **AI writes back.** `insights` + `ai_questions` are first-class tables so the AI accumulates knowledge cheaply. Cost is capped by `CostGuard` (`packages/ai/src/cost-guard.ts`) using `ai_usage` ledger + `AI_DAILY_TOKEN_CAP`.

## Stack + toolchain (verified on this machine)
- node v24, npm 11, **pnpm 11.13.1** (installed globally via npm), docker 29 + compose v5, git 2.53. Windows 11, PowerShell.
- TS monorepo: **pnpm workspaces + Turborepo**. **ESM everywhere.**
- API: **NestJS 11 (ESM), built with `tsc`** (see GOTCHA: not tsx). Prisma 6 + Postgres + pgvector. Web: **Next.js 15** PWA (React 19). Deploy: Docker Compose + Caddy; Cloudflare for DNS. AI: OpenRouter → `deepseek/deepseek-chat`.

## Repo map
```
packages/db        Prisma schema (FULL core model) + client singleton. Import DB ONLY via @atlas/db.
packages/shared    zod DTOs + enums + AI contracts (browser-safe, no DB import).
packages/connectors Connector interface + OpenRouterConnector (has chat()).
packages/ai        pricing, CostGuard, context-builder (token budgeting).
apps/api           NestJS. core/ (prisma,crypto,timeline,domain-module,connectors,health),
                   auth/ (scrypt+sessions+guard), modules/tasks (vertical slice), modules/ai (status+dry-run).
apps/web           Next 15. app/page.tsx = auth gate + Today (tasks). lib/api.ts = fetch wrapper.
infra/             (TODO) docker-compose, Caddyfile, Dockerfiles.
docs/              (TODO) architecture, data-model, roadmap, guides, ADRs, GOTCHAS.
```

## Current status (updated: 2026-07-15)
- ✅ Monorepo root config, pnpm workspaces, turbo, tsconfig.base, .env.example, .gitignore, .npmrc, prettier.
- ✅ `pnpm install` works (after allowBuilds fix). `pnpm build` → **all 5 backend packages/apps compile GREEN** (db, shared, connectors, ai, api).
- ✅ Prisma client generates. Schema complete: users, sessions, credentials, tasks, events, habits, habit_logs, goals, journal_entries, notes, accounts, transactions, timeline_events, embeddings (pgvector), insights, ai_questions, ai_usage.
- ✅ API code complete for Phase 0: health, auth (register/login/logout/me, scrypt, session cookie `atlas_session`), tasks CRUD writing timeline events, tasks AI adapter, AI status + `/ai/dry-run` (logs token estimate to ai_usage, $0 spend).
- ✅ Web code complete for Phase 0: login/register + Today screen (add/complete/delete tasks). **NOT yet built/typechecked** (`next-env.d.ts` not generated; run `pnpm --filter @atlas/web build` to check).
- ❌ NOT done: `infra/` (docker-compose + Caddyfile + Dockerfiles), first Prisma **migration** (no DB started yet), seed script, `docs/`, `README.md`, git commits. **Nothing verified end-to-end yet.**

## NEXT ACTION (start here)
1. **infra/docker-compose.yml** — services: `db` (image `pgvector/pgvector:pg17`, expose 5432, named volume, env `POSTGRES_*`), `api`, `web`, `caddy`. Make `docker compose up db` work standalone. Add `infra/Caddyfile` (`handle_path /api/*` → api:4000, `/` → web:3000, auto-HTTPS via `ATLAS_DOMAIN`), `apps/api/Dockerfile` + `apps/web/Dockerfile` (monorepo multi-stage: pnpm install → pnpm build → run `node dist/main.js` / `next start`).
2. **Create root `.env`** from `.env.example`. Generate secrets: `SESSION_SECRET` and `APP_ENCRYPTION_KEY` = 64 hex chars each (`openssl rand -hex 32` or node `crypto.randomBytes(32).toString('hex')`). For LOCAL dev set `DATABASE_URL=postgresql://atlas:...@localhost:5432/atlas?schema=public` (host=localhost, since db port is exposed).
3. Start db: `docker compose -f infra/docker-compose.yml up -d db`.
4. **First migration**: `cd packages/db; pnpm prisma migrate dev --name init`. ⚠️ VERIFY the generated migration `CREATE EXTENSION`s `vector` and `pgcrypto` FIRST (Prisma `postgresqlExtensions` preview should add them; if not, prepend `CREATE EXTENSION IF NOT EXISTS vector; CREATE EXTENSION IF NOT EXISTS pgcrypto;` to the migration SQL). pgvector image already ships the `vector` extension.
5. Build + run: `pnpm build` then in two shells `pnpm --filter @atlas/api dev` and `pnpm --filter @atlas/web dev`.
6. **Verify Phase 0**: `curl localhost:4000/health` → ok; register at `localhost:3000`; add a task; confirm a `timeline_events` row (`pnpm --filter @atlas/db studio`); `POST localhost:4000/ai/dry-run` with the session cookie → returns token estimate + writes an `ai_usage` row (no model call).
7. Write `docs/` + `README.md`, then `git add -A && git commit`.

After Phase 0 verified → Phase 1 (Google Calendar two-way, Habits, Journal, Notes), then Phase 2 (AI brain: orchestrator, chat, daily brief, auto-organize, ai_questions), Phase 3 (finance connector), Phase 4 (proactive). See plan file.

## GOTCHAS — already solved, do NOT rediscover
- **pnpm ignores dependency build scripts** (`ERR_PNPM_IGNORED_BUILDS`, Prisma engine missing). Fix: `pnpm-workspace.yaml` has an `allowBuilds:` map (pnpm 11 key) → `'@prisma/client': true`, `'@prisma/engines': true`, `prisma: true`. Already set. If a new dep needs a build script, add it there.
- **Node globals need per-package `@types/node`** (pnpm strict, no hoist). Missing → `TS2304: Cannot find name 'fetch'/'AbortSignal'/'process'`. Any package touching fetch/Buffer/process/crypto must list `@types/node` in its own devDependencies. Already added to db, ai, connectors, api.
- **Prisma `Json` columns reject `Record<string,unknown>`/`unknown`.** Cast at the prisma call to `Prisma.InputJsonValue` (`import type { Prisma } from '@atlas/db'`). Never put a `Date` in a JSON payload — use `.toISOString()`. Already handled in timeline.service, connectors.service, tasks.service.
- **NestJS must be built with `tsc`, never `tsx`/esbuild.** Nest DI relies on `emitDecoratorMetadata` (`design:paramtypes`), which esbuild/tsx do NOT emit → broken DI. So: ESM + tsc. Dev uses `concurrently` (tsc --watch + node --watch). Do not "optimize" api to tsx.
- **ESM discipline:** every package.json has `"type": "module"`; relative imports in `.ts` use `.js` extensions; packages export built `dist` (not src); turbo `^build` builds deps first. tsconfig.base is NodeNext.
- **PowerShell noise:** native commands' stderr gets wrapped as red `NativeCommandError` / a `pnpm.ps1` error block EVEN ON SUCCESS. Judge success by the actual ✔/output, not the red text. Don't use `2>&1` on native exes here.
- Working dir at launch is usually `C:\`; the project is at `C:\Users\riley\atlas` — `cd` there first.
```
```
