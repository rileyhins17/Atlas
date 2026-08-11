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

Cloudflare terminates TLS → tunnel → local Caddy (`infra/Caddyfile.tunnel`) → `/api/*` to the API on :4000, everything else to Next on :3000. **One origin**, which is what makes the session cookie work.

**The origin is started BY HAND, from `infra/Atlas Server.cmd`** (or the "Atlas Server" desktop shortcut). This PC games, so nothing is in the Startup folder and nothing survives a Stop: the window's Stop button retires the watchdog task *first* and then kills all four processes, because the old always-on design put the stack back within two minutes and could not be turned off before a game. Everything Atlas starts is dropped to **BelowNormal** priority, and the watchdog re-applies that to anything it restarts. Closing the window leaves the server running — only Stop stops it.

**It refuses to start on a half-configured `.env`.** Placeholders, or a `DATABASE_URL` still pointing at localhost, and it names the offending keys and starts nothing — booting with the dev values would put an empty database behind the public domain and quietly accept real signups into it.

Docker is **not** part of serving. Production reads Neon over the network; the compose Postgres is dev-only and should stay stopped.

`infra/start-atlas.cmd` is still there for a headless/one-shot start and both it and the watchdog now derive the repo path from their own location rather than hardcoding one.

**`infra/atlas-health.ps1` runs every 2 minutes** as the "Atlas health" scheduled task and restarts
whatever is missing. It exists because the public origin depends on FOUR local processes and the app
gives no sign when one dies: restarting node leaves the tunnel dead, localhost keeps serving happily,
and atlaslife.app 530s until a human happens to load it. Verified: killing cloudflared takes the site
to 502, and the next sweep returns it to 200. If you are ever debugging "the site is down", check
`infra/health.log` first.

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

### Two rules that are easy to break
- **Weight is stored as integer grams, always.** `lb`/`kg` is a display preference
  (`User.weightUnit`, default `lb`) applied at the edge by `gramsToUnit`/`unitToGrams`. Never store
  a float: summing volume over a session accumulates error, and switching units must never rewrite
  a logged set.
- **Reach for the AI last.** Capture falls back to a local parser when there is no API key
  (`packages/shared/src/dto/local-capture.ts`), so a brand-new account's first capture lands
  instead of erroring. Fitness split setup matches free text against the catalog locally
  (`packages/shared/src/dto/exercise-match.ts`) and only calls the model when that yields nothing.
  A feature that needs an API key to work at all is broken for every new account.

---

## The surfaces

- **`/` landing** — the only public page. Server-rendered, no client JS, ~750 indexable words. `robots.ts` disallows every app route, because they return the sign-in gate to a bot.
- **`/today`** — the day as an overview: what is happening now, what is next, free-time windows, a checklist, then earlier items and the full hour-by-hour canvas on demand. Driven by `lib/canvas.ts` (`buildDayCanvas` → `buildDayOverview`), pure and unit-tested.
- **`/week`** — the calendar as a **grid**: a time gutter and seven day columns, events positioned
  by time with clashes side by side, click an empty slot to create there. The layout maths is pure
  and unit-tested in `lib/calendar-view.ts` (`visibleHourRange`, `placeDayEvents`) — the visible
  hour window comes from the week's own events, so the grid is never mostly empty small hours.
  Tasks and Goals are its other two tabs; `/calendar` is the same panel in day scope, still a list.
- **`/looking-back`** — Progress (charts) and History (the raw feed, folded away) as one screen.
  `/progress` and `/history` redirect here. `lib/sections.ts` is the authority on the nav.
- **`/everything`** — the domain pages, demoted: `/tasks` `/calendar` `/habits` `/journal`
  `/notes` `/fitness` `/finance` `/goals` all still exist and still work, they simply stopped
  competing with the question you opened the app to answer.
- **`/privacy` `/terms`** — public, server-rendered, no client JS. Linked from the landing footer
  and the sign-up form.
- **`/settings`** — collapsible sections. **Your week** (the routine editor) is what makes Today's free-time calculation correct, so it opens by default. Appearance and sign-out live in "Your data & account".

**Navigation is three destinations along one axis — time.** Today · Week · Looking back, with
"Everything" one level down. **Both navs must agree**: the sidebar is `display: none` below 901px,
so the phone's bottom bar carries "Everything" as a fourth item — without it, half the app has no
route in on the primary platform.

**Ambient AI, not a tab:** ⌘K command bar (capture / ask / jump), ⌘J chat rail, and a capture dock on every page.

**To look at the UI, run the screenshot rig** — `SHOTS=1 pnpm --filter @atlas/web exec playwright
test e2e/screenshots.spec.ts`. It shoots every route at 1440px and 390px plus the day canvas. Most
of the design work in v10 came from reading those PNGs, not the source.

---

## Current state

Green at the last commit: build 6/6 · typecheck 10/10 · lint clean · **580 unit tests** · **e2e 44/44** (Playwright + axe) · axe clean on **all thirteen routes** at phone width, plus Today, Looking back and the week grid at desktop.

