# Bounded bank reconciliation

Plaid sync previously issued one account upsert per account, then one existence
read and one write per transaction. The 251-account regression fixture was
observed failing with 251 account upserts before the change.

The reconciler now uses parameter-bound upserts in pages of at most 250 unique
records. Accounts return the ids used to place transactions. Transactions return
their preserved or newly inserted ids, so the service distinguishes imports
from updates without a pre-read or Postgres system-column heuristics. New rows
receive opaque UUID ids; existing ids and creation timestamps are preserved.
The public DTOs accept opaque string ids.

Each page is atomic. Pages execute sequentially to keep connection pressure
bounded; there is one database call per page rather than per record. Earlier
successful pages can remain stored if a later page fails. The sync cursor is
held on failure, so replay reconciles them idempotently.

Repeated external ids are collapsed before SQL because one upsert statement
cannot update the same conflict key twice. The last supplied version wins,
matching the prior added-then-modified sequence. Imported/updated totals retain
the number of supplied occurrences: a new id supplied twice reports one import
and one update, while an existing id supplied twice reports two updates.

Every conflict key includes user id, source and external id. Unknown account
transactions still produce an error and prevent cursor advancement. Existing
removal behavior is unchanged. Tests and CI fixtures use no real bank access.

The unit suite checks parameter mappings and batch counts. The CI-only
`.github/scripts/check-plaid-batches.mjs` runs the compiled service against the
disposable Postgres container: 251 accounts and transactions, four statements,
signed amounts, replay without duplicate rows, duplicate-id correction, stable
ids, another tenant's matching external ids, and cursor retention for an unknown
account. It uses only synthetic records and leaves cleanup to container disposal.
