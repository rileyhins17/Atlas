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

## Current status (updated: 2026-07-16) — PHASE 0 COMPLETE ✅ (verified end-to-end)
- ✅ Monorepo + all 6 packages/apps build GREEN (`pnpm build`): db, shared, connectors, ai, api, web.
- ✅ Prisma schema migrated to a live DB. Migration `packages/db/prisma/migrations/*_init` created all 17 tables + `pgcrypto`/`vector` extensions + `embeddings.embedding vector(768)`.
- ✅ API verified over HTTP: `/health` ok, auth register/login/me/logout + 401 guard, tasks create/list/complete, `/ai/dry-run` (built context, logged 47 tokens to `ai_usage`, $0 spend), `/ai/status` (module registry reports domains `["tasks"]`).
- ✅ Persistence confirmed in DB: `timeline_events` got `task.created` + `task.completed` rows; `ai_usage` got the dry-run row. The unified-timeline backbone works.
- ✅ Web UI driven in a real browser: register → Today screen → add task → task persists and displays. Cross-port session cookie works.
- **LOCAL DB = Neon cloud Postgres** (Docker Desktop is broken on this machine — Model Runner crash, see GOTCHAS). `DATABASE_URL` in `.env` points at Neon. The VPS will use the Docker `db` service instead (Linux dockerd has no such bug). Neon has pgvector, so it's a faithful dev DB.
- ✅ Docs backbone written: `README.md`, `docs/architecture.md`, `docs/data-model.md`, `docs/roadmap.md`, `docs/module-guide.md`, `docs/connector-guide.md`, `docs/GOTCHAS.md`, `docs/adr/`.

## How to run locally (verified working)
```
pnpm install
# .env already exists with Neon DATABASE_URL + generated secrets (gitignored).
pnpm build
# API (loads ../../.env via --env-file-if-exists):
pnpm --filter @atlas/api dev      # http://localhost:4000
# Web (separate shell):
pnpm --filter @atlas/web dev      # http://localhost:3000
```
Migrations: `cd packages/db` then set `$env:DATABASE_URL` from `.env` and run `pnpm exec prisma migrate dev`.

## NEXT ACTION — Phase 1 (start here)
Add the next life-domains, each as a module copying the **`apps/api/src/modules/tasks/` shape** (service + controller + `*.ai.ts` DomainModule adapter + module) and following `docs/module-guide.md`:
1. **Habits** (`modules/habits`): CRUD habits + daily log; timeline `habit.logged`; aiContext = streak summary. Simplest next slice — start here.
2. **Journal** (`modules/journal`) + **Notes** (`modules/notes`): entries with tags; timeline events; aiContext = recent-entry summary. (These feed embeddings in Phase 2.)
3. **Calendar** (`modules/calendar`): the `events` table + a **Google Calendar connector** (`packages/connectors/src/google-calendar.ts`) for two-way sync — the first real external connector; use the OAuth flow, store tokens via `ConnectorsService.saveCredential`.
4. Add a web screen per domain (tabs/nav in `apps/web`).
Then Phase 2 (AI brain: orchestrator that actually calls OpenRouter with the cost guard, chat, daily brief, auto-organize, `ai_questions` UI cards), Phase 3 (finance connector: SimpleFIN/Plaid), Phase 4 (proactive nudges). See `docs/roadmap.md` + the plan file.

## GOTCHAS — already solved, do NOT rediscover
- **pnpm ignores dependency build scripts** (`ERR_PNPM_IGNORED_BUILDS`, Prisma engine missing). Fix: `pnpm-workspace.yaml` has an `allowBuilds:` map (pnpm 11 key) → `'@prisma/client': true`, `'@prisma/engines': true`, `prisma: true`. Already set. If a new dep needs a build script, add it there.
- **Node globals need per-package `@types/node`** (pnpm strict, no hoist). Missing → `TS2304: Cannot find name 'fetch'/'AbortSignal'/'process'`. Any package touching fetch/Buffer/process/crypto must list `@types/node` in its own devDependencies. Already added to db, ai, connectors, api.
- **Prisma `Json` columns reject `Record<string,unknown>`/`unknown`.** Cast at the prisma call to `Prisma.InputJsonValue` (`import type { Prisma } from '@atlas/db'`). Never put a `Date` in a JSON payload — use `.toISOString()`. Already handled in timeline.service, connectors.service, tasks.service.
- **NestJS must be built with `tsc`, never `tsx`/esbuild.** Nest DI relies on `emitDecoratorMetadata` (`design:paramtypes`), which esbuild/tsx do NOT emit → broken DI. So: ESM + tsc. Dev uses `concurrently` (tsc --watch + node --watch). Do not "optimize" api to tsx.
- **ESM discipline:** every package.json has `"type": "module"`; relative imports in `.ts` use `.js` extensions; packages export built `dist` (not src); turbo `^build` builds deps first. tsconfig.base is NodeNext.
- **PowerShell noise:** native commands' stderr gets wrapped as red `NativeCommandError` / a `pnpm.ps1` error block EVEN ON SUCCESS. Judge success by the actual ✔/output, not the red text. Don't use `2>&1` on native exes here.
- Working dir at launch is usually `C:\`; the project is at `C:\Users\riley\atlas` — `cd` there first.
- **Docker Desktop crashes on boot at "Inference manager"** (its Model Runner/AI feature), then all `docker` calls hang. Fix: with Docker stopped, set `"EnableDockerAI": false` in `%APPDATA%\Docker\settings-store.json` and relaunch. Full detail in `docs/GOTCHAS.md`. Already applied.
```
```
