# Atlas — the "Life OS" UI vision (build spec)

**Status:** north star for a ground-up UI rebuild. Written 2026-07-18. The scheduled
3:21 agent (Fable 5, max effort) builds toward this. Backend/data model stay; this is
the front-end and the *product*, not a re-skin.

> Owner's verdict on the current UI: "looks like it was built with AI in 20 minutes."
> He's right. The current app is 7 CRUD pages (input + list + card) behind a sidebar.
> That is the anti-pattern. Kill it. Atlas is a **Life OS with an ambient cross-domain
> AI** — the UI must *dramatize* that, not hide it behind a chat tab.

---

## 1. North star (one sentence)

**Atlas is a calm, intelligent command center that watches your whole life across
tasks, calendar, habits, journal, and finance — and helps, proactively.** The UI should
feel like the love-child of **Sunsama/Amie** (daily planning), **Notion** (clean,
content-dense, inline-editable), **Linear** (precision + keyboard-first), and
**Superhuman** (speed + an AI that's *present*). Every screen should make you feel the
AI is paying attention.

If a screen could exist unchanged in a generic to-do template, it's wrong.

## 2. Why today reads as "AI-built in 20 min" (fix all of these)

1. **60% empty canvas.** A skinny column in a void. Real products earn their width.
2. **Every page is the same shape:** one text box + one list in one card. Thin CRUD.
3. **Barebones rows:** circle · text · ✕. No priority, no due date, no project, no
   metadata, no context. Nothing to look at, nothing to do.
4. **The AI is a *tab*.** The single most valuable, differentiating thing in Atlas is
   siloed into "Atlas AI" alongside tasks/habits. It should be *everywhere*.
5. **No information design.** No dashboard, no glance-value, no data-viz, no hierarchy
   beyond "header + list."
6. **Feels empty/demo.** 2–3 items. No sense of a life being run here.

## 3. The big moves (information architecture rethink)

**A. Home is a real dashboard, not a task list.** Retire "Today = a task list."
Home is a composed, multi-zone command center for *your day and your life* (details §4).

**B. One ambient command bar (⌘K), not seven text boxes.** The primary input is a
single omni-bar. Type anything — `call mom fri 3pm`, `felt wired after the demo`,
`gym ✓`, `how much did I spend on food this month?` — and the AI routes it (brain-dump,
already built server-side) to the right domain, or answers. This *replaces* the per-page
input the owner hates. One intelligent input. Keyboard-summoned from anywhere.

**C. The AI is fabric, not a tab.** Delete the standalone "Atlas AI" page. Instead:
- The **daily brief** speaks on Home ("Here's your evening…").
- **Inline nudges** ("Atlas suggests moving this — you journaled feeling overloaded").
- A **slide-over chat** (right rail, ⌘J) summonable anywhere to "chat over your life."
- The **"Atlas wants to know" cards** (the unique self-curation hook) surfaced
  contextually, not buried.

**D. A unified Timeline / "Story."** The cross-domain graph made *visible* — a vertical
stream of everything that happened (task done, event, journal entry, habit check-in,
insight, question answered), filterable by domain. This is the "silos become one graph"
hook. No to-do app has this. It's the thing that makes Atlas *Atlas*.

**E. Rich objects.** A task = title · priority (color) · due (warm relative: "in 2h",
"tomorrow") · project/tag · AI-inferred context. Journal entry = mood face · AI-extracted
themes · linked items. Habit = streak ring · best streak · this-week grid. Hover reveals
actions; click-to-edit inline (Notion-style).

**F. Use the whole screen, with purpose.** Collapsible sidebar (Notion-style, ⌘\) ·
main content · an optional **right rail** (AI chat / item details / day agenda). Three
considered zones, not one lonely column.

## 4. Surface-by-surface

### Home ("Today") — the command center
A real dashboard. Suggested composition (responsive; collapses gracefully on mobile):

- **Hero brief.** "Good evening, Riley." + the AI's *cross-domain* daily brief in prose:
  "3 tasks left, gym streak at 12 days, 9am with Sarah tomorrow. You sounded stressed in
  yesterday's journal — want a lighter tomorrow?" with inline action chips
  (Plan tomorrow · Snooze · Dismiss). This is `generateDailyBrief` + `ai_questions`,
  already server-side. Make it feel *alive*.
- **The day's timeline** (spine): calendar events + time-blocked tasks in a vertical
  hour rail (Amie/Sunsama). Now/next indicator. Drag to reschedule (stretch).
- **Focus** column: today's tasks grouped Overdue / Today / Later, rich rows, one-tap
  complete with the satisfying check.
- **Habit rings**: compact Apple-Fitness-style rings for today's habits + streak flames.
- **Pulse**: a mood/energy sparkline from recent journal entries; a finance glance
  (spend this month sparkline) when connected.
- **Atlas asks**: the self-curation question cards, inline, tasteful.

### Command bar (⌘K)
Omni input + fuzzy nav + AI. Modes: capture (routes via brain-dump), ask (chat), jump
(go to any item/section). This is the primary interaction. Fast, keyboard-first, with
result previews.

### Timeline / Story
The unified `timeline_events` stream, beautiful: grouped by day, domain icons + color,
each entry expandable, filter chips per domain, "on this day" affordances. The graph
hook, browsable.

### Tasks / Calendar / Habits / Journal / Notes / Finance
Keep them as focused *views* reachable from the sidebar, but each is a **considered
view**, not a CRUD stub:
- **Tasks:** grouped/sortable (by due, priority, project), inline-edit, keyboard nav
  (j/k, x to complete, e to edit), bulk actions, empty states that teach.
- **Calendar:** an actual week/day view with events + tasks, not a form + list.
- **Habits:** streak rings, a GitHub-style year heatmap per habit, best-streak, weekly
  cadence grid — turn "a list" into *insight*.
- **Journal:** a warm writing surface; entries as a timeline with mood + AI themes;
  a mood-over-time chart.
- **Notes:** the "what Atlas knows about you" memory, shown as living knowledge cards,
  pinned facts elevated.
- **Finance (Phase 3 backend):** accounts, spend-by-category donut, trend sparklines.

### Right rail (AI chat / details)
Slide-over. Summon to chat over your life, or it shows the selected item's details /
the day's agenda. Context-aware.

## 5. Craft standards (the Notion-grade bar)

- **Typography:** a real type system with true hierarchy — display / title / body /
  meta. Consider a refined pairing (e.g., a crisp grotesk for UI). Tight, deliberate.
- **Palette:** a considered neutral system (Notion-ish warm greys) + one confident
  accent, *both themes fully designed*. Not a rainbow. Not gradient slop.
- **Density with air:** content-rich but breathing. Real information hierarchy, precise
  alignment, an 8pt spacing system, consistent radii/elevation.
- **Keyboard-first:** ⌘K (command), ⌘J (chat), ⌘\ (sidebar), j/k navigation, x/e/etc.
  A product for power users.
- **Inline editing:** click-to-edit like Notion. No modal-per-edit.
- **Motion:** physical, fast, purposeful (list reflow, check, rail slide, view
  transitions) — all under `prefers-reduced-motion`. No decorative aurora.
- **Data-viz** where it earns it: rings, heatmaps, sparklines, donuts — the dataviz
  skill's palette/rules apply; accessible, theme-aware.
- **Empty & loading states:** teach and delight; skeletons that match final layout.
- **Responsive/PWA:** desktop = 3 zones; tablet = 2; mobile = focused + bottom nav +
  the command bar as the star. It's a PWA — treat mobile as first-class.

## 6. Build plan for the 3:21 agent (phased, ship per slice, keep green)

0. **Re-read** `CLAUDE.md` (state, gotchas, commercial-grade bar) + this file. Confirm
   baseline green (`pnpm install && build && typecheck && test`, and web e2e).
1. **Design system pass:** lock the type scale, neutral+accent palette (both themes,
   all pairs ≥ WCAG AA — *measure*), spacing/radii/elevation/motion tokens. Build/extend
   primitives (command bar, rail, rings, sparkline, heatmap, segmented views, inline-edit
   field, kbd). Storybook-ish sanity if cheap.
2. **App shell v2:** collapsible sidebar (⌘\), main, right rail (⌘J). Command bar (⌘K)
   wired to brain-dump/chat/nav. Kill the standalone AI tab; make AI ambient.
3. **Home dashboard:** hero brief (daily-brief + asks) → timeline spine → focus tasks →
   habit rings → pulse. Real composition. This is the make-or-break screen — get it
   *stunning*.
4. **Rich objects + views:** upgrade task/habit/journal/note rows and each domain view
   (grouping, inline edit, keyboard, the heatmaps/charts).
5. **Timeline / Story view** over `timeline_events`.
6. **Polish:** micro-interactions, empty/loading/error states, dark+light parity,
   mobile, a11y sweep (axe green), performance.
7. **Tests alongside, not after** (the standing bar): component/hook tests for new
   primitives + logic; extend Playwright happy-paths + axe for the new shell, command
   bar, and Home. CI must stay green.

Ship each slice as its own commit + push; keep `pnpm build/typecheck/test` and the web
e2e green at every commit. Verify each screen **in the browser** (drive it, screenshot),
not just types.

## 7. Guardrails

- **Don't break the backend or data contracts.** API, auth, DTOs, connectors stay. This
  is front-end + product. If a view needs new read shapes, add endpoints cleanly
  (module pattern), scoped by `userId`, zod-validated, paginated, tested.
- **Hold the commercial-grade bar** (CLAUDE.md): multi-tenant, secure, tested,
  accessible (measured AA), responsive, polished states.
- **AI is live** (DeepSeek via `OrchestratorService`; local embeddings). Use the real
  endpoints (daily-brief, brain-dump, chat, ai_questions, recall) — don't fake the
  intelligence; surface it.
- **Warm but not cutesy; premium but not cold.** Owner liked warmth; he rejected both
  the cold/flat version *and* the thin cozy version. The fix is **product depth +
  craft**, not accent color.
- **When in doubt, add signal and density done well** — the opposite of the empty demo.
- Work on branch `claude/session-check-in-mbo5om` (or a fresh feature branch off it);
  do not push to `main`. PR #1 tracks the work.

---

**The through-line:** make someone open Atlas and feel *"this thing actually runs my
life, and it's beautiful."* That's the bar. Not a sidebar with buttons and a text box.

---

## v3 addendum — The Stream (shipped 2026-07-19)

Owner directive: **"the timeline should be the main page you interact with."** The v2
zone dashboard and the read-only Timeline page were two chronological surfaces split
in half. v3 merges them: Home IS the stream.

- One feed, down = older (social-feed muscle memory): sticky capture → now cluster
  (brief/rings/asks) → bounded Up Next (overdue → today → "+N tomorrow") → the
  now-line → the entire past, day-grouped, filterable, infinite.
- The feed is a surface you ACT on: capture files into it instantly, open tasks keep
  a live complete-checkbox on their feed rows, rows deep-link to their domain.
- `/timeline` redirects home; `DaySpine`/`FocusTasks`/`PulseCard` retired. Domain
  pages stay as the focused views.
- Pure stream logic lives in `lib/stream.ts` (unit-tested); zero backend changes.
