# Mobile week agenda

The reviewed 390px Week screenshots at cd63d41 showed event titles truncated to
fragments and only part of the seven-column grid visible. This slice adds a
seven-day agenda as the default presentation at widths up to 700px. Larger
screens retain the grid default. Both presentations remain explicitly selectable
on every screen; they share the current events, date range and editor callbacks.

The agenda includes days with no events, complete titles, times and locations.
Each day can open the existing composer at 09:00 on that date. Existing events
open the same editor and retain its recurrence safeguards. Queries remain owned
by CalendarPanel, with its existing pending/error gates.

Two new component tests pass for all-seven-day rendering, saved-event editing,
grid access and selected-day creation. These were added with the new component;
they are feature tests, not observed-red regressions. A new self-seeded browser
case measures the agenda in both themes at 390px, opens the saved event and
switches between presentations. It is included in independent CI execution.
Browser results and rendered PNG review for this change remain pending.

CI run 34264147366 at c1fcc90 reported 56 browser passes, one skip and one
failure. The new mobile case stopped in the desktop `go()` helper because it
required the deliberately hidden sidebar user name to be visible at 390px.
The repair navigates directly and waits for the Week layout controls, then
the seven agenda days. Saved-event editing, layout switching and both-theme
measurement assertions remain unchanged. The original run does not prove those
assertions; a new observed CI result is required after this repair.

Depends on the unmerged Settings slice at 7e83b47 (PR #34). This does not finish
the broader planning redesign, query-state audit, invited AI or performance
phase. No migrations, runtime dependencies or production changes are included.
