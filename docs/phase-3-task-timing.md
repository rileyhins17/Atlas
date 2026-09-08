# Task timing has one state for the list

TaskRow previously owned the duration query and silently omitted estimates when
it was pending or failed. Tracing every caller showed that TasksPanel is the
only component rendering TaskRow, so query recovery belongs at that list level.

TasksPanel now reads timing once and passes confirmed estimates into its rows.
The list footer distinguishes pending timing, failure with Retry and confirmed
missing estimates. Task controls and the new-task draft remain usable. The read
is disabled when the current view has no open tasks. Learned-duration calculation
and its five-minute cache window are unchanged; no new estimate is invented.

Three actual-component regression cases failed first. Seven focused timing and
title-edit tests pass after the fix, including one state across multiple rows,
draft retention through retry, a recovered 45-minute estimate, confirmed empty
estimates and no timing request for an empty list.

The browser case supplies a synthetic duration response, fails and retries it,
then saves the retained new-task draft through the real API and verifies the
saved task ID and title after reload. Failure and recovery are measured at 390px
in both themes, with full and independent selection. Error-state screenshots
are also configured. Browser and visual results remain outstanding while Actions
is blocked before execution by account billing. The supplied estimate is a
display fixture, not a new measurement of task duration or API performance.

The direct-query inventory now has 38 hooks in 45 component files. TaskRow still
receives query-derived state through props and retains its own title-edit
coverage. This follows PR #56 through feed745, without production data,
credential, runtime dependency, migration or deployment changes.

Local gates passed in order: build 6/6; forced typecheck 10/10; lint 0 errors
with 3 existing warnings; 1666 unit tests (345 web, 916 shared, 346 API,
34 AI and 25 connector). Browser execution and PNG inspection for this slice
remain unverified.
