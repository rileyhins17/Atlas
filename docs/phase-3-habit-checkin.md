# Habit check-in: visible and accurate state

Inspected the Habits screenshots in light and dark from green CI 34274101707.
Checked and unchecked habits both displayed a tick in a native-looking button.
The source applied the same `check` class for both states; its CSS rules were scoped to `.task`, so they did not style the habit control. The
control now has a defined 36px target, a plus before the daily target is met,
and a filled checkmark after it is met. Pending saves disable further taps.

The audit also found that the optimistic cache update always set doneToday to
true and extended the streak, even when a user had only reached 3 of 8 check-ins.
The pure projection now lives in packages/shared and only marks completion and
extends a streak at the target. Additional logs after the target remain allowed
and do not extend the same day's streak again. Existing rollback and server
reconciliation remain in place. Calendar/timezone and weekly-cadence semantics
are unchanged by this slice.

Observed two regressions fail before fixing them: partial check-in completion
and repeated taps during an in-flight save. Focused web coverage then passed
13 tests; shared streak/projection coverage passed 9 tests. The initial focused
rerun required rebuilding the shared package because web imports its compiled
export; no red-green claim is based on that missing-export run.

The browser case creates its own target-two habit for each theme, holds and
fails a write to prove pending/partial state and rollback, then performs two
real successful writes and verifies count/completion after reload and through
the disposable API. Both themes receive strict 390px measurements. Full and
independent browser results and new screenshot inspection remain pending CI.

Depends on unmerged PR #44 through 4de90d6. No runtime dependencies, migrations,
credentials or production configuration changes are included.
