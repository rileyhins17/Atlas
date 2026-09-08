# Phase 3: workout recovery

This branch is split from first-use PR #32 and depends on it through cd63d41.
It targets main and therefore includes unmerged prerequisite work. No merge or
deployment is included.

The workout builder now distinguishes pending, failed and empty catalogs, keeps
its draft across retry, and prevents edits to the exercise list or saves while
the catalog is unavailable. Active sessions retain logged sets and notes while
planned exercises load or fail. Finishing remains available when historical
comparisons cannot be read; the shared summary marks that explicitly and the
dialog explains it instead of silently presenting absent comparisons.

Fitness's start/progress screen now gates saved-day suggestions, distinguishes
failed history from a first workout, and waits for the exercise catalog before
rendering progress. Existing endpoints, grams storage and workout mutations are
unchanged. No runtime dependencies or migrations were added.

Observed-red regressions: three builder states, four active-session/summary
states, four FitnessPanel states and two shared summary cases. They then passed
as eleven component cases plus twenty strength/summary tests. A first component
run used stale shared dist output; rebuilding @atlas/shared fixed that import.
The final monorepo gates run after the normal build.

The new self-seeded browser case creates a workout and real set, intercepts only
its history read with 503, types notes, finishes, reads the saved session and
checks endedAt, notes and 50000 grams of volume. It is included in the full and
independent CI runs. Browser results are pending.

Remaining scope: read-only unit preference states, other fitness editors and
history views still need the consolidated audit. Summary comparisons currently
use the existing recent-20-workouts query; broader all-history record accuracy
is a separate unresolved limitation, not proven by the unavailable-read fix.

Final local gates: build 6/6, forced typecheck 10/10, lint zero errors
with three existing warnings, 1536 unit tests passed. The initial forced
typecheck caught two test-only uses of Playwright’s exact option with Testing
Library; those were removed before all four gates were rerun successfully.
The new browser outage/persistence case and screenshot run are pending CI.
