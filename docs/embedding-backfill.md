# Embedding backfill consistency

The inference model processes at most eight texts at a time. Database work is
batched separately: the service reads at most fifty pending rows, gathers the
successful inference chunks, then applies their vectors in one parameter-bound
`UPDATE ... FROM (VALUES ...)` statement. A failed inference chunk remains
pending without preventing successful chunks from being written.

The update matches each row's id, user id, original content and pending model.
A row edited or completed by another request during inference is left alone;
its stale vector is not attached to the new content. The result reports the
database's actual affected-row count. The failed count includes inference
failures and rows skipped because their input changed. A database statement
failure is atomic and reports all selected rows as failed.

The existing ActivityService timer gate and one-time startup drain are retained.
This does not change the local model, search endpoints or retry scheduling.

Three regressions were observed failing before implementation: nine writes for
nine rows, reporting two processed rows when only one was updated, and a partial
write when inference omitted a vector. Unit tests also cover mixed chunk
success, database failure and empty queues.

`.github/scripts/check-embedding-batch.mjs` exercises the compiled service against
CI's disposable pgvector database with a synthetic embedder. It asserts a
nine-row batch uses two inference calls and one write, stores 768-dimensional
vectors, leaves another account untouched, and preserves content, owner and
model changes made during inference. It does not download or benchmark the
real inference model. The script refuses other database URLs and performs no
row deletion; the CI container owns cleanup.
