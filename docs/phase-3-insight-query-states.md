# Insights distinguish unavailable data from no pattern

A grouped audit of ConnectionCard, ProgressPanel and AdminPanel found three
missing states in the connection card. It returned nothing while stats were
pending, after failure, and when sufficient history supported no clear pattern.
Progress and adoption already had loading, failure/retry and empty handling.

ConnectionCard now announces its read, exposes Retry after failure, and states
when the completed window has no clear connection. Insufficient history keeps
the existing explanation of what evidence is missing. The comparison algorithm
and its thresholds remain in shared and are unchanged. A pending or failed read
never becomes a personal observation.

Ten tests use the real components and query hooks with mocked API boundaries.
Three connection-card assertions failed before the fix, while the other seven
passed against the existing implementation. All ten now pass. Progress checks
include retaining the range selector with empty data; adoption checks distinguish
a failed read from an empty cohort and avoid percentages without a denominator.
Resolved Progress child states and owner authorization are not proved by these
parent-state tests.

The appended browser case seeds a task to avoid first-use setup, holds the stats
read, fails it, retries an empty window and finally supplies a constant history
without a supported pattern. Each state is measured at 390px in both themes.
The screenshot rig adds error and no-pattern states. These are synthetic display
fixtures, not fresh statistical or database performance measurements. Browser
and visual results remain unverified while Actions is blocked before execution
by account billing.

The query ledger also records inspected evidence for TodayView, MoodCheckIn and
the greeting's inherited AppShell session states, with the remaining coverage
gaps stated explicitly. This follows PR #54 through bb8401e and changes no
production data, credentials, dependencies, migrations or deployment settings.

Local gates: build 6/6, forced typecheck 10/10, lint 0 errors with 3 existing
warnings, 1658 unit tests (337 web, 916 shared, 346 API, 34 AI, 25 connectors).
