# The restore drill

An unrestored backup is a hypothesis. This is how Atlas tests it, and why the
test is split in two.

There are two different questions here, and conflating them is how you end up
either with a check that proves nothing or with three people's journals on a
CI runner:

| Question | Answered by | Runs |
|---|---|---|
| Can a dump of Atlas's schema be restored at all? | a **synthetic** drill | CI, every push |
| Is *this particular backup* good? | a **local** drill on the real dump | the machine holding it |

---

## The CI drill — synthetic, every push

```bash
python3 .github/scripts/restore_backup.py --synthetic
```

It builds a database from this repository's own migrations, seeds known row
counts, dumps it, restores that dump into a second throwaway server, and asserts
every row came back — plus that pgvector is present and `embeddings.embedding`
really is a `vector` column, because a "successful" restore that quietly leaves
that column as `bytea` is the failure mode that matters here.

Reading the real migrations rather than a hand-written fixture is the point: a
drill against a schema nobody ships proves nothing about the schema everybody
does. If a migration ever produces something that cannot round-trip through
`pg_dump`, this goes red on the commit that introduced it.

It needs no secrets, so it works on a fork, and it is deterministic.

**Why it does not restore the production dump.** That file holds three people's
journal entries, finance transactions and fitness logs. Fetching it into a
GitHub-hosted runner would widen who can read it from one person to everyone
with write access to this repository — anyone who can add a workflow can print a
secret — plus GitHub's own infrastructure. That is a poor trade for a check that
synthetic data makes equally well. The real dump never leaves the machine that
made it.

There is a second, practical reason. Asserting exact row counts against a live
database means the gate goes red the next time somebody adds a task. A check
that is permanently failing for a boring reason is a check everybody learns to
ignore.

---

## The local drill — the real dump, where it lives

The nightly backup already refuses to call a dump a backup unless it contains
the tables:

```bash
powershell -File infra/atlas-backup.ps1
```

It counts `TABLE DATA public` entries in the archive and fails below 15. This
exists because the alternative happened: with `DATABASE_URL` pointed at an
empty project mid-migration, the 03:30 run dumped it happily, wrote 0.2 MB, and
logged `ok`. Not one application table was in it, and the 14-day rotation would
have replaced every good backup with that.

Counting tables is not the same as restoring, though, so the full drill is still
outstanding and still needs a person:

```bash
# With Docker available:
python3 .github/scripts/restore_backup.py

# Reads .db-moves/*.dump, restores each into a disposable offline container,
# and asserts the counts in .github/restore-counts.json.
```

**Both are currently blocked on this machine**: Docker Desktop does not start
here, and the locally installed PostgreSQL 17 server needs a superuser password
that is not in `.env`. Until one of those is resolved, the real dump has been
verified by *inspection* (`pg_restore --list` shows 27 `public` tables) and not
by restoration. Say that accurately; do not describe it as drilled.

`.github/restore-counts.json` holds the counts to assert. Update it when the
real numbers move, or the local drill will fail for the wrong reason.

---

## What the drill will not do

- It never reads `.env` and never accepts a database URL, so it cannot be
  pointed at production by accident.
- The throwaway container runs with `--network none` and no published port.
- Postgres output is captured, never logged: a failing `COPY` line contains the
  row it choked on, which here means journal text or a password hash.
- It removes only the container it created, with its anonymous volume. It runs
  no `DROP` against anything it did not make.
