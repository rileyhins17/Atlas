# Atlas — what to build next

Riley's constraint, verbatim: *"I don't want the app to become too complicated to
use but I want there to be tons of options and I want it made seamlessly."*

Those pull against each other, so the whole list obeys one rule:

> **Depth arrives as a consequence of what the user already did, never as another
> button.** Every idea below either (a) appears only once it has real data to
> stand on, or (b) replaces an interaction that already exists with a shorter one.
> Nothing here adds a tab.

Ordered by value-per-unit-of-complexity. The top of this list is worth far more
than the bottom.

---

## Tier 1 — highest value, small surface

### 1. Learn how long things actually take
Atlas already stores when a task was created and completed, and events have real
durations. Nothing reads that back. Track per-task-title (and per-tag) actual
elapsed time, then use it for two things:
- **"Plan my day" stops guessing at 45 minutes** and uses your real median.
- A quiet line on a task: *"usually takes you ~1h 20m"*.

Why it's top: it makes the planner correct rather than plausible, it needs **zero**
new UI, and it is the kind of thing only an app that owns your whole day can do.

### 2. Roll unfinished plans forward, with friction
Right now an overdue task just accumulates silently. At the daily brief, group
what slipped and ask one question: *"These three didn't happen — move to today,
or drop them?"* Two taps for the whole set.

The insight: **overdue lists are where task apps go to die.** Forcing a small,
batched decision is what keeps the list honest — and it feeds the AI a real signal
about what you actually don't intend to do.

### 3. Energy-aware placement
Journal mood is already bucketed by day, and workouts and sleep are now known.
Learn *when* in the day you tend to complete demanding work, and have the planner
prefer those windows for high-priority tasks — and protect the low-energy window
rather than filling it.

No UI at all. It just makes the same "Plan my day" button smarter over weeks.

### 4. One-tap "reschedule everything after this"
When something runs long, the rest of the day is wrong. A single action on the
now-line: *"running 30 min late"* → shift today's remaining movable blocks.
Fixed things (events with other people, work hours) never move.

This is the single most common real-life planning action and no app does it well.

---

## Tier 2 — real depth, moderate build

### 5. Goals that connect to the day
`Goal` exists in the schema and is barely used. Make a goal own tasks and habits,
then show one honest line per goal on Progress: *"Ship v1 — 12 of 30 tasks, last
touched 9 days ago."* The "last touched" is the valuable half; it surfaces the
goal you have quietly abandoned.

### 6. Weekly planning ritual
A Sunday counterpart to the daily brief: last week in three bullets, then *"what
are the three things that must happen this week?"* Those become pinned, and the
daily planner treats them as first priority. One screen, once a week.

### 7. Templates for recurring days
"Leg day", "deep work morning", "admin afternoon" — a named set of blocks you can
drop onto any day in one tap. This is how the *"tons of options"* requirement gets
satisfied without a settings page: the options are things **you** created, so they
are never clutter.

### 8. Smarter capture: multi-item and correcting
Capture already files one thought across domains. Two upgrades:
- Handle *"gym at 6, call mum, and I'm out of coffee"* as three filings in one go
  (the tool loop can already do this — the prompt does not encourage it).
- An **undo** on the "Filed: …" toast. Right now a misfile means hunting for it.

### 9. Search across everything
One field, semantic + keyword, over tasks/journal/notes/events/workouts. The
embedding pipeline already exists and is unused outside chat recall. ⌘K is already
the home for it.

---

## Tier 3 — differentiators, bigger builds

### 10. "How am I actually doing?" — honest correlations
With months of data: *"your mood averages 0.8 higher in weeks you train 3+ times"*.
The guardrails already written (never infer from thin data) are what make this
trustworthy rather than horoscope-grade. **Only ship with a minimum-N gate.**

### 11. Calendar week grid
Still open. The agenda list is fine on mobile; a real week grid is what makes
desktop feel like a calendar app. Drag-to-reschedule belongs here, not on Today.

### 12. Read-only share links
A single day or a progress summary, shareable via a signed URL. Cheap to build,
and the first thing that makes Atlas spread by itself.

### 13. Offline capture
The service worker exists but only serves an offline page. Queue captures made
offline and flush them on reconnect. Phones lose signal; a life OS that drops
your thought is broken.

---

## Explicitly NOT worth building

Saying no is most of keeping it simple:

- **Team/collaboration anything.** Atlas is a single-player tool. Sharing a task
  list turns it into a worse Todoist.
- **Pomodoro timers, streak gamification, XP.** Manufactured motivation ages badly
  and cheapens the honest tone the AI already has.
- **A chat-first interface.** Chat is the escape hatch, not the primary surface —
  that was already settled in v3/v4 and remains right.
- **Manual time tracking.** Nobody sustains it. Infer it (idea #1) instead.
- **More domains for their own sake** (reading lists, water intake…). Each new
  domain dilutes the AI context budget and adds a nav row. The bar: *would the AI
  say something smarter because this exists?*

---

## The sequencing I'd actually recommend

1. **Finish what's half-built first** — the routine editor (#P2, in progress) and
   live-verify "Plan my day" against a real key. Half-built features are worse
   than absent ones.
2. **Then deploy** (see `ship-to-iphone.md`). Everything above is worth more once
   Atlas is on your phone, because that's when you'll actually use it daily and
   find out which of these ideas is real.
3. **Then Tier 1**, in order. Ideas 1 and 2 compound: better time estimates make
   the roll-forward decision easier, which produces cleaner data for estimates.

The honest note: this list is written from the outside. Two weeks of using Atlas
on your phone will reorder it, and that reordering will be more reliable than
anything I can reason about here.