**"axe clean" means zero violations, not zero serious ones, and it means every route.** The scans
used to filter to `serious`/`critical`, which silently discarded `meta-viewport` — a real WCAG 1.4.4
failure that had pinch-zoom disabled on every page. They also only covered three surfaces: the
moment the sweep was widened to all thirteen it found a serious contrast failure that had shipped.
If you add an axe scan, assert on the whole violation list.

**Axe cannot see tap targets, so the phone-width spec measures them.** `target-size` is a WCAG **2.2**
rule and every scan here asks for 2.0/2.1 tags, so four undersized controls sat under a green axe
run — including a goals check button that was **16×6px with no circle drawn**, because its box was
scoped to `.goal-row.done` and only appeared once the goal was achieved. The sweep now measures every
interactive element on all thirteen routes against 24×24, with no inline-link exemption: an exception
that never legitimately fires is somewhere a real failure hides.

**Brand-coloured text on a brand tint needs `--brand-on-tint`, not `--brand`.** Measured: `--brand`
on a 12% tint of itself is 4.29:1 in light and drops to 3.74:1 on the 22% hover tint — an AA failure
in exactly the state you are looking at it. `--brand` is tuned to sit on a surface; `--brand-on-tint`
is tuned to sit on a tint of itself, and clears 4.5:1 on every pairing the app uses.

**This one comes back.** It returned on the week strip: `.wk-day.is-today .wk-day-num` set `--brand`
without regard for whether `.on` had laid a 10% tint underneath, so selecting today measured 4.43:1
in light. The rule to apply when writing it is *whenever a `color-mix` of `--brand` is the
background, the text on it is `--brand-on-tint`* — the sibling `.cal-day` rule guards the same
combination with `:not(.on)`.

### Known gaps — tracked, not hidden
**`docs/production-readiness.md` is the authoritative list**, written from a 154-assertion API stress
pass and a full-route UI pass. It is ordered by what blocks shipping and says what was measured
rather than assumed. Read it before planning any "make it production ready" work.

The short version of what is STILL open:
- **Rotate the Plaid production secret** — it was pasted into a chat transcript. Needs Riley's Plaid
  login; nobody else can do it.
- **`SENTRY_DSN` is unset**, so the error reporting that is now wired in reports nothing.
- **Google's refresh token dies every 7 days while the OAuth consent screen is in "Testing".**
  Verified live: the grant made 19 July stopped working, and Google answers `invalid_grant` —
  "Token has been expired or revoked". Reconnecting works; publishing the consent screen is what
  stops it recurring. The API now returns 424 with a reconnect message instead of a 500.
- **Unverified live:** Google Calendar delete propagation; Plaid production.
- The Plaid webhook does not verify Plaid's signature (harmless while it is a no-op).
- **Notes and journal still have no edit UI.** Habits now do. Notes have `PATCH` on the API and no
  client method, and journal has no update at any layer — and they share one writing surface, so
  making half the rows editable is a product decision, not a missing function.

**"The API has it, the UI never wired it" is this codebase's most common gap** — the same shape has
now turned up four times: event editing, habit editing, and `displayName`, which had a column, a DTO
and an endpoint since the first migration and no field anywhere, so it was null for every account and
Today greeted people with their email's local part. Before building something, check whether the
server already does it.

Done and verified: legal pages, error-reporting plumbing, input bounds, double-submit, RRULE
validation, and the account purge (440 → 3).

**The database has 3 accounts.** Riley's two, plus `aidanmageebusiness@gmail.com` — a real third
person with their own DeepSeek key. Do not purge by email pattern: `phase2-test@example.com` looked
like junk and held the only live Google Calendar credential (since moved to
`rileyhinsperger16@gmail.com`). Always dry-run a destructive query and read the output.

**A full e2e run leaves ~30 accounts behind**, so this climbs fast — it was back to 230 after one
session. Purge with an **exact-address allow-list**, never a pattern, and list the credentials the
doomed rows hold before deleting: the dry run is what catches a real account that happens to look
like junk.

Cross-user isolation was stress-tested across every module and is clean — user B cannot reach user
A's rows by any route tried.

### Layering rule (learned the hard way)
`.dialog-overlay` is z-80 and every modal surface must sit at **z-81** — `.dialog-content`,
`.command-bar`, `.asks-panel`. Anything rendered behind that overlay but left below it becomes
unclickable. The full scale is documented above `.dialog-overlay` in `globals.css`.

### What to build next
**`docs/master-plan.md` is the commercial plan** — four phases, ordered so each makes the next worth
doing, with an explicit "do not build" list. Read it before proposing features.
`docs/atlas-next-ideas.md` is the older feature-level roadmap. Tier 1 remaining: **energy-aware placement** and **one-tap "running 30 minutes late"**. (Duration learning and batched roll-forward have shipped.)

