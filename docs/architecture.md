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
packages/ai  context-builder + CostGuard ─────────┘ (Phase 2: orchestrator → OpenRouter)
packages/connectors  Connector + OpenRouter client
packages/db  Prisma schema + client (import DB only via @atlas/db)
packages/shared  zod DTOs + enums + contracts (browser-safe, no DB)
```

## Key decisions
- **ESM everywhere, built with `tsc`.** NestJS DI needs `emitDecoratorMetadata`, which esbuild/tsx don't emit — so no tsx for the API. See `docs/adr/0001-foundational-stack.md`.
- **Cost control by construction.** Modules summarize (`aiContext`), the builder token-budgets, rolling summaries + embedding retrieval avoid re-sending history. Target: AI < $5/mo.
- **Single origin in prod.** Caddy serves the web app and strips `/api/*` to the API, so the browser is same-origin (no CORS, simple cookies). Local dev uses two ports + CORS.

## Deploy
Docker Compose on a cheap VPS: `db` (pgvector), `api`, `web`, `caddy` (auto-HTTPS). Cloudflare for DNS. Local dev currently uses **Neon** for Postgres because Docker Desktop is broken on the dev machine (see `docs/GOTCHAS.md`); production is unaffected.
