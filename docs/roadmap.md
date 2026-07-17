# Roadmap

Ship something usable early, then grow forever. Each phase adds modules/connectors following the guides — the core stays put.

## Phase 0 — Foundation ✅ DONE (verified)
Monorepo, DB schema, auth, unified timeline, cost guard, one full vertical slice (Tasks) through every layer, docs backbone, end-to-end verified (see `CLAUDE.md`).

## Phase 1 — Core domains (next)
- **Habits** (`modules/habits`) — start here, simplest.
- **Journal** + **Notes** — text entries (feed embeddings later).
- **Calendar** — `events` table + **Google Calendar connector** (OAuth, two-way sync). First real external connector.
- Web: nav + a screen per domain.

## Phase 2 — AI brain
- **Orchestrator** in `apps/api/src/modules/ai`: assemble context (`ModuleRegistryService.collectContext` + retrieval + rolling summary), call OpenRouter via the **CostGuard** (assert cap → chat → record), tool-calling routed to module services.
- **Chat with your life**, **daily brief** (`insights`), **auto-organize** brain-dump → tasks/events/notes, **`ai_questions`** generation + UI cards, embeddings write + pgvector retrieval.
- Settings screen to manage connector API keys.

## Phase 3 — Finance
- Finance connector (SimpleFIN Bridge or Plaid dev), transaction sync, spending insights.

## Phase 4 — Proactive + expand
- Scheduled jobs (nudges, weekly review) — add BullMQ + Redis when in-process `@nestjs/schedule` isn't enough.
- More connectors (weather, health), cross-domain insights.

## Deploy milestone (any time after Phase 1)
Stand up the VPS: Docker Compose `--profile full`, point Cloudflare DNS, Caddy HTTPS. Swap local Neon `DATABASE_URL` for the in-compose `db` service.
