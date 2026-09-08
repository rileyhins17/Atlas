# Atlas experience: baseline and redesign direction

## Evidence before UI changes

The unchanged screenshot command ran at `1b60239` in CI run `34216971927` on
8 September 2026. The screenshot test passed in 42.1 seconds and produced 33
PNGs; all 33 were downloaded and visually inspected before modifying the rig
or the app UI. Artifact: `atlas-ui-screenshots`, id `10052343970`, SHA-256
`96e608a7b7b3714d8e7160906fce17f3541f05e2a72f578a2a95592ea35c8e65`.
The fixture uses disposable synthetic records, never production data.

Observed image dimensions: phone Today is 390 x 3323; phone Settings is
395 x 2622 despite a requested 390 x 844 viewport. The latter is an overflow
candidate, not yet a DOM scroll-width result. Desktop Today is 1440 x 2695.
The full-page capture places fixed navigation/capture at the original viewport
position; the apparent stripe through a long image is not by itself proof that
content is inaccessible during scrolling.

Visual findings:

- Today leads with Now/Next, then an expanded midnight-to-midnight timeline.
  Synthetic journal/history rows inside the Work block dominate that timeline.
  The checklist, capacity and pending decisions appear much farther down.
- Week uses narrow event columns and truncates short event names even at desktop
  width. The phone capture shows only part of the week inside its scroller.
- Settings opens a lengthy routine editor before the other preferences and
  connections. Its phone image is wider than the requested viewport.
- Money with no Plaid configuration offers two large empty cards and says an
  account can be added by hand without an obvious corresponding control.
- New-account Progress reports a 3% habit rate over the selected 30-day window,
  while the same screen acknowledges having only one day of history. The
  coverage needs to be explicit wherever a rate is interpreted.
- Light and dark share the same hierarchy issues. Contrast, targets and font
  sizes require DOM/axe measurements; visual plausibility is not a pass.

The current `docs/master-plan.md` contains four phases and no Phase 6. Its old
commercial claims are historical, not fresh verification. The user's explicit
requirements and the current implementation govern this redesign.

## Product direction

Atlas should help someone turn a crowded life into a realistic next action,
then learn from what actually happened. Its central loop is capture, decide,
do and reflect. A useful action should work on the first day without an AI key;
cross-domain history should improve the advice later without being required to
make the product useful now.

This means changing what the app asks the person to do, not just repainting the
existing pages. Today should lead with the next commitment, the work that still
needs a decision and a short actionable plan. Full history and the complete
hourly timeline stay accessible as secondary views. Planning must account for
real free intervals and preserve the link between a task, its scheduled event
and completion. The person reviews proposals before anything is scheduled.

The primary journey should work with the existing domain data model and APIs:

1. **Start:** capture a real first item and show the saved result. Collect routine
   constraints when they improve planning; do not make provider setup a condition
   of receiving value. Never infer a new account from a failed query.
2. **Decide:** surface due/slipped work and available capacity together. Offer a
   deterministic planning path and explicit schedule/move/complete actions.
   AI can help interpret or explain; a missing provider cannot end the journey.
3. **Do:** keep the next commitment and actionable checklist near the top.
   Training, habits and ratings remain functional domain tools, with progress
   and recoverable writes visible. Historical events must not bury today's work.
4. **Adjust:** offer clear recovery when plans change. Show resulting persisted
   times and task links, retain existing endpoints and avoid silent duplication.
5. **Reflect:** explain coverage, changes and supported cross-domain patterns.
   Distinguish absent evidence from poor performance. Keep evidence and actions
   connected rather than making the person translate a chart into a decision.

Calendar, tasks, goals, habits, training, writing, money, settings and integrations
remain complete and reachable. Existing URLs keep working. Broad navigation
changes must preserve the user's ability to find a domain and complete its work.
Every new control must have a real persistence or navigation outcome.

## Measurement and implementation gates

