# Architecture

Atlas is a TypeScript monorepo. One database, one API, one web app, a background of shared packages. The design optimizes for **adding life-domains and integrations forever without touching the core**.

## The four load-bearing ideas
1. **Module = life-domain.** Each domain is a NestJS module implementing `DomainModule` (`aiContext()` + `getToolSpecs()`), self-registering into `ModuleRegistryService`. The AI brain reads the registry; it never hard-codes domains. See `docs/module-guide.md`.
2. **Connector = external API.** Each integration implements `Connector`; secrets are AES-256-GCM encrypted in `credentials`. See `docs/connector-guide.md`.
3. **Unified timeline.** Every meaningful mutation writes a `timeline_events` row (`TimelineService`). This append-only, cross-domain log is what the AI reads to "keep tracking your life" — compact, not the whole DB.
4. **AI writes back.** `insights` (derived knowledge, rolling summaries) and `ai_questions` (the AI's questions to the user) are first-class tables. Spend is bounded by `CostGuard` + the `ai_usage` ledger + `AI_DAILY_TOKEN_CAP`.

## Layers (request → data)
```
apps/web (Next.js PWA)
   │  fetch (cookie session), lib/api.ts
   ▼
apps/api (NestJS)
   controllers → services → PrismaService → Postgres
                     │
                     ├─ TimelineService.write()  (unified log)
                     └─ *.ai.ts DomainModule → ModuleRegistryService
                                                   │
   modules/ai  OrchestratorService ───────────────┘
                 │  collectContext + buildContext (token budget)
                 │  CostGuard.assertUnderCap → chat → CostGuard.record   (every round-trip)
                 ├─ runToolLoop (packages/ai) ──→ ToolRouterService → domain services
                 └─ EmbeddingService → embeddings (pgvector, $queryRaw)
packages/ai  context-builder + CostGuard + runToolLoop + wire-safe tool names
packages/connectors  Connector + DeepSeek client (chat) + OpenRouter client (chat, embeddings)
packages/db  Prisma schema + client (import DB only via @atlas/db)
packages/shared  zod DTOs + enums + contracts (browser-safe, no DB)
```

## The AI brain (Phase 2)
`OrchestratorService` is the only thing that talks to a model. It:
1. Assembles context from every registered domain (`collectContext`) and packs it under a token budget (`buildContext`) — modules summarize, the builder caps.
2. Calls the provider through `CostGuard` on **every** round-trip, including each turn of a tool-calling conversation, so spend can't slip past `AI_DAILY_TOKEN_CAP`.
3. Delegates the tool-calling loop to `runToolLoop` (`packages/ai/src/orchestrator.ts`) — provider-agnostic and DB-free, so it's unit-testable with fake `chat`/`executeTool` functions. Tool calls land in `ToolRouterService`, which re-validates arguments with the same zod DTOs the HTTP boundary uses: **the model is an untrusted caller**.

Tool names are dotted (`tasks.create`) everywhere in Atlas, but some providers reject non-alphanumeric function names, so `packages/ai/src/tools.ts` maps them to a wire-safe form (`tasks__create`) at the provider boundary only.

**Provider split:** chat runs on **DeepSeek direct** (`api.deepseek.com`, model `deepseek-v4-flash`) via `DeepSeekConnector`, because that's where the credits are. Embeddings are **undecided** — DeepSeek has no embeddings endpoint, so `EmbeddingService` currently targets `OpenRouterConnector`, but a local in-process model would avoid a second provider entirely. Both connectors speak the same OpenAI-compatible shape and share one response parser (`packages/connectors/src/chat.ts`), so swapping or adding providers is a connector, not a refactor.

**Costing.** Always configure a concrete model id, never a provider alias: the API echoes back the *resolved* id, and that's what gets priced — an unknown id silently falls back to a placeholder rate. DeepSeek's prefix cache discounts repeated input ~98%, and Atlas re-sends the same context block every call (~95% cache-hit in practice), so `ChatUsage.cachedPromptTokens` is threaded from the connector into `estimateCostMicros`. Ignoring it overstates spend several-fold.

## Key decisions
- **ESM everywhere, built with `tsc`.** NestJS DI needs `emitDecoratorMetadata`, which esbuild/tsx don't emit — so no tsx for the API. See `docs/adr/0001-foundational-stack.md`.
- **Cost control by construction.** Modules summarize (`aiContext`), the builder token-budgets, and every model call is cap-checked + ledgered. Rolling summaries + embedding retrieval (to avoid re-sending history) are designed but not yet wired into the prompt. Target: AI < $5/mo.
- **Single origin in prod.** Caddy serves the web app and strips `/api/*` to the API, so the browser is same-origin (no CORS, simple cookies). Local dev uses two ports + CORS.

## Deploy
Docker Compose on a cheap VPS: `db` (pgvector), `api`, `web`, `caddy` (auto-HTTPS). Cloudflare for DNS. Local dev currently uses **Neon** for Postgres because Docker Desktop is broken on the dev machine (see `docs/GOTCHAS.md`); production is unaffected.
