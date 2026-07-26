# Atlas — context anchor

**Read this first, every thread.** This describes what Atlas *is now*, not how it got here. Git history is the changelog; this file is the map. Keep it that way — when you finish a chunk of work, update the relevant section **in place** rather than appending another dated entry.

> Owner: Riley (rileyhinsperger@gmail.com). The global CLAUDE.md forces **caveman mode** for chat replies — terse. Code, comments, commits and PRs are always normal English.
>
> **Remote:** `origin` = https://github.com/rileyhins17/Atlas (private). Work on `claude/session-check-in-mbo5om`, keep `main` fast-forwarded to it, push both. `.env` is gitignored — never commit it.

---

## What Atlas is

A personal **Life OS** that Riley intends to sell. One data layer for tasks, calendar, habits, journal, notes, finance and fitness, plus a cheap cross-domain AI that briefs you, files messy input, plans your day, and interviews you to fill its own gaps.

**The hook:** the silos become one graph. Nothing else knows your sleep schedule, your training volume and your overdue tasks at the same time.

**Build to a paid-SaaS standard without being asked.** Every feature: userId-scoped queries, zod at the boundary, pagination on lists, typed errors, loading/empty/error states, mobile-first, tested, accessible.

---

## Live deployment

**https://atlaslife.app** — served from Riley's PC through a Cloudflare Tunnel.

Cloudflare terminates TLS → tunnel → local Caddy (`infra/Caddyfile.tunnel`) → `/api/*` to the API on :4000, everything else to Next on :3000. **One origin**, which is what makes the session cookie work. `infra/start-atlas.cmd` lives in the Windows Startup folder and is idempotent — it kills existing processes first, because cloudflared has no port to collide on and re-running used to stack up tunnels.

- Sign-up is **closed** via `INVITE_CODE` in `.env`. `GET /auth/config` exposes only the boolean, never the code.
- **The PC must be awake and logged in.** Fine for one person testing; not somewhere anyone else's data should live. Moving to a VPS is `docker compose --profile full up -d` plus one DNS change — see `docs/ship-to-iphone.md`.
- The database is **Neon** (cloud Postgres + pgvector), not the compose `db` service.

---

## Architecture — do not violate

1. **Module = life domain.** Each implements `DomainModule` (`apps/api/src/core/domain-module.ts`): `aiContext(userId)` + `getToolSpecs()`, self-registering in `onModuleInit`. Adding a domain means copying the shape of `modules/tasks/`; core never changes.
2. **Connector = external API key.** Implements `Connector`; secrets are AES-256-GCM encrypted in `credentials`. Connectors get `getSecret()` and have **no DB access** — reconciliation lives in the owning module.
3. **Unified timeline.** Every mutation also writes a `timeline_events` row. The AI reads that compact cross-domain log, never the whole database.
4. **AI writes back.** `insights` and `ai_questions` are first-class tables, so knowledge accumulates cheaply. Spend is capped by `CostGuard` against the `ai_usage` ledger.

### Stack
pnpm workspaces + Turborepo · ESM everywhere · NestJS 11 built with **tsc** (never tsx — DI needs `emitDecoratorMetadata`) · Next.js 15 PWA · Prisma 6 + Neon + pgvector · DeepSeek direct (`deepseek-v4-flash`) · embeddings **local and in-process** (`Xenova/bge-base-en-v1.5`, 768-dim, no key, no per-call cost).

```
packages/db          Prisma schema + client. Import the DB only via @atlas/db.
packages/shared      zod DTOs, enums, AI contracts, and PURE domain logic
                     (recurrence, fitness maths, duration). Browser-safe.
packages/connectors  Connector interface, DeepSeek, Google Calendar, Plaid.
packages/ai          pricing, CostGuard, context-builder, wire-safe tool names,
                     runToolLoop, LocalEmbedder.
apps/api             NestJS. core/ + auth/ + modules/{tasks,habits,journal,notes,
                     calendar,finance,fitness,routine,stats,timeline,push,
                     settings,account,ai}.
apps/web             Next 15. app/ routes, components/{canvas,panels,atlas,ui,
                     onboarding,stream,fitness}, lib/ (api client, hooks, pure logic).
infra/               Caddyfile, Caddyfile.tunnel, docker-compose.yml, start-atlas.cmd.
docs/                architecture, data-model, roadmap, guides, ADRs, GOTCHAS.
```

**Pure logic belongs in `packages/shared`, not in an app.** The fitness maths and the recurrence engine are shared so the UI and the API compute identically from one implementation.

---

## The surfaces

