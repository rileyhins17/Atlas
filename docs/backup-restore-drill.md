# Synthetic backup restore drill

CI exercises the actual `infra/db-move.py` dump, restore and counts commands on
every push and pull request. All data is invented. The production dump stays on
its owner's PC: it must never reach CI, an artifact store, a GitHub secret, or
an environment an agent can read. No private storage configuration is needed.

The `Prove synthetic backup restores` job:

1. Starts a disposable `pgvector/pgvector:pg16` service.
2. Runs `pnpm --filter @atlas/db migrate:deploy` on `atlas_restore_source`.
3. Seeds two fictional users, seven tasks, five journal entries, three workouts,
   two finance accounts, four transactions, seven timeline events and two
   768-dimensional vectors. It checks these known counts before taking a dump.
4. Runs `db-move.py counts DIRECT_DATABASE_URL` and `db-move.py dump <temp-file>`.
5. Drops only the synthetic source database and creates `atlas_restore_target`
   from `template0`. It provisions vector/pgcrypto extensions; it does not
   migrate or seed this target.
6. Runs `db-move.py restore RESTORE_DATABASE_URL <temp-file>`, then
   `db-move.py counts RESTORE_DATABASE_URL`. `diff` requires every public table's
   exact count to match, including empty tables and the migration ledger.
7. Reasserts the known fixture counts and exercises vector dimensions and
   distance operators on the restored values.

Any migration, seed, dump, restore, count or vector check failure fails CI.
The runner deletes the synthetic dump on success or failure; Actions disposes
of its database service and volume. No dump is uploaded or put in `.db-moves`.

## Changes to the existing CLI

The CLI still passes credentials as PG* environment variables, never argv. It
now accepts connection URLs from the process environment before its local
`.env` fallback. Under `CI`, a missing URL fails without reading `.env`, and an
explicit synthetic dump path is mandatory. The `PG_BIN` environment variable
selects PostgreSQL clients matching the CI server; the Windows default remains
PostgreSQL 17. An explicit URL `sslmode` is honoured for the local test service;
the default remains `require`.

Restores now target the database named in the selected URL and use
`--exit-on-error --single-transaction`. A failed restore exits nonzero rather
than printing the failure and returning success. Raw database error output is
withheld because failed COPY statements can include row contents. A dump will
not overwrite an existing backup file.

Counts use `COUNT(*)` for every public table, not `pg_stat_user_tables` estimates.
PostgreSQL quotes table identifiers before executing these read-only queries.

The CLI regression tests run without PostgreSQL:

```bash
python -m unittest discover -s .github/scripts -p 'test_*.py'
```

This proves the restore mechanism with the current schema and synthetic data.
It does not prove the integrity or freshness of the private production archive,
register nightly backups, or verify production encryption-key recovery. Those
remain owner-operated work outside CI.
