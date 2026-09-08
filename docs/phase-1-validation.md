# Phase 1 cumulative correctness gate

This branch assembles the reviewed Phase 1 slices on the verified synthetic
restore work. It exists to test their interactions before architecture changes.
Independent PR checks are evidence for those patches, not a substitute for this
combined gate. None of these PRs has been merged into the live checkout by this
task.

## Source patches

| PR | Tested commit | Observed independent CI run |
| --- | --- | --- |
| #3 synthetic recovery | `dcfc1fc` | `34173993705` |
| #4 calendar boundaries | `d537cbc` | `34174694326` |
| #5 AI summaries | `0908fbe` | `34175037551` |
| #6 keyed lookups and sync batches | `3bff1f7` | `34175546442` |
| #7 habit aggregation | `b1c12f0` | `34176033531` |
| #8 complete collection pages | `bcc2be1` | `34177461270` |
| #9 embedding writes | `2032021` | `34177775537` |
| #10 recurrence weeks | `074986d` | `34178077067` |
| #11 bank reconciliation | `0055626` | `34178593364` |

All listed runs were observed green. The individual browser suites reported
48 passes and one skip, except the habit and collection branches, which each
reported 49 passes and one skip plus one passing independent regression run.
Embedding CI verified nine rows, two inference chunks, one write and actual
768-dimensional vectors. Plaid CI verified 251 accounts and 251 transactions
in four statements, replay, duplicate ids, tenant isolation and cursor holds.

## Audit coverage

- **List bounds:** runtime `findMany` calls across API, web and all workspace
  packages have explicit `take` properties. `query-contracts.test.ts` enforces
  this with the TypeScript parser. Unique-key lookups derive their bound from
  the distinct keys. Complete-array endpoints use bounded cursor pages with
  explicit row/byte ceilings. Additive habit logs are aggregated in Postgres.
  Query limits and collection-overflow regressions were observed failing first.
- **Database awaits in loops:** the direct Prisma-await audit found none in
  the assembled API and AI source. The call-chain review also replaced Plaid's
  per-account and per-transaction reconciliation, and embedding per-row writes.
  Google lookup chunks use a concurrency ceiling of four. Sequential cursor
  pages and bounded SQL write batches remain deliberate dependencies. This
  does not claim that an entire AI tool loop or per-user generation contains
  no database work: those operations have distinct authorization and effects.
- **AI summaries:** all ten domain summaries were inspected. Notes, trackers,
  accounts, journal entries and workouts now expose the ids they describe;
  date-bearing journal, workout, task and goal summaries use the user's local
  calendar. Calendar already rendered ids and named-zone times. Routine times
  are stored local minutes, not UTC timestamps. Aggregated statistics and
  exercise-group summaries are not represented as individually editable rows.
- **Timers:** the three scheduled database entry points are session cleanup,
  embedding sweep and proactive sweep. Each checks ActivityService. Existing
  gates were already correct. Three new failure/idle regressions were mutation
  tested: temporarily removing the gates produced six calls instead of one
  for each service; restoring them made all three pass. No gate removal is
  retained. The full targeted idle suite passed 25 tests.
- **Calendar arithmetic:** local midnight and week boundaries, task rollover,
  statistics windows and recurrence interval weeks use calendar boundaries or
  calendar-day iteration. DST regressions were observed failing before their
  fixes. Remaining fixed-duration arithmetic is for rolling fetch/lookback
  windows, maximum elapsed query spans, or subtraction of UTC date-only keys.
  In particular, the agenda fetch explicitly uses an elapsed window; the Day
  Canvas uses `addDays` for a real local day. The protected first-capture error
  guard in `packages/ai/src/orchestrator.ts` is unchanged.

## Integration adjustments and final evidence

Conflict resolution retains every added GOTCHAS section, both appended browser
regressions, both independent browser invocations and both database CI checks.
The bank-disconnect fixture now includes the ids required by collection paging.
An initial targeted test run used stale shared-package output and failed with
missing time exports; rebuilding `@atlas/shared` resolved all eleven failures.
The eight affected test files then passed all 50 tests.

The final local gates passed: build 6/6, forced typecheck 10/10, lint with zero
errors and three existing warnings, and 1,367 unit tests (API 346, shared 332,
web 587, AI 59, connectors 43). The 15 Python restore-safety tests also passed.
Local Playwright and database checks are skipped; the combined CI result is
pending. Phase 2 must not begin before this combined PR is open and its final
CI run is green.