Use the existing thirteen-route regression list: Today, Tasks, Calendar, Goals,
Habits, Journal, Notes, Fitness, Finance, Progress, Everything, Week, Settings.
Notes is a compatibility route to Writing and is still measured separately.
The original screenshot rig used Looking Back, which redirects to Progress.

The expanded rig records all thirteen routes at 390px in light and dark, with
strict zero document overflow, targets at least 24x24, inputs/selects at least
16px and every axe violation included without tag/impact filtering. It writes
per-route diagnostics before asserting, so one failure cannot hide the rest.
The initial PNG dimensions are supplemented by the completed numeric baseline below.

A source inventory found 38 query-backed hook functions and 44 component files
using them, including the direct admin query. This is a review checklist, not
verified loading/empty/error coverage. The state audit must exercise failures and
empty responses as well as populated views. Source candidates include silent
failure branches in mood/ratings and the day overview's empty-data fallbacks.

Implementation will proceed in coherent journeys on the Phase 3 branch, with
regression evidence, all four local checks and observed CI. No Phase 4 begins
until the full Phase 3 gate is green. The aggregate Today endpoint and measured
performance comparison remain separate outstanding work.

## Measured baseline — 8 September 2026

The stricter test at `63b8fe2` was observed failing in PR run `34218063336`.
It collected all 26 route/theme combinations before failing. The full existing
browser suite still passed (50 passed, one skipped), as did the two independent
regressions. The new measurement assertion exposed the previously uncovered
states/rules. See [baseline data](./evidence/phase-3-baseline.json).

| Measurement | Light | Dark |
| --- | ---: | ---: |
| Routes measured at 390px | 13 | 13 |
| Routes with document overflow | 0 | 0 |
| Controls below 24x24 | 2 | 2 |
| Inputs/selects below 16px | 6 | 6 |
| Axe rule findings across routes | 26 | 26 |

Today `slipped-later` was 55x16. Week's compact event was about 85.86x23.
The six routine kind selectors were 14px. Every route had the moderate
`page-has-heading-one` and `region` findings; the region target was the capture
textarea. No impact or tag filter was used. Incomplete axe checks are retained
in the evidence file for manual review, not silently counted as passes.

Settings had zero document scroll overflow, but its `set-hint` spans extended
from x=45 to x=395. The CSS gave them a 100% flex basis plus a 25px left margin.
That explains the wider painted bounds seen in the original screenshot and is
being corrected separately from the already-zero document-overflow metric.

## First working-journey change

The existing day planner threw when an AI provider was unavailable. The new
service regression was observed failing with `No AI provider configured` before
the fix. A shared deterministic fallback now uses real owner tasks, supplied
free windows and measured durations (or an explicit 30-minute starting estimate).
It merges overlapping windows, avoids duplicate/overlapping proposals and does
not shrink a task merely to make it fit. It makes no writes. Existing AI planning
remains available, and accepting a proposal still uses the calendar endpoint.
The new API-to-persistence regression must pass in CI both in the full suite and
independently before this change is considered verified end to end.


## Today: decisions before history

The initial 390px Today screenshot was 3323px tall, with the expanded complete
hour-by-hour history before the checklist. Today now starts with Now/Next,
unfinished commitments, available capacity, proposals and the checklist. The full
timeline remains one disclosure away below the actionable content; other dates
keep it expanded. Mood and custom check-ins follow the schedule rather than
preceding the immediate action. Updated height and visual review await CI.

Four observed red component regressions proved that failed routine, task, event
or actual-history reads were being treated as empty data. The overview now
withholds planning until those reads succeed and retries failed sources. A fifth
observed red regression covered the expanded timeline preceding today's actions.
All ten component cases now pass, including pending data and other-day behavior.
The browser recovery/ordering regression is queued for both full-suite and
independent execution with its own synthetic task baseline.

Local gate: build 6/6, forced typecheck 10/10, lint zero errors with three existing
warnings, 1466 unit tests. Browser verification of this iteration remains pending.
