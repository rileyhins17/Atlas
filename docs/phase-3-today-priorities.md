# Today: put the checklist in the first screen

Inspected the verified 390px Today PNGs in both themes from CI 34270602672.
The first checklist rows were below the initial viewport: the now/next card,
missed commitments and free-time planning all appeared before the checklist.
Schedule-shift pills also occupied a separate row inside the top card even
when the current state was open time. This is a hierarchy finding, independent
of the route passing overflow, target-size and axe checks.

The checklist now follows now/next. Missed commitments and schedule-adjustment
controls follow the checklist, then free-time planning and the remaining day.
All existing shift/undo and planning controls remain available. Other dates
retain their planned tasks and full timeline behavior. No API or persistence
semantics change in this layout slice.

Two layout regressions were observed failing before the change (10 existing
tests passed). The reordered view and existing shift/undo coverage then passed
18 focused tests. The existing Today browser case now creates its own habit,
checks that the first checklist action sits above the fixed capture dock without
scrolling at 390x844 in both themes, measures accessibility, and retains its
full-timeline paging and failed-day-read recovery assertions. This case runs
in the full suite and independent selection. Browser and screenshot evidence
for the new layout remain pending CI; pixel improvements are not yet claimed.

Depends on unmerged PR #43 through 7ce3d80. No runtime dependencies, migrations,
credentials or production configuration changes are included.
