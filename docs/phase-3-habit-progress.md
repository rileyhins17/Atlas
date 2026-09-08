# Habit progress with an explicit calendar denominator

The inspected light/dark Progress PNGs from run 34265906708 showed a habit
created that day at 3% over a 30-day range. Source inspection also found that
seven sparse history rows were treated as a week and weekly cadence was ignored.
Four shared regressions reproduced these errors before the calculation changed.

The shared calculation now receives a clock, creation timestamp and cadence.
It walks at most 366 calendar dates, excludes dates before creation and outside
the visible window, preserves zero-log days/weeks and groups Monday-Sunday
calendar weeks. Daily targets are scored per eligible day; weekly targets sum
check-ins across the week's eligible days. The UI shows met/eligible counts
and labels included partial weeks. Weekly rows no longer display a daily streak.
This measures progress within the selected window, including current partial
periods; it is not an estimate of future completion.

The aggregate stats headline has no habit eligibility or target information.
A fifth observed-red regression caught its warning tone on one logged day in a
30-day window. It now reports check-in days and their calendar denominator
neutrally, rather than calling any check-in a kept habit or a low rate a failure.

Two new component cases verify denominator and cadence wording. The appended
browser case fixes the browser date, establishes real synthetic journal activity
and supplies deterministic habit/history responses for the two scoring cases.
It checks both themes at 390px and is included in independent verification.
These are rendering/calculation fixtures, not a claim of newly persisted habit
history. The existing real habit-history browser coverage remains in the suite.

The history API currently keys days in UTC. This calculation deliberately uses
the same calendar rather than mixing browser-local boundaries with UTC logs.
Changing habit history, today's status and streaks to the user's timezone remains
a coordinated domain correction; it is not silently claimed by this UI change.
Current cadence/target applies throughout the selected history because the data
model does not retain historical target changes.

Local gate counts and CI evidence are recorded in the commit/PR. Browser and
fresh PNG verification remain pending until observed. Depends on unmerged PR #39
through 22630ec. No production data, migrations or runtime dependencies changed.