- **`/` landing** — the only public page. Server-rendered, no client JS, ~750 indexable words. `robots.ts` disallows every app route, because they return the sign-in gate to a bot.
- **`/today`** — the day as an overview: what is happening now, what is next, free-time windows, a checklist, then earlier items and the full hour-by-hour canvas on demand. Driven by `lib/canvas.ts` (`buildDayCanvas` → `buildDayOverview`), pure and unit-tested.
- **`/tasks` `/calendar` `/habits` `/journal` `/notes` `/fitness` `/finance`** — domain views.
- **`/progress`** — cross-domain statistics with deltas against the previous window.
- **`/history`** — the raw timeline feed.
- **`/settings`** — collapsible sections. **Your week** (the routine editor) is what makes Today's free-time calculation correct, so it opens by default.

**Ambient AI, not a tab:** ⌘K command bar (capture / ask / jump), ⌘J chat rail, and a capture dock on every page.

---

## Current state

Green at the last commit: build 6/6 · typecheck 10/10 · lint clean · **371 unit tests** · **e2e 21/21** (Playwright + axe) · axe clean across phone-light, phone-dark and desktop-light.

### Known gaps — tracked, not hidden
**`docs/production-readiness.md` is the authoritative list**, written from a 154-assertion API stress
pass and a full-route UI pass. It is ordered by what blocks shipping and says what was measured
rather than assumed. Read it before planning any "make it production ready" work.

The short version of what is STILL open:
- **Rotate the Plaid production secret** — it was pasted into a chat transcript. Needs Riley's Plaid
  login; nobody else can do it.
- **`SENTRY_DSN` is unset**, so the error reporting that is now wired in reports nothing.
- **Unverified live:** Google Calendar token refresh and delete propagation; Plaid production.
- **Offline renders a blank page**, on a PWA meant for an iPhone home screen.
- The Plaid webhook does not verify Plaid's signature (harmless while it is a no-op).

Done and verified: legal pages, error-reporting plumbing, input bounds, double-submit, RRULE
validation, and the account purge (440 → 3).

**The database has 3 accounts.** Riley's two, plus `aidanmageebusiness@gmail.com` — a real third
person with their own DeepSeek key. Do not purge by email pattern: `phase2-test@example.com` looked
like junk and held the only live Google Calendar credential (since moved to
`rileyhinsperger16@gmail.com`). Always dry-run a destructive query and read the output.

Cross-user isolation was stress-tested across every module and is clean — user B cannot reach user
A's rows by any route tried.

### Layering rule (learned the hard way)
`.dialog-overlay` is z-80 and every modal surface must sit at **z-81** — `.dialog-content`,
`.command-bar`, `.asks-panel`. Anything rendered behind that overlay but left below it becomes
unclickable. The full scale is documented above `.dialog-overlay` in `globals.css`.

### What to build next
`docs/atlas-next-ideas.md` is the prioritised roadmap and also lists what **not** to build. Tier 1 remaining: **energy-aware placement** and **one-tap "running 30 minutes late"**. (Duration learning and batched roll-forward have shipped.)

---

## Working rules

- **Verify live, not just green.** Every serious bug in this project was invisible to unit tests: wrong raw-SQL column names, timezone bucketing, a cache slot that stranded finished workouts on screen, a 404ing manifest, a client bundle pointing at localhost, a session cookie missing `Secure`. After building, drive it in a real browser with a throwaway Playwright script.
- Throwaway scripts live **inside `apps/web/`** (pnpm strict linking) and import from `@playwright/test`, not `playwright`. Delete them afterwards.
- **Kill stale node processes before `pnpm build`** — they hold the Prisma query-engine DLL (`EPERM … query_engine-windows.dll.node`).
- **`rm -rf apps/web/.next`** when returning from a production build to `next dev`.
- **Never run `prisma migrate dev`** — Neon drift makes it offer only a destructive reset. Use `migrate diff` → inspect that it is additive → hand-write the migration → `migrate deploy` → `generate`.
- **Never write JS/TS containing escape sequences through a python heredoc.** `\n` inside single quotes becomes a real newline and breaks the file. This has cost a debug cycle in five separate sessions. Use the Edit tool, or a template literal.
- **e2e: append to `apps/web/e2e/life-os.spec.ts`.** A new spec file means another registration, and sign-up is throttled 5/min/IP.
- **No e2e assertion may depend on which day it runs.**
- Clean codebase before every commit: no dead exports, no orphaned CSS.

**`docs/GOTCHAS.md` holds the full list of solved traps. Read it before debugging anything** — it exists so none of them get rediscovered.
