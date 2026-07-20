# Roadmap

Ship something usable early, then grow forever. Each phase adds modules/connectors following the guides — the core stays put.

## Phase 0 — Foundation ✅ DONE (verified)
Monorepo, DB schema, auth, unified timeline, cost guard, one full vertical slice (Tasks) through every layer, docs backbone, end-to-end verified (see `CLAUDE.md`).

## Phase 1 — Core domains ✅ DONE (verified)
- ✅ **Habits** (`modules/habits`) — CRUD + daily check-in + streaks.
- ✅ **Journal** + **Notes** — text entries, queued to `embeddings` for semantic memory.
- ✅ **Calendar** — `events` table, CRUD, timeline `event.*`. **Google Calendar connector still open** (see below).
- ✅ Web: tabbed nav + a screen per domain.

## Phase 2 — AI brain ✅ DONE (2026-07-17, verified live)
- ✅ **Orchestrator** (`apps/api/src/modules/ai/orchestrator.service.ts`): assembles context via `ModuleRegistryService.collectContext` + `buildContext` (token budget), calls the LLM via the **CostGuard** (assert cap → chat → record) on every round-trip, tool calls routed to module services by `ToolRouterService` (zod-validated).
- ✅ **Chat with your life** (`POST /ai/chat`), **daily brief** (`POST /ai/daily-brief` → `insights`), **auto-organize** brain-dump → tasks/events/journal/notes (`POST /ai/brain-dump`), **AI-generated `ai_questions`** (replaced the journal mood heuristic) + UI cards.
- ✅ Web: "Atlas AI" tab — connect-key form, chat, brain dump, daily brief + history.
- ✅ **Embeddings write + pgvector retrieval**, verified live: `LocalEmbedder` runs `bge-base-en-v1.5` in-process (768-dim, matching the column), `EmbeddingService` backfills pending rows + searches via `$queryRaw`, and `OrchestratorService` feeds the top matches into the chat prompt.
- **Provider notes:** chat uses **DeepSeek direct** (`api.deepseek.com`, `DeepSeekConnector`, model `deepseek-v4-flash`) — that's where the credits are. Cost is cache-aware; measured ~$0.00005/chat. **Embeddings are local** (no key, no cost, no data leaving the box); DeepSeek has no embeddings API, and a second paid provider wasn't worth it for vectors alone.

- ✅ **Backfill runs automatically** — a 60s `@Interval` sweep (`ScheduleModule`) embeds queued rows for all users; writes only queue, so they stay fast. The model is warmed at boot.

### Phase 2 leftovers
- Rolling summaries (context = per-module `aiContext()` + recent timeline + semantic recall; no rolling summarization yet).
- A dedicated Settings screen for connector keys (the DeepSeek key form currently lives in the Atlas AI tab).
- A proper Settings screen to manage connector API keys (the key form currently lives in the Atlas AI tab).

## Phase 3 — Finance ✅ (built 2026-07-19; sandbox-verify pending Plaid keys)
- ✅ Provider-agnostic `finance` domain (accounts + transactions + timeline + AI balances/cash-flow summary). Copies the `modules/tasks` shape; core untouched.
- ✅ **Plaid** connector (`packages/connectors/src/plaid.ts`, raw fetch, no SDK): Link token, public-token exchange, `/accounts/get`, `/transactions/sync` (cursor), `/item/remove`, sandbox public-token. Chosen over Flinks (enterprise-only) / Salt Edge (backup) — only self-serve aggregator with Canadian coverage. See `docs/adr/0005-plaid-finance-connector.md`.
- ✅ Pull-only reconciliation (`PlaidSyncService`), one bank = one credential (`label=itemId`), cursor in `meta`. Web: Settings Plaid card (react-plaid-link) + `/finance` page.
- ⏳ Live sandbox verify (`sandbox/public_token/create` → exchange → sync) once Riley adds `PLAID_CLIENT_ID`/`PLAID_SECRET`. Real Canadian bank = flip `PLAID_ENV=production` + Plaid approval.
- ⏳ Later: webhook auto-sync (needs public URL + JWT verify), spending insights from the AI, Flinks connector for deeper CA coverage.

## Phase 4 — Proactive + expand
- Scheduled jobs (nudges, weekly review) — add BullMQ + Redis when in-process `@nestjs/schedule` isn't enough.
- More connectors (weather, health), cross-domain insights.