**The "Atlas v6" plan is DONE — do not re-derive it.** All of it shipped: RRULE
storage with a preset picker (`describeRrule`, `RecurrencePicker`), the `## Now`
block that anchors the model in the user's local date, time and timezone
(`OrchestratorService.nowBlock`, first in every snapshot), the brain-dump
scheduling rules including `durationMinutes` and `calendar.block`, the
anti-hallucination honesty rules in the brief and weekly-review prompts, and the
Progress changes (three tiles, habit rings, a 1–5 mood axis, bolded review
bullets). A plan file describing it as outstanding is stale; check
`orchestrator.service.ts` before believing otherwise.

---

## Working rules

- **Audit by RUNNING it, not by grepping for names.** Three "missing" features reported in this
  project turned out to exist — the weekly review renders on Progress, search is a full module wired
  into ⌘K, and a "bug" in its results was a probe reading the wrong field. A wrong audit wastes more
  time than a missing one.
- **`pnpm typecheck` can report green from turbo cache.** Use `--force` before claiming green on
  anything CI re-checks from scratch, and remember CI runs `tsc && tsc -p tsconfig.test.json` —
  a bare `tsc --noEmit` does not cover `playwright.config.ts`.
- **A field a user TYPES into must be tested by typing.** `fill()` sets the value in one shot with
  no click and no keystrokes, so the fitness spec passed for weeks against a weight box that turned
  185 into `0185` for anyone who actually tapped it. Use `click()` + `pressSequentially()`, and
  assert the click alone changes nothing.
  **It fails a second way on a React controlled input:** `fill()` dispatches one input event that a
  commit can miss, leaving state empty so the submit handler returns early and NO request is sent —
  and `getByText` then matches the textarea's own value, so the row renders on screen and never
  exists. `toHaveValue` does not catch it either; it reads the DOM. Type, and assert against the
  saved list.
- **A number input under 16px forces iOS to auto-zoom on focus.** The usual fix — pinning
  `maximumScale` — disables pinch-zoom for everyone and fails WCAG 1.4.4. Size the field instead.
- **Verify live, not just green.** Every serious bug in this project was invisible to unit tests: wrong raw-SQL column names, timezone bucketing, a cache slot that stranded finished workouts on screen, a 404ing manifest, a client bundle pointing at localhost, a session cookie missing `Secure`. After building, drive it in a real browser with a throwaway Playwright script.
- Throwaway scripts live **inside `apps/web/`** (pnpm strict linking) and import from `@playwright/test`, not `playwright`. Delete them afterwards.
- **Kill stale node processes before `pnpm build`** — they hold the Prisma query-engine DLL (`EPERM … query_engine-windows.dll.node`).
- **Then bring :3000 back up BEFORE running Playwright** (`powershell -File infra/atlas-health.ps1`, idempotent). If the port is empty, Playwright starts the server itself and kills it when the run ends — which takes atlaslife.app to a 502 until the two-minute health sweep. With the server already running, Playwright reuses it and leaves it alone.
- **`rm -rf apps/web/.next`** when returning from a production build to `next dev`.
- **Never run `prisma migrate dev`** — Neon drift makes it offer only a destructive reset. Use `migrate diff` → inspect that it is additive → hand-write the migration → `migrate deploy` → `generate`.
- **Never write JS/TS containing escape sequences through a python heredoc.** `\n` inside single quotes becomes a real newline and breaks the file. This has cost a debug cycle in five separate sessions. Use the Edit tool, or a template literal.
- **e2e: append to `apps/web/e2e/life-os.spec.ts`.** A new spec file means another registration, and sign-up is throttled 5/min/IP.
- **No e2e assertion may depend on which day it runs**, or on what another spec left behind. Specs
  share one user by necessity (the throttle), so anything stateful must set up its OWN baseline:
  `resetFitness(page)` clears an open session and saved days, `seedWorkoutHistory(page)` creates
  data to assert on. A spec that passes in a full run but fails alone is the dangerous shape — it
  hides in green.
- **Verify a new spec BOTH ways**: alone and in a full run. They disagree exactly when the spec is
  coupled to another one.
- Playwright runs with `reducedMotion: 'reduce'` so content-entry animations cannot make a click
  land on a moving target. Without it, "element is not stable" timeouts look like overlay bugs.
- **An assertion that could match the input you just typed into is not testing persistence.** React
  mirrors a controlled textarea's value into the element's text content, so `.card` + `hasText` matched
  the composer: the writing spec went green the instant the text was typed, navigated on, and the
  navigation cancelled the in-flight POST. Zero rows in the database after a passing run. Scope to a
  container that can only hold saved data (`.wr-list`).
- **A className with no CSS rule renders as the browser default, not as nothing.** `.ov-title` and
  `.card-title` both fell through to a default `h2`, which is how a nag ended up being the largest
  text on Today. Grep the stylesheet for every class you add.
- Clean codebase before every commit: no dead exports, no orphaned CSS.

**`docs/GOTCHAS.md` holds the full list of solved traps. Read it before debugging anything** — it exists so none of them get rediscovered.
