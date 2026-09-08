# Goals and Habits: unknown data is not empty data

Expanded goals previously displayed the empty linked-task prompt while the task
request was pending or failed. The list now has a loading skeleton and error
with Retry; the add-step draft remains mounted through recovery. The icon-only
submit button also has an accessible name.

Habits previously drew blank activity grids while its independent history
request was pending or failed. Cards now retain check-in controls but show an
explicit loading or retry state until history arrives. A successful empty
history states that no check-ins were recorded. The screen displays 26 weeks;
its request now covers the corresponding 182 days rather than only 84 days.
The existing UTC history-day versus user-timezone calendar mismatch is a
separate domain limitation and is not claimed fixed here.

Five component regressions were observed failing before the changes: goal
pending and failure, habit pending and failure, and the 84/182-day discrepancy.
The focused run then passed nine tests including existing duplicate-habit
coverage. The browser case creates its own goal, linked task and habit through
the disposable API. It interrupts the detail reads, retries, checks the saved
task and retained draft, and measures both recovered screens at 390px in light
and dark. Browser results remain pending until observed in CI.

This is a Phase 3 slice depending on unmerged PR #42 through e6d91bb. No runtime
dependencies, migrations, credentials or production changes are included.

CI run 34273089295 passed build/unit and synthetic restore jobs. The full
browser suite reported 61 passed, 1 skipped and 2 failed. The new detail-read
recovery case passed. An older goal-creation case used a label-only locator
that now matched both the input and the newly named submit button; it now
selects the textbox by role and types through real keystrokes. The other
failure is the inherited notification permission fixture, corrected here with
an explicit permission-read stub. Corrected CI remains pending.
