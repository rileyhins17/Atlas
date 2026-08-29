# Moving Atlas off Neon and onto Supabase

Written 28 Aug 2026, while Neon's compute quota was exhausted and the database
was refusing every query including reads. **That is the constraint that shapes
this whole document:** the schema can be stood up on Supabase today, but the
existing rows cannot be copied until Neon lets us connect again.

So it splits into two halves that do not have to happen together:

| | Needs | Can be done |
|---|---|---|
| **A. Stand up the schema and point Atlas at it** | a Supabase project | now |
| **B. Copy the existing data across** | Neon readable again | only once the quota resets or the plan changes |

Doing A alone gives a working app with **empty** tables — three accounts would
have to sign up again. Doing A then B later means signing in twice and losing
anything written in between. Decide which you want before starting.

---

## What does NOT need to change

Nothing in the application is Neon-specific. Every `Neon` in the repo is a
comment or a log string. The move is two connection strings.

- `packages/db/prisma/schema.prisma` already takes `url` (pooled) and
  `directUrl` (direct, for migrations) from the environment.
- The 15 migrations contain no `CREATE ROLE`, no `OWNER TO`, no `CREATE SCHEMA`
  and no `SET search_path` — audited. The only privileged statements are:
  ```sql
  CREATE EXTENSION IF NOT EXISTS "pgcrypto";
  CREATE EXTENSION IF NOT EXISTS "vector";
  ```
  Supabase's `postgres` role may create both.

**The from-scratch path is already proven.** CI's e2e job stands up a virgin
`pgvector/pgvector:pg16` container, runs `migrate:deploy` against it and then
drives the full Playwright suite — so "the 15 migrations apply cleanly to an
empty database with pgvector available" is asserted on every push, not assumed
here. What CI does *not* cover is the two Supabase-specific things below:
which schema `vector` lives in, and reaching the host over IPv4.

## A. Stand up the schema

### 1. Create the project (Riley — I cannot create accounts)

Supabase → new project. Note the database password it shows you **once**.
Pick the region closest to Toronto (`us-east-1`) to keep round-trips short —
the API is in Ontario on a home connection.

### 2. Take BOTH connection strings from Connect → ORMs → Prisma

You need two, and picking the wrong pair is the most common way this fails:

| Variable | Which Supabase string | Port |
|---|---|---|
| `DATABASE_URL` | Transaction pooler, `?pgbouncer=true` | 6543 |
| `DIRECT_DATABASE_URL` | **Session pooler** | 5432 |

**Use the session pooler for the direct URL, not `db.<ref>.supabase.co`.** The
direct host is IPv6-only on new projects unless you pay for the IPv4 add-on, and
this PC's connection will simply time out against it. The session pooler is
IPv4 and supports the session state that `migrate deploy` needs.

Keep `connection_limit=5` on the pooled URL, for the reason in the schema
comment: Prisma otherwise opens `num_cpus * 2 + 1` — 25 on this desktop — and
every one is a real backend.

### 3. Put them in `.env` yourself

`.env` is gitignored and must stay that way. **Edit the file directly; do not
paste the URLs into a chat.** The Plaid production secret is still on the
rotate list precisely because it went into a transcript once.

```
DATABASE_URL=postgresql://postgres.<ref>:<password>@aws-0-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=5
DIRECT_DATABASE_URL=postgresql://postgres.<ref>:<password>@aws-0-us-east-1.pooler.supabase.com:5432/postgres
```

### 4. Apply the migrations

`migrate deploy` runs with its CWD at `packages/db`, and Prisma only reads a
`.env` beside the schema or in the CWD — it will **not** see the repo-root file
and fails `P1012 Environment variable not found`. Set it inline:

```bash
DIRECT_DATABASE_URL="<the 5432 session-pooler url>" pnpm --filter @atlas/db migrate:deploy
```

Then regenerate the client:

```bash
pnpm --filter @atlas/db generate
```

### 5. Verify, do not assume

Two things actually go wrong here, so check both rather than trusting a clean
`migrate deploy`:

```sql
-- 1. pgvector resolved to a real vector column, not a fallback.
select atttypid::regtype as type
from pg_attribute
where attrelid = 'embeddings'::regclass and attname = 'embedding';
-- expect: vector

-- 2. All 15 migrations recorded, none failed.
select count(*) filter (where finished_at is not null) as applied,
       count(*) filter (where rolled_back_at is not null) as rolled_back
from _prisma_migrations;
-- expect: 15, 0
```

Supabase ships `vector` pre-installed in the `extensions` schema, so the
`CREATE EXTENSION IF NOT EXISTS` is a no-op and the `vector(768)` column type
only resolves because `extensions` is on the database's `search_path`. If query
1 comes back as anything other than `vector`, that is why — fix the search_path
rather than editing the migration.

### 6. Restart the origin

```bash
powershell -File "infra/Atlas Server.cmd"
```

Stop, then Start, so the API picks up the new `.env`. Then confirm the API can
actually reach it — this is the one probe that is meant to be run by hand:

```bash
curl "http://localhost:4000/health?probe=1"
```

Expect `{"status":"ok","db":"ok",...}`. **Never put `?probe=1` in the watchdog**
— see `GOTCHAS.md`; that is how the last quota got burned.

## B. Copy the data across (only once Neon is readable)

Check first, cheaply:

```bash
curl "http://localhost:4000/health?probe=1"
```

with `.env` still pointing at Neon. While it answers `db: down` with the quota
error, nothing below can run.

Once it answers `ok`:

```bash
# Schema is already on Supabase, so data only. Exclude Prisma's own ledger —
# the target already has its own correct copy from `migrate deploy`.
pg_dump "<neon direct url>" \
  --data-only --no-owner --no-privileges --disable-triggers \
  --exclude-table=_prisma_migrations \
  -f atlas-data.sql

psql "<supabase session pooler url>" -f atlas-data.sql
```

`pg_dump` must be **at least** the server's major version. Neon is PG17, so use
a PG17 client; an older `pg_dump` refuses outright.

Then verify against what we know is there — **the database has 3 accounts**, and
the count is the cheapest proof the copy landed:

```sql
select (select count(*) from users)  as users,
       (select count(*) from tasks)  as tasks,
       (select count(*) from embeddings) as embeddings;
```

Compare to the same query against Neon before switching `.env` over.

### The embeddings will need re-checking

`embedding` is a `vector(768)` column. `pg_dump` writes it as a text literal and
Postgres casts it back, so it copies fine — but rows whose `model` is still
`pending` are unembedded, and any that fail to copy are invisible until a search
returns nothing. After the copy:

```sql
select model, count(*) from embeddings group by model;
```

Anything left on `pending` drains on its own now: the sweep runs on the next
real request, and there is a `POST /ai/embeddings/backfill` to force it.

## Afterwards

- Keep the Neon project until the row counts have been compared and Atlas has
  run a day against Supabase. Deleting it is the one irreversible step here.
- Supabase free **pauses a project after 7 days with no activity**. Atlas is
  used daily so this should never fire, and unpausing is a manual click in the
  dashboard — but it is the equivalent trap to the one that just bit us, so it
  is worth knowing it exists.
- Update the two Neon references that would become wrong: the `Test-Config`
  message in `infra/atlas-server.ps1` and the comment in `schema.prisma`.
- CI is unaffected: `.github/workflows/ci.yml` migrates against its own
  throwaway `pgvector/pgvector:pg16` service container, not a hosted database.
  Nothing in the workflow points at Neon or Supabase.
