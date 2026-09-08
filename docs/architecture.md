# Architecture

Atlas is a TypeScript monorepo. One database, one API, one web app, a background of shared packages. The design optimizes for **adding life-domains and integrations forever without touching the core**.

## The four load-bearing ideas
1. **Module = life-domain.** Each domain has a NestJS adapter extending `RegisteredDomainModule`, which implements the shared `DomainModule` contract (`aiContext()` + `getToolSpecs()`). Registration and summary packaging have one implementation; domains supply their metadata, summarizing service and tools. The AI brain reads `ModuleRegistryService`; it never hard-codes domains. See `docs/module-guide.md`.
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
                 └─ EmbeddingService → LocalEmbedder (in-process, no key)
                                     → embeddings (pgvector, $queryRaw)
packages/ai  CostGuard + runToolLoop + LocalEmbedder
packages/connectors  Connector + DeepSeek client (chat)
packages/db  Prisma schema + client (import DB only via @atlas/db)
packages/shared  zod DTOs + contracts + pure domain/provider calculations (browser-safe, no DB)
```

## The AI brain (Phase 2)

`DomainModule`, context ordering, token estimation and context packing live in
`packages/shared`. The API base adapter handles framework lifecycle and calls
the owner-scoped service. `packages/ai/src/context-builder.ts` retains a
compatibility export; there is one implementation and its existing tests now
live beside it in shared. Domain ids, context titles/priorities and all ten
tool-spec bodies are unchanged by this consolidation. The ten-adapter contract
suite passed before and after it.

Plan-reply parsing, habit streaks, configured token-cost arithmetic, tool-name
conversion and tool-call fingerprints also live in shared. Existing API/AI
paths re-export them for compatibility. The habit API supplies the current
date explicitly; the shared calculation owns no clock and preserves the
existing UTC habit-day semantics. Provider prices and fingerprint normalization
are unchanged. The 30 existing calculation tests moved alongside their code;
the orchestrator still tests deduplication and provider failures at its boundary.
Other pure application calculations still need migration before Phase 2 is done.

Statistics assembly and Progress derivation now share the same package too:
`stats-assemble.ts` zero-fills day buckets and splits current/previous totals;
`progress.ts` computes trend series; `what-changed.ts` ranks measured changes;
and `money.ts` owns signed minor-unit display formatting. Existing API/web paths
re-export these functions. The 51 existing tests moved alongside them without
changing their assertions. SQL aggregation, query hooks and React rendering
stay in their application layers. Locale defaults and existing display wording
are preserved in this architecture pass.

Calendar bucketing, overlap placement, day-canvas assembly, event-draft
conversion and local-calendar arithmetic live in shared as well. The web
`lib/dates.ts` adapter retains the display-timezone state and default clock;
shared formatters take those values as explicit inputs. Web callers still use
`addDays` through that adapter. Calendar duration formatting remains separate
from task-duration formatting (`formatCalendarDuration`), preserving both
existing output contracts. One hundred pure tests moved to shared, including
the Toronto DST cases; timezone-state and auth-sync tests remain in web.

Task filtering and quick-add horizons, capture intent, exercise-picker ordering,
navigation destination matching and greeting-name derivation also live in
shared. Web modules retain compatibility exports. These moves preserve their
existing rules and all 51 existing tests; they do not redesign navigation or
change the capture heuristic during the architecture phase.

Onboarding routine construction, feed grouping/routing, install eligibility and
theme palette/contrast calculations are shared too. `readEnv()` stays in the web
install adapter; DOM theme application and local storage stay in web. The 219
existing calculation tests moved to shared, while install-prompt and palette
picker component tests remain in web. This move preserves the existing theme
algorithm and palette output; rendered accessibility still requires the Phase 3
browser audit and is not established by contrast arithmetic alone.

Task horizon groups and quick-add eligibility, transaction-day groups and habit
week cells are defined in `domain-grouping.ts`. Their panel components import
the calculations and retain compatibility exports. Eight existing tests and
two transaction-ordering characterization tests live in shared; all ten passed
against the original component implementations before extraction. Grouping
labels, ordering, date boundaries and input-preservation behavior are unchanged.

Numeric field nudges, activity thresholds, empty-series detection, tool-run
summaries, canvas item/remaining-time text, duration/week labels and mood-check-in
wording now live in `component-calculations.ts`. React components retain rendering
and effects. Ten characterization assertions passed against the original
component functions and are retained as five shared tests; the existing
component suites continue to exercise their consumers. Distinct duration
formats remain distinct, preserving existing wording.

The shared connector transformations parse chat completions, normalize Plaid
amounts/account types/currencies, and convert Google Calendar date shapes.
Connectors retain compatibility exports plus HTTP calls, cancellation options,
OAuth token lifecycle, secret persistence and pagination. In particular,
`AbortSignal` stays at the network boundary: shared has no dependency on browser
or Node cancellation globals. Eighteen existing parsing/conversion tests moved
to shared; request, refresh and timeout tests remain in connectors.

`OrchestratorService` is the only thing that talks to a model. It:
1. Assembles context from every registered domain (`collectContext`) and packs it under a token budget (`buildContext`) — modules summarize, the builder caps.
2. Calls the provider through `CostGuard` on **every** round-trip, including each turn of a tool-calling conversation, so spend can't slip past `AI_DAILY_TOKEN_CAP`.
3. Delegates the tool-calling loop to `runToolLoop` (`packages/ai/src/orchestrator.ts`) — provider-agnostic and DB-free, so it's unit-testable with fake `chat`/`executeTool` functions. Tool calls land in `ToolRouterService`, which re-validates arguments with the same zod DTOs the HTTP boundary uses: **the model is an untrusted caller**.

Tool names are dotted (`tasks.create`) everywhere in Atlas, but some providers reject non-alphanumeric function names. The shared `ai-tools.ts` maps them to a wire-safe form (`tasks__create`) at the provider boundary; `packages/ai/src/tools.ts` retains compatibility exports.

**Provider split — chat is remote, memory is local.** Chat runs on **DeepSeek direct** (`api.deepseek.com`, model `deepseek-v4-flash`) via `DeepSeekConnector`, because that's where the credits are; connectors speak an OpenAI-compatible shape and share one response parser (`packages/shared/src/chat.ts`, re-exported by connectors), so swapping or adding a chat provider is a connector, not a refactor. **Embeddings run locally in-process** (`LocalEmbedder`, `bge-base-en-v1.5`, 768-dim to match the `vector(768)` column): DeepSeek offers no embeddings endpoint, and paying a second provider purely for vectors would undercut both the <$5/mo target and the self-hosted premise. Local embedding is free and offline, so — unlike every chat path — `EmbeddingService` has no cost guard: there is no spend to bound.

**Semantic recall.** `MemoryService.queueForEmbedding` writes rows with `model="pending"`; `EmbeddingService.backfillPending` fills in the vectors. On chat, `OrchestratorService` embeds the user's message and appends the nearest memories (under a distance threshold) to the prompt. This is the piece module summaries can't cover: summaries describe *current state*, while recall surfaces an old journal entry or note that's topically relevant right now. Retrieval is best-effort — if it fails, chat proceeds without it.

**Costing.** Always configure a concrete model id, never a provider alias: the API echoes back the *resolved* id, and that's what gets priced — an unknown id silently falls back to a placeholder rate. DeepSeek's prefix cache discounts repeated input ~98%, and Atlas re-sends the same context block every call (~90-95% cache-hit in practice), so `ChatUsage.cachedPromptTokens` is threaded from the connector into `estimateCostMicros`. Ignoring it overstates spend several-fold.

**Prompt layout is a cost decision, not a style one.** Because the discount is prefix-based, prompts are ordered **static instructions → module context → history → user message**, with anything that varies per request (semantic recall) appended to the *last* message. Recall in the system prompt measured 0% cache-hit; the same content at the end measured ~92%. Nothing errors when this is wrong — the bill just triples — so keep volatile content last and re-measure after touching prompt assembly.

## Key decisions
- **ESM everywhere, built with `tsc`.** NestJS DI needs `emitDecoratorMetadata`, which esbuild/tsx don't emit — so no tsx for the API. See `docs/adr/0001-foundational-stack.md`.
- **Cost control by construction.** Modules summarize (`aiContext`), the builder token-budgets, and every model call is cap-checked + ledgered. Rolling summaries + embedding retrieval (to avoid re-sending history) are designed but not yet wired into the prompt. Target: AI < $5/mo.
- **Single origin in prod.** Caddy serves the web app and strips `/api/*` to the API, so the browser is same-origin (no CORS, simple cookies). Local dev uses two ports + CORS.

## Deploy
Docker Compose on a cheap VPS: `db` (pgvector), `api`, `web`, `caddy` (auto-HTTPS). Cloudflare for DNS. Local dev currently uses **Neon** for Postgres because Docker Desktop is broken on the dev machine (see `docs/GOTCHAS.md`); production is unaffected.

## Explicit clocks for display calculations

`packages/shared/src/clock-labels.ts` owns canvas day/span labels, calendar hour ticks, workout recency and elapsed-session labels, and routine weekday descriptions. Web adapters supply the current clock and configured display timezone. Calendar-day comparisons and the local-midnight special case retain their existing runtime-local semantics. Thirteen characterization assertions were observed against the original functions before extraction; six shared tests retain those cases and cover explicit-clock immutability and display-zone formatting. Phase 2 remains in progress: API serialization and the cumulative pure-logic audit are still outstanding.

## Response serialization

`packages/shared/src/response-serialization.ts` defines explicit public response mapping for tasks, accounts, transactions, stored events, journal entries, notes, goals, routine blocks, AI questions and insights. Its input types are structural records derived from DTO fields with Date/bigint overrides, with no Prisma dependency. Services retain ownership-scoped reads, validation and writes. The mappings preserve existing date/null handling, signed minor-unit conversion and legacy goal fallbacks. Seven characterization cases (eleven assertions) passed against the original mapper bodies before rewiring services; the same cases now run in shared. Forty related API tests also passed before extraction. Fitness/settings serialization and other remaining pure helpers still need the Phase 2 audit.

## Remaining service calculations

`fitness-serialization.ts` owns exercise/set/workout/template responses; `service-calculations.ts` owns settings normalization, timezone validation, recurrence projection, routine date-key/clock arithmetic, text summaries, export formatting, statistics row tagging and batching. Inputs remain structural types, with database reads, clocks, logging and network calls in service adapters. The exercise catalog and its nine taxonomy tests now live in shared as well. Eleven characterization cases (26 assertions) passed against original service helper bodies before extraction; all 336 API tests passed before rewiring. The architecture audit still needs to inspect inline domain calculations and tool-input normalization before its cumulative gate.
