# Task title edits wait for confirmation

TaskRow closed the title editor before its update request settled. A failed save
rolled the row back but hid the draft. Leaving the input also saved implicitly,
making a focus change a write and leaving no visible Cancel action.

The editor now has explicit Save and Cancel controls. Enter saves, Escape cancels
when idle, and blur keeps the unfinished draft open. A failed save keeps the text
and an inline message. A pending update makes the input read-only and prevents
duplicate title submissions; completing, reprioritizing or deleting that row is
disabled until it settles. Reopening initializes the editor from the current
saved title rather than its first render. The field stays at 16px and shares the
mobile title width floor; controls can wrap.

Three regression tests failed first against the real component with its actual
mutation hook and mocked API. They now pass: failed title retained and retried,
pending input protected, and leaving an unfinished edit does not write it.

The new browser case creates its own task, types a title, fails its PATCH,
measures the retained editor, retries the real API, reloads, and verifies that
task's saved ID and title. It covers light/dark at 390px in full and independent
selections. Both-theme error-editor screenshots are also configured. These
browser and visual results remain unverified while GitHub Actions is refusing
jobs before execution because of account billing.

This slice follows PR #52 through f873b0d. Duration-hint query states remain a
separate audit gap. No production data, credentials, migrations, runtime
dependencies or deployment changes are included.

Final local gates after the mobile width adjustment: build 6/6, forced
typecheck 10/10, lint 0 errors with 3 existing warnings, 1643 unit tests
(322 web, 916 shared, 346 API, 34 AI, 25 connectors).
