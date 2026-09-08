# Complete collection reads

Some Atlas services need a complete collection: a workout split must resolve
every selected movement, a calendar shift must consider every event in its
window, and an exercise picker must retain the final page of the catalog.
An arbitrary `take` followed by returning the first page silently changes those
operations. An unlimited `findMany` gives the API no resource boundary.

`apps/api/src/core/collection-pages.ts` provides `readCollection` for these
existing array contracts. It reads at most 250 records per database query and
continues by unique id cursor. Each caller preserves its owner and domain
filters, retains its existing sort fields, and adds id as a deterministic tie
breaker. A selected projection must include id for the cursor; DTO mapping
still determines the public response.

The accumulator accepts at most 10,000 rows and 8 MiB of serialized row content.
Crossing either ceiling produces a typed HTTP 413 error, never a partial array.
This is a deliberate protective error for oversized collections that previously
had no limit. Large account exports continue to use their separate streaming
implementation. The accumulator is not an unbounded export mechanism.

A duplicate or missing cursor id fails with HTTP 503 instead of looping or
returning duplicate records. As with ordinary cursor pagination, reads are not
a transactionally frozen snapshot of concurrent edits. Existing order fields
are retained; no promise of snapshot isolation is introduced.

## Applied reads

- Open AI questions.
- Workout templates, split-planning catalogs, and proposal name resolution.
- Shared exercise seeding and the full exercise picker.
- Goals and routine blocks, including records predating current write quotas.
- Tracker entries used for pattern analysis.
- Linked-bank metadata and push subscriptions.
- Events considered by a same-day schedule shift.

This covers fourteen previously unbounded queries. Other categories have more
specific treatments: unique-id lookups can derive `take` from their key count,
and additive habit logs are aggregated by day in Postgres rather than loaded
into this accumulator.

## Verification

Four regressions were observed failing before implementation: collections of
251, 500 and 511 questions lacked page limits, and 10,001 questions were returned
without a resource guard. Tests now retain all ids across page boundaries and
check empty/exact-page cases, stalled cursors, row ceilings and byte ceilings.

The real-database e2e case creates a movement whose name sorts after the shipped
catalog and checks that it survives the complete paged read without duplicates.
CI runs the case both with the full suite and independently. Its result must
be observed before this PR's database behavior is considered verified.