## Productization track (commercial-grade — runs alongside, gates launch)
Atlas is meant to be **sold**. Before public launch these must land (see the "Definition of Done" in `CLAUDE.md`):
- **Test + CI:** ✅ foundation DONE (2026-07-16): Vitest wired into the monorepo (`pnpm test` via turbo); unit tests for pricing, context-builder, password util, CryptoService, habit streaks; GitHub Actions CI (`.github/workflows/ci.yml`) runs build/typecheck/test on push + PR to main. ✅ cost-guard + tool-loop + tool-router unit tests DONE (2026-07-17); ✅ tests are now covered by `pnpm typecheck` (each tested package has a `tsconfig.test.json`; the build config still excludes `test/` so tests never reach `dist`). Still open: one e2e happy-path per module (needs a test DB strategy).
- **Security hardening:** ✅ rate limiting (throttler), ✅ security headers (helmet), ✅ CSRF (sameSite=lax + origin check on mutations). Remaining: password strength rules + optional 2FA, an authz-scoping audit.
- **Robustness:** ✅ pagination on all list endpoints (hard cap 100), ✅ global error boundary, ✅ structured JSON logging + `x-request-id`. Remaining: error tracking (Sentry-class).
- **Billing:** Stripe subscriptions + plan gating.
- **Legal/data:** ✅ user data export + hard delete DONE (`modules/account`, verified live + in-browser 2026-07-17: export excludes all secrets; delete requires password re-auth and cascades every table). Still open: privacy policy + ToS pages.
- **UX polish pass:** loading/error/empty states, mobile-first responsive, a11y. **Full phased plan: `docs/ui-hardening-plan.md`** (6 phases from decomposing the monolith `page.tsx` → PWA/offline → brand). Blocked on 5 stack decisions in that doc.
Recommended timing: a dedicated **hardening pass after Phase 1 features**, then keep each new module at-bar.

## Deploy milestone (any time after Phase 1)
Stand up the VPS: Docker Compose `--profile full`, point Cloudflare DNS, Caddy HTTPS. Swap local Neon `DATABASE_URL` for the in-compose `db` service.

## Requested backlog (captured 2026-07-19 — do NOT start without picking up here)

### Fitness / workout tracking (new life-domain)
- New `modules/fitness` — copy the `modules/tasks`/`modules/finance` vertical-slice shape. Entities: exercises library (name, muscle group, equipment), workout sessions, sets (reps/weight), plus bodyweight + cardio. Writes `workout.*` timeline events; `summarize()` feeds the AI a training summary (volume, PRs, frequency). No AI write tools initially (same stance as finance).
- **UI: copy Strong / Hevy** — best-in-class workout logging, make it seamless/perfect. Required patterns: start-workout → add exercise from a searchable library → **log sets inline with previous-set ghost values prefilled**, big thumb tap targets, weight/reps steppers, **rest timer**, plate calculator, per-exercise **history + PR tracking**, reusable routine/template workouts. Minimal typing, mobile-first (it's a PWA). Hevy = most polished free reference; Strong = gold-standard logging flow.
- Progressive-overload charts per exercise (reuse `Sparkline`/`Heatmap` primitives).

### Synthesized life statistics (cross-domain analytics)
- A stats view showing long-term improvement across ALL domains at once: tasks completed, habit streaks, mood trend, spending trend, workout volume/PRs, journal sentiment — weekly/monthly/quarterly rollups + trend sparklines, and a composite "life score" or per-domain progress.
- Build on what exists: the unified `timeline_events` log + per-domain history endpoints (`/habits/history`, `/timeline`). Add aggregate rollup endpoints per domain; render with existing `Sparkline`/`Heatmap`/`ProgressRing`.
- AI angle: cross-domain correlation insights ("training up + mood up + spending down over 90 days") via the existing daily-brief/`insights` machinery — this is where the unified-timeline design finally pays off visibly.

### Timeline as the primary surface (idea — captured 2026-07-19)
- ✅ SHIPPED 2026-07-19 (UX v3 "The Stream" — see atlas-ui-vision.md v3 addendum). Original idea: Explore: make Timeline the home/primary tab — capture inline on it, act on items in place, scrub time, filter by domain — so "your life as one stream" is the core interaction, not a dashboard. Big UX rethink; revisit deliberately. The unified `timeline_events` backbone already exists.
- ✅ REFINED 2026-07-20 (UX v3.1 "feed-first" — see CLAUDE.md). Riley: "the timeline literally is not the app" — the feed was buried ~575px down behind a stacked dashboard. Fixed: the whole now-neighborhood (greeting/brief/habits/plan) collapsed into one ~134px `NowStrip`, so the feed now starts at 313px (first row 400px) — above-the-fold and primary. Onboarding first-run loop + a11y also fixed.
