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

## Productization track (commercial-grade — runs alongside, gates launch)
Atlas is meant to be **sold**. Before public launch these must land (see the "Definition of Done" in `CLAUDE.md`):
- **Test + CI:** ✅ foundation DONE (2026-07-16): Vitest wired into the monorepo (`pnpm test` via turbo); unit tests for pricing, context-builder, password util, CryptoService, habit streaks; GitHub Actions CI (`.github/workflows/ci.yml`) runs build/typecheck/test on push + PR to main. Still open: cost-guard unit tests, one e2e happy-path per module.
- **Security hardening:** ✅ rate limiting (throttler), ✅ security headers (helmet), ✅ CSRF (sameSite=lax + origin check on mutations). Remaining: password strength rules + optional 2FA, an authz-scoping audit.
- **Robustness:** ✅ pagination on all list endpoints (hard cap 100), ✅ global error boundary, ✅ structured JSON logging + `x-request-id`. Remaining: error tracking (Sentry-class).
- **Billing:** Stripe subscriptions + plan gating.
- **Legal/data:** privacy policy + ToS, user data export + hard delete (journal/finance are sensitive).
- **UX polish pass:** loading/error/empty states, mobile-first responsive, a11y.
Recommended timing: a dedicated **hardening pass after Phase 1 features**, then keep each new module at-bar.

## Deploy milestone (any time after Phase 1)
Stand up the VPS: Docker Compose `--profile full`, point Cloudflare DNS, Caddy HTTPS. Swap local Neon `DATABASE_URL` for the in-compose `db` service.
