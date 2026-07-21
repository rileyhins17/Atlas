# Atlas v4 — The Day Canvas (design spec)

**Status:** approved 2026-07-21 (plan `scalable-weaving-leaf.md`). Supersedes the v3 "Stream" as
Home; the stream survives as `/history`. This is the formal design artifact — build slowly,
verify each slice, keep this doc current when the design shifts.

## 1. North star

**Atlas opens on NOW and shows your whole day, every hour accounted for.** The routine you
taught it during onboarding is the backbone; your real plans and real actions live on top of
it. One glance answers: *what am I supposed to be doing right now, what's next, and what
happened earlier?*

Owner's requirement corpus (verbatim anchors): "the timeline should be the main page you
interact with" · "every hour of every day should be filled" · "it knows what you're supposed
to be doing" · "plan your entire life" · ADHD-proof · warm, premium, modern, animated ·
anyone-can-use.

## 2. The product story

| Surface | Job |
|---|---|
| **Onboarding** | Teaches Atlas your life (rhythm → routine blocks; free text → pinned notes the AI always sees) |
| **Today** (`/today`) | The Day Canvas — runs your day, centered on now |
| **History** (`/history`) | The reverse-chron log of everything that happened (the v3 feed, filterable) |
| **Progress** (`/progress`) | The long arc — cross-domain statistics, deltas, trends |
| **AI** | Woven through all four: brief on the canvas, capture everywhere, recall from notes, stats in the weekly review. Never a tab. |

## 3. The Day Canvas

### 3.1 Core model
A day is a **vertical sequence of time sections** — NOT a fixed-scale hour grid. A naive
calendar grid is mostly dead space (8h of sleep = 8× empty rows); the canvas sizes sections
by content and labels them by span. Scannable, chunked, zero dead scroll — the ADHD bar.

Section kinds:
- **Routine section** — one per routine block overlapping the day (sleep, work, meals,
  exercise, wind-down). Soft kind-tinted background wash, header = `label · span`
  ("Work · 9:00–5:00"). Sleep renders dimmest.
- **Open section** — a gap between routine blocks ("Open · 5:00–6:30"). Tappable: focuses
  the capture box with the window as context (the one-tap "plan this gap" affordance).

Foreground items inside each section, chronological:
- **Events** (calendar) — time chip, location.
- **Due tasks** — live checkbox (optimistic complete, same mutation as everywhere).
- **Actuals** (past sections only) — timeline rows mapped into their slot: habit check-ins,
  journal entries (mood), transactions, completions, syncs. Deep-link by refType.

### 3.2 Now
- A pulsing **now-line** sits inside the current section at its chronological position.
- The page **auto-scrolls to now on load** — the app opens on the present.
- The current section header carries the "supposed to be doing" statement
  ("Work · until 5:00").

### 3.3 Time navigation (v1 = pager)
`‹ Yesterday · Today · Tomorrow ›` — arrows page one day, header tap returns to today,
slide transition between days, swipe on mobile. Any date reachable by repeated paging.
**Continuous bidirectional scroll is Phase D** — deliberately deferred; the pager isolates
the scroll-anchoring risk while the canvas itself matures.

### 3.4 Day flavors
- **Today**: header strip (greeting + compact brief + habit chips — one slim row, never a
  stacked dashboard; that failure was measured at 575px-to-content and must not return) →
  sections with now-line → capture sticky above everything.
- **Past day**: same canvas, actuals in the foreground, background washes slightly
  desaturated. Answer to "what did Tuesday look like?"
- **Future day**: routine + scheduled events + already-due tasks; open sections invite
  planning.

### 3.5 Empty/edge states
- No routine (skipped onboarding): the whole day is one Open section — canvas still works,
  with a warm inline pointer to set the rhythm in onboarding/settings.
- Overnight blocks (sleep 23:00→07:00) split across the midnight boundary: the morning tail
  renders as the day's first section, the night head as its last.
- Overlaps (event inside work block): the event card simply lives inside the routine
  section that contains its start time.

## 4. Information architecture

Sidebar (desktop): **Today · History · Progress** — divider — **Manage** (collapsible,
persisted): Tasks · Calendar · Habits · Journal · Notes · Finance — footer: user, chat,
theme, sign out, Settings.
Mobile bottom bar (5): Today · History · Progress · Tasks · Settings.
`/timeline` → `/today` redirect stays. `/ai` redirect stays.

## 5. Motion system (premium, never decorative)

Tokens: existing `--ease`, `--dur-fast/base`. Usage:
- Canvas sections stagger-in (~40ms steps, translateY 6px + fade).
- Day pager: horizontal slide (~240ms) in paging direction.
- Now-line dot: 2.4s pulse (existing keyframe).
- Card hover: subtle lift (translateY -1px + shadow).
- Progress tiles: count-up on mount.
- `AtlasLoadingScreen`: constellation draw-in → node pulse, staged messages fading through.
- ALL behind `prefers-reduced-motion` kill-switches.

## 6. Component inventory (Phase A)

```
components/canvas/
  DayCanvas.tsx     composition; data wiring; auto-scroll-to-now
  DayPager.tsx      date state, arrows, today-snap, slide direction
  TimeSection.tsx   background wash + header + children
  CanvasCard.tsx    event | task | actual variants
  NowMarker.tsx     the line + label (replaces stream NowLine usage on canvas)
lib/canvas.ts       buildDayCanvas() — pure, exhaustively unit-tested
```
Reused: `HomeCapture`, `HeroBrief` (compact), `HabitChips`, `useCompleteTask`,
`feedRowHref`, `routineAt` day-mask/wrap logic patterns, `Constellation`.
Retired at A3: `StreamPage` composition, stream `NowLine`/`NowStrip` on Home (Feed +
FeedRow move to `/history` intact).

## 7. Data contracts (Phase A additions)

- `TimelineQuery` + optional `from`/`to` (ISO datetimes, window ≤ 62 days) — fetch one
  local day's actuals. Existing offset pagination untouched.
- `CalendarService.list` + optional `to` (has `from`) — ranged day fetch for past days.
- No schema changes. Everything else already exists (routine, events, tasks, timeline).

## 8. Phases

- **A** — canvas logic → components → IA → e2e/green (this doc = A1).
- **B** — onboarding v2: warm form (real time inputs; three free-text steps → pinned,
  auto-embedded notes), `AtlasLoadingScreen` on gate + build step, onboarding e2e.
- **C** — Progress: `modules/stats` tz-correct rollups + `/progress` tiles/deltas/heatmap/
  sparklines + stats into the weekly review.
- **D (deferred)** — continuous scroll, drag-to-reschedule, j/k nav, fitness domain.

## 9. Verification bar (every slice)

`pnpm build && typecheck && test` + full Playwright e2e green · axe on changed surfaces ·
live fresh-login browser verification at desktop AND 375px · docs current · tree clean ·
branch + main pushed. Dev-server hygiene per GOTCHAS (kill 3000/4000, wipe `.next` after
heavy restructuring).
