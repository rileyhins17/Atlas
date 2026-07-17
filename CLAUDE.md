# Atlas — Claude context anchor

**READ THIS FIRST, EVERY THREAD.** This file is the single source of truth for where the project is and what to do next. It is auto-loaded when a Claude thread starts in `C:\Users\riley\atlas`. Keep it accurate: **at the end of every work chunk, update the "Current status" and "NEXT ACTION" sections and append any new gotcha.** The approved foundation plan lives at `C:\Users\riley\.claude\plans\federated-gathering-tome.md`.

> Owner: Riley (rileyhinsperger@gmail.com). Global CLAUDE.md forces **caveman mode** for chat replies (terse; code/commits normal). Multi-week project. Riley may start each session in a fresh thread — this file must carry all context so no rabbit hole is re-hit.
>
> **Git remote:** `origin` = https://github.com/rileyhins17/Atlas (**private**, GitHub account `rileyhins17`, gh CLI authed). **Push after every commit** (`git push`). `.env` is gitignored — never commit it.

## ⭐ COMMERCIAL-GRADE — permanent product bar (read every session)
Atlas is a product Riley intends to **sell** — build to a paid-SaaS standard, not a hobby project. Apply this without being asked.

**Definition of Done for every feature:**
- **Multi-tenant + authz:** every query scoped by `userId` (never trust client ids); one user can never read/write another's data.
- **Secure:** validate all input (zod at the boundary — already the pattern), rate-limit, security headers, CSRF protection for cookie-auth mutations, secrets encrypted (credentials already AES-GCM), no secrets in logs.
- **Robust:** typed errors, no unhandled rejections, pagination on list endpoints (no unbounded queries), sensible DB indexes.
- **Tested:** unit tests for logic (streaks, cost guard, crypto) + an e2e happy-path per module; CI runs build + typecheck + test.
- **Observable:** structured request logging with request ids; error tracking (Sentry-class) in prod.
- **Polished UX:** loading / error / empty states, responsive (mobile-first — it's a PWA), basic a11y, optimistic where it helps.
- **Legal/data:** sensitive data (journal, finance) → user-facing data export + hard delete; privacy policy + ToS before launch.
- **Billing (later):** Stripe subscription + plan gating.

**Already at bar:** unit tests (incl. cost-guard, tool loop, tool router) + GitHub Actions CI; tests covered by `pnpm typecheck` (per-package `tsconfig.test.json` — build config still excludes `test/` so tests never reach `dist`); rate limiting (`@nestjs/throttler`: 120/min global, 10/min login, 5/min register); security headers (helmet, JSON-only CSP); CSRF (sameSite=lax cookie + `OriginCheckMiddleware` on mutations); global error boundary (`AllExceptionsFilter` — no stack/internal leaks) + structured JSON request logging with `x-request-id` (`RequestIdMiddleware`); pagination on every list endpoint (shared `PaginationQuery`, hard cap 100); 1mb body limit; `trust proxy` for real client IPs behind Caddy.

**Known tracked debt (not yet at bar — see `docs/roadmap.md` Productization track):** no error tracking (Sentry-class) wired; no billing (Stripe) or legal (privacy/ToS, data export + hard delete); tests are unit-only — no e2e per module (needs a test DB strategy); 2FA + password strength rules absent. Embedding backfill/semantic search needs a separate **OpenRouter** credential (DeepSeek direct has no embeddings API) — not connected yet, so `/ai/embeddings/backfill` runs but fails per-row until one is added. Don't let this list grow silently — either build to bar or add the gap here.

## What Atlas is
Personal "Life OS": one unified data layer for tasks, calendar, habits, journal, finance, plus a cheap cross-domain AI (DeepSeek, called direct) that briefs, auto-organizes messy input, nudges, chats over your life, and **asks you questions to fill its own gaps**. Self-hosted on a cheap VPS. Budget: AI credits < $5/mo. Accessible from phone + laptop (PWA).

Unique hook: silos become one graph; the AI curates its own knowledge by interviewing the user (`ai_questions` table surfaced as UI cards).

## Architecture spine (do not violate)
1. **Module = life-domain.** Each domain (tasks, calendar, …) is a self-contained NestJS module implementing `DomainModule` (`apps/api/src/core/domain-module.ts`): `aiContext(userId)` + `getToolSpecs()`, self-registers in `onModuleInit`. Adding a domain = copy `apps/api/src/modules/tasks/` shape. Core never changes.
2. **Connector = external API key.** Implements `Connector` (`packages/connectors/src/connector.ts`). Secrets stored AES-256-GCM encrypted in `credentials` table; a connector only gets a `ConnectorContext.getSecret()`. Registered in `ConnectorsService` (`apps/api/src/core/connectors.service.ts`).
3. **Unified timeline.** Every mutation also writes a `timeline_events` row via `TimelineService`. The AI reads this compact cross-domain log, never the whole DB.
4. **AI writes back.** `insights` + `ai_questions` are first-class tables so the AI accumulates knowledge cheaply. Cost is capped by `CostGuard` (`packages/ai/src/cost-guard.ts`) using `ai_usage` ledger + `AI_DAILY_TOKEN_CAP`.

## Stack + toolchain (verified on this machine)
- node v24, npm 11, **pnpm 11.13.1** (installed globally via npm), docker 29 + compose v5, git 2.53. Windows 11, PowerShell.
- TS monorepo: **pnpm workspaces + Turborepo**. **ESM everywhere.**
- API: **NestJS 11 (ESM), built with `tsc`** (see GOTCHA: not tsx). Prisma 6 + Postgres + pgvector. Web: **Next.js 15** PWA (React 19). Deploy: Docker Compose + Caddy; Cloudflare for DNS. AI: **DeepSeek direct API** (`api.deepseek.com`, model **`deepseek-v4-flash`**) via `DeepSeekConnector` — chose direct over OpenRouter because Riley bought DeepSeek platform credits, not OpenRouter credits (see GOTCHAS). `OpenRouterConnector` still exists/registered for embeddings (DeepSeek has no embeddings API — verified: `POST /embeddings` → 404) but has no credential yet.

## Repo map
```
packages/db        Prisma schema (FULL core model) + client singleton. Import DB ONLY via @atlas/db.
packages/shared    zod DTOs + enums + AI contracts (browser-safe, no DB import).
packages/connectors Connector interface + chat.ts (shared OpenAI-compatible types) + OpenRouterConnector (chat+embed) + DeepSeekConnector (chat).
packages/ai        pricing, CostGuard, context-builder (token budgeting), tools.ts (wire-safe tool names), orchestrator.ts (runToolLoop — provider-agnostic tool-calling loop).
apps/api           NestJS. core/ (prisma,crypto,timeline,domain-module,connectors,health,memory),
                   auth/ (scrypt+sessions+guard), modules/tasks|habits|journal|notes|calendar (vertical slices),
                   modules/ai (OrchestratorService, ToolRouterService, EmbeddingService, AiQuestionsService, ai.controller).
apps/web           Next 15. app/page.tsx = auth gate + tabs (Today/Habits/Calendar/Journal/Notes/Atlas AI). lib/api.ts = fetch wrapper.
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
- ✅ **Tests + CI (added 2026-07-16 overnight):** Vitest in `packages/ai` + `apps/api` (tests live in each package's `test/` dir, excluded from tsc build; `pnpm test` runs all via turbo). 27 unit tests: pricing, context-builder, password util, CryptoService (env vars stubbed in `apps/api/test/setup.ts` — no DB needed), habit streaks. `computeStreak`/`dayKey` extracted to `apps/api/src/modules/habits/habits.util.ts` (pure, exported; service imports it — behavior unchanged). GitHub Actions CI at `.github/workflows/ci.yml` (build + typecheck + test, no DB). `.gitattributes` normalizes line endings to LF. `esbuild` added to `allowBuilds` (vitest dep).

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

## Phase 1 progress
- ✅ **Habits** (`modules/habits`): CRUD + daily check-in, streak logic. Web `HabitsPanel`.
- ✅ **Journal** (`modules/journal`): mood + tags, tailored (NOT a generic journal) — writes timeline, **auto-queues to semantic memory** (`MemoryService.queueForEmbedding` → `embeddings` row, `model="pending"`, Phase 2 backfills the vector), and **seeds an `ai_question`** when an entry is thin/low-mood. Web `JournalPanel`.
- ✅ **Notes** (`modules/notes`): durable "what Atlas should know about me" facts; `pinned` = always-in-context; queued to memory. `summarize()` surfaces pinned facts. Web `NotesPanel`.
- ✅ **AI-questions loop** (the unique hook) live: `MemoryService.askUser()` creates them; endpoints `GET /ai/questions`, `POST /ai/questions/:id/answer|dismiss` (`modules/ai/ai-questions.service.ts`); answers get queued to memory as `qa`. Web: `AtlasAsks` cards at top of the dashboard.
- New core service: **`core/memory.service.ts`** (`MemoryService`, global) — `queueForEmbedding`, `removeFromEmbeddings`, `askUser`. Use it from any AI-native domain.
- Verified: low-mood journal → question created → answered; `embeddings` has pending rows for journal/note/qa; `ai/status` domains = `["tasks","habits","journal","notes"]`.

- ✅ **Calendar** (`modules/calendar`) DONE + verified: events CRUD over the `events` table, timeline `event.*`, pagination-bounded list (`MAX_PAGE`), zod validation (endAt≥startAt → 400), `summarize()` = next events. Web `CalendarPanel` (datetime-local inputs). `ai/status` domains = `["tasks","habits","journal","notes","calendar"]` (all 5). **Google OAuth sync intentionally NOT built yet** (biggest/riskiest piece — deferred to a fresh session so it isn't left half-done).

## Phase 2 — the AI brain (done: 2026-07-17, verified live against Neon + real DeepSeek key)
- ✅ **DeepSeek direct connector** (`packages/connectors/src/deepseek.ts`) — Riley bought DeepSeek platform credits (not OpenRouter), so chat goes straight to `api.deepseek.com` (model `deepseek-v4-flash`). `OpenRouterConnector` kept for embeddings only. Shared OpenAI-compatible chat types factored into `packages/connectors/src/chat.ts` so both connectors reuse one response parser.
- ✅ **Real pricing + cache-aware costing** (`packages/ai/src/pricing.ts`): `deepseek-v4-flash` ($0.14/$0.28 per 1M in/out, $0.0028 cached-in) and `deepseek-v4-pro` ($0.435/$0.87, $0.003625 cached-in), per the official pricing docs (verified 2026-07-17). Cache hits flow connector → `ChatUsage.cachedPromptTokens` → `CostGuard.record()`. Measured live: **~47 micro-USD/chat (~$0.00005)** with ~95% of prompt tokens cache-hit — the <$5/mo budget is not remotely at risk.
- ✅ **`runToolLoop`** (`packages/ai/src/orchestrator.ts`) — provider-agnostic, DB-free multi-turn tool-calling loop (send → if tool_calls, execute + feed results back → repeat up to `maxIterations`). Unit-tested in isolation with fake `chat`/`executeTool`.
- ✅ **Wire-safe tool names** (`packages/ai/src/tools.ts`, `toWireToolName`/`fromWireToolName`): Atlas's tool specs are dotted (`tasks.create`) but DeepSeek's function-calling API rejects any name outside `^[a-zA-Z0-9_-]+$` — dots become `__` on the wire and are converted back before hitting `ToolRouterService`. Discovered via a live 400 during verification; if you add a provider, check this first before assuming dotted names work.
- ✅ **`OrchestratorService`** (`apps/api/src/modules/ai/orchestrator.service.ts`) — every model call (including each tool-loop round-trip) is individually `costGuard.assertUnderCap()` → `deepseek.chat()` → `costGuard.record()`. Methods: `chat()`, `organizeBrainDump()`, `generateQuestions()` (AI-generated `ai_questions`, replacing the old journal heuristic — see `journal.service.ts`), `generateDailyBrief()` (writes `insights`, then best-effort calls `generateQuestions`), `listInsights()`.
- ✅ **`ToolRouterService`** (`apps/api/src/modules/ai/tool-router.service.ts`) — validates tool-call args with the same zod DTOs the HTTP boundary uses, routes to `tasks.create/complete`, `habits.log`, `journal.add`, `notes.remember`, `calendar.add`, `ai.ask_question` (→ `MemoryService.askUser`). Unit-tested with fake services (no NestJS DI needed).
- ✅ **`EmbeddingService`** (`apps/api/src/modules/ai/embedding.service.ts`) — backfills `embeddings` rows (`model="pending"`) via OpenRouter's `/embeddings` endpoint (`dimensions: 768` to match the fixed `vector(768)` column), `search()` does pgvector cosine-ish `<->` similarity via `$queryRaw`. **Not connected yet** — see Known tracked debt; `/ai/embeddings/backfill` degrades gracefully (returns `{processed:0,failed:N}`) without an OpenRouter credential, verified live.
- ✅ Endpoints on `AiController`: `POST /ai/connect/deepseek`, `POST /ai/connect/openrouter`, `POST /ai/chat`, `POST /ai/brain-dump`, `POST /ai/daily-brief`, `GET /ai/insights`, `POST /ai/questions/generate`, `POST /ai/embeddings/backfill` (plus existing status/dry-run/questions CRUD).
- ✅ Web: new "Atlas AI" tab (`apps/web/app/page.tsx`) — connect-key form (shown until configured), `ChatPanel` (multi-turn, shows which tools ran), `BrainDumpPanel`, `DailyBriefPanel` (generate + history list).
- ✅ **Tests:** `packages/ai/test/cost-guard.test.ts` (mocks `@atlas/db`'s prisma singleton via `vi.mock`, closing the "no cost-guard tests" debt item), `orchestrator.test.ts` (tool loop: no-tool passthrough, single/multi tool call, failed tool execution fed back to the model, malformed JSON args, iteration cap), `tools.test.ts` (wire-name mapping), `pricing.test.ts` (v4 rates, cache-hit split, clamping). `packages/connectors/test/chat.test.ts` (usage/cache-token parsing, both DeepSeek + OpenAI shapes). `apps/api/test/tool-router.test.ts` (routing + zod validation per tool, unknown-tool rejection). 67 tests total, all green; `pnpm build`/`typecheck`/`test` all pass.
- ✅ **Verified live** against the Neon DB with Riley's real DeepSeek key: registered a test user, connected the key, ran `/ai/chat` (created a real task via tool call), multi-turn history recall, `/ai/brain-dump` (filed one input into a task + journal entry + pinned note across 3 domains in one call), `/ai/daily-brief` (wrote an `insights` row, then auto-generated 2 relevant `ai_questions` — no heuristic involved), confirmed `ai_usage` accumulated correctly (6997/200000 tokens) and stayed under `AI_DAILY_TOKEN_CAP`.

## NEXT ACTION — pick one (start here)
- **A) Decide the embeddings provider, then finish semantic memory.** DeepSeek has no embeddings API (verified 404), so `EmbeddingService` currently points at OpenRouter — but that means a second paid provider for one feature, which Riley reasonably questioned. Options: (1) **local in-process embeddings** (e.g. `@xenova/transformers`/fastembed — no key, no per-call cost, fits self-hosted + <$5/mo; must emit 768 dims to match the `vector(768)` column, else migrate it); (2) an OpenRouter key; (3) drop semantic search until it earns its place, and delete `OpenRouterConnector` + `EmbeddingService`. **Ask Riley before building.** Whatever wins, then verify `POST /ai/embeddings/backfill` + `EmbeddingService.search()` live — neither has ever run successfully.
- **B) Google Calendar two-way sync** — needs a **Google Cloud OAuth client id/secret**. Build `packages/connectors/src/google-calendar.ts` per `docs/connector-guide.md`: OAuth start + callback routes, `saveCredential` the tokens, `sync()` two-way against `events` using the `source`+`externalId` unique key. Add a Settings screen to connect Google.
- **C) Productization debt** (see "Known tracked debt" above): error tracking, Stripe billing, legal pages + data export/hard delete, e2e tests, 2FA/password rules.

Then Phase 3 (finance connector: SimpleFIN/Plaid), Phase 4 (proactive nudges). See `docs/roadmap.md` + the plan file.

## GOTCHAS — already solved, do NOT rediscover
- **pnpm ignores dependency build scripts** (`ERR_PNPM_IGNORED_BUILDS`, Prisma engine missing). Fix: `pnpm-workspace.yaml` has an `allowBuilds:` map (pnpm 11 key) → `'@prisma/client': true`, `'@prisma/engines': true`, `prisma: true`. Already set. If a new dep needs a build script, add it there.
- **Node globals need per-package `@types/node`** (pnpm strict, no hoist). Missing → `TS2304: Cannot find name 'fetch'/'AbortSignal'/'process'`. Any package touching fetch/Buffer/process/crypto must list `@types/node` in its own devDependencies. Already added to db, ai, connectors, api.
- **Prisma `Json` columns reject `Record<string,unknown>`/`unknown`.** Cast at the prisma call to `Prisma.InputJsonValue` (`import type { Prisma } from '@atlas/db'`). Never put a `Date` in a JSON payload — use `.toISOString()`. Already handled in timeline.service, connectors.service, tasks.service.
- **NestJS must be built with `tsc`, never `tsx`/esbuild.** Nest DI relies on `emitDecoratorMetadata` (`design:paramtypes`), which esbuild/tsx do NOT emit → broken DI. So: ESM + tsc. Dev uses `concurrently` (tsc --watch + node --watch). Do not "optimize" api to tsx.
- **ESM discipline:** every package.json has `"type": "module"`; relative imports in `.ts` use `.js` extensions; packages export built `dist` (not src); turbo `^build` builds deps first. tsconfig.base is NodeNext.
- **PowerShell noise:** native commands' stderr gets wrapped as red `NativeCommandError` / a `pnpm.ps1` error block EVEN ON SUCCESS. Judge success by the actual ✔/output, not the red text. Don't use `2>&1` on native exes here.
- Working dir at launch is usually `C:\`; the project is at `C:\Users\riley\atlas` — `cd` there first.
- **Docker Desktop crashes on boot at "Inference manager"** (its Model Runner/AI feature), then all `docker` calls hang. Fix: with Docker stopped, set `"EnableDockerAI": false` in `%APPDATA%\Docker\settings-store.json` and relaunch. Full detail in `docs/GOTCHAS.md`. Already applied.
- **DeepSeek's function-calling API rejects dotted tool names** (`Invalid 'tools[0].function.name': string does not match pattern '^[a-zA-Z0-9_-]+$'`). Atlas's tool specs use dots (`tasks.create`) for readability everywhere else, so `packages/ai/src/tools.ts` maps to `tasks__create` only at the provider boundary and back on the way in (`toWireToolName`/`fromWireToolName`). If you add a new provider, don't assume dotted names are safe — check its function-name pattern first.
- **OpenRouter vs. DeepSeek direct are different credentials/connectors.** `.env`'s `OPENROUTER_API_KEY` was a stale placeholder (always blank) — Riley actually bought DeepSeek platform credits, so chat uses `DeepSeekConnector` against `api.deepseek.com` with a `deepseek` credential (`POST /ai/connect/deepseek`). Note the id has no `deepseek/` prefix — that's the OpenRouter-style id. `OpenRouterConnector` is still registered and used for embeddings (`POST /ai/connect/openrouter`), since DeepSeek direct has no embeddings API (verified: `POST /embeddings` → 404). Don't conflate the two credential ids.
- **Use a concrete DeepSeek model id (`deepseek-v4-flash`), never the `deepseek-chat` alias.** The alias resolves server-side (currently → `deepseek-v4-flash`) and the API echoes the **resolved** id back, which is what `CostGuard.record()` writes to `ai_usage`. If the resolved id isn't in `MODEL_RATES`, every row silently prices at the FALLBACK rate — this actually happened (real cost ~47 micro-USD/chat was logged as 1020). Riley's account only exposes `deepseek-v4-flash` + `deepseek-v4-pro`; **legacy `deepseek-chat`/`deepseek-reasoner` are removed 2026-07-24.** When adding a model, add its rate at the same time.
- **DeepSeek prefix-cache hits are ~98% cheaper and Atlas hits them constantly** (~95% of prompt tokens, since every call re-sends the same context block). The API reports `prompt_cache_hit_tokens`; `parseChatCompletion` reads it into `ChatUsage.cachedPromptTokens` and `estimateCostMicros` bills it at `cachedInputMicros`. Ignoring it overstates spend ~3.5x. Fractional rates also need `toFixed(6)` before `Math.ceil`, or float noise adds a phantom micro.
```
```
