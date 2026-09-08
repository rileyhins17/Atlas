# History keeps loaded pages during recovery

The history feed sits behind Everything that happened in LookingBackPanel. Its
useTimeline hook uses useInfiniteQuery, which the previous query inventory
missed. Including infinite queries finds 38 query-backed hooks across 46
component files. The hook is reachable through LookingBackPanel → HistoryPanel
→ Feed; it is not unused simply because a route file does not import it directly.

Feed previously replaced all loaded rows with an error when a subsequent page
failed. It also treated unavailable task details as an empty task list, removing
completion actions without explanation. Loaded history now remains readable
during page or refresh failures, with a separate retry for the failed read.
Task-action reads have loading and error/retry states, and unavailable details
do not expose stale completion actions. First-page failure and confirmed empty
history retain their existing distinct states.

Three actual-hook regression cases failed first; all four focused cases now
pass. The next-page case verifies that retry asks for offset 50 and keeps the
original row. The task-action case retries the separate task query while leaving
history visible. The fourth case proves first-page failure recovers to empty.

The new browser case provides synthetic timeline pages, fails the earlier page
and task read, recovers both, then uses the recovered action to complete a real
synthetic task and verifies that task ID has status DONE through the API. Error
and recovered states are measured at 390px in both themes. The screenshot rig
captures the error state with its loaded row retained. Browser and PNG results
are outstanding because Actions is blocked before execution by account billing.
The paginated timeline fixture does not prove server-side pagination behavior.

This follows PR #55 through d242d05. No production data, credentials, runtime
dependencies, migrations or deployment changes are included.

Local gates: build 6/6, forced typecheck 10/10, lint 0 errors with 3 existing
warnings, 1662 unit tests (341 web, 916 shared, 346 API, 34 AI, 25 connectors).
