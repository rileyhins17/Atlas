"""Prove that an Atlas backup restores, in a disposable, offline pgvector.

Two modes, because they answer two different questions and only one of them
belongs in CI.

  --synthetic   Build a database from this repo's own migrations, seed it with
                known counts, dump it, restore that dump, and assert every row
                came back. This proves the MECHANISM: that the schema Atlas
                actually ships can be dumped and restored, pgvector and all.
                It needs no secrets, works on a fork, and is deterministic, so
                it runs on every push.

  (default)     Restore the real dumps in .db-moves/ and assert the counts in
                .github/restore-counts.json. This proves THAT BACKUP is good,
                which is the question that actually matters — and it is a LOCAL
                drill, run on the machine where the backup already lives.

The real dumps hold three people's journal entries, finance transactions and
fitness logs. They stay on that machine: shipping them to a CI runner would
widen who can read them from one person to everyone with write access to this
repository, which is a poor trade for a check that synthetic data makes just as
well. See docs/backup-restore-drill.md.

Never reads .env or accepts a database URL. SQL output is captured, not logged:
Postgres errors can include journal text, password hashes or credential rows.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import time
import uuid

ROOT = Path(__file__).resolve().parents[2]
IMAGE = 'pgvector/pgvector:pg17'


class DrillError(Exception):
    pass


def find_dumps(directory: Path) -> list[Path]:
    dumps = sorted(directory.glob('*.dump'))
    if not dumps:
        raise DrillError('No .dump in .db-moves; a missing backup is a failed safety gate.')
    if any(path.is_symlink() or not path.is_file() or path.stat().st_size == 0 for path in dumps):
        raise DrillError('Backup must be a nonempty regular file, not a symlink.')
    return dumps


def assert_counts(actual: dict[str, int], expected: dict[str, int]) -> None:
    for table, count in expected.items():
        if actual.get(table) != count:
            raise DrillError(f'{table}: expected {count}, restored {actual.get(table, "missing")}.')


def restore_list(toc: str) -> str:
    # template0 already has public. Omit only its CREATE SCHEMA entry, never
    # tolerate arbitrary restore errors or drop anything from the database.
    return '\n'.join(line for line in toc.splitlines()
                     if not re.match(r'^\d+; \d+ \d+ SCHEMA - public ', line)) + '\n'


def command(args: list[str], *, stdin: str | None = None) -> str:
    result = subprocess.run(args, input=stdin, capture_output=True, text=True,
                            encoding='utf-8', errors='replace', timeout=600)
    if result.returncode:
        # Do not print argv/stderr: dump SQL and failing COPY rows are private.
        raise DrillError(f'{args[0]} operation failed (exit {result.returncode}); raw database output withheld.')
    return result.stdout


def restore_one(path: Path, expected: dict[str, int], index: int) -> None:
    container = 'atlas-restore-' + uuid.uuid4().hex
    created = False
    try:
        start_postgres(container)
        created = True

        def pg(tool: str, *args: str, stdin: str | None = None) -> str:
            return command(['docker', 'exec', '-i', container, tool, *args], stdin=stdin)

        def sql(query: str) -> str:
            return pg('psql', '-X', '-U', 'postgres', '-d', 'atlas_restore',
                      '--set=ON_ERROR_STOP=1', '-At', stdin=query)

        pg('createdb', '-U', 'postgres', '--template=template0', 'atlas_restore')
        command(['docker', 'cp', str(path.resolve()), container + ':/tmp/backup.dump'])
        toc = pg('pg_restore', '--list', '/tmp/backup.dump')
        schema = pg('pg_restore', '--schema-only', '--no-owner', '--no-privileges',
                    '--file=-', '/tmp/backup.dump')
        # Public-only Supabase dumps omit extension definitions, although the
        # embeddings column still refers to extensions.vector. Support both
        # placements without changing the archive's table or data entries.
        if not re.search(r' EXTENSION - vector(?: |$)', toc, re.MULTILINE):
            vector_schema = 'extensions' if 'extensions.vector' in schema else 'public'
            if vector_schema == 'extensions':
                sql('CREATE SCHEMA extensions;')
            sql(f'CREATE EXTENSION vector WITH SCHEMA {vector_schema};')
        if not re.search(r' EXTENSION - pgcrypto(?: |$)', toc, re.MULTILINE):
            sql('CREATE EXTENSION pgcrypto;')
        with tempfile.TemporaryDirectory() as temporary:
            listing = Path(temporary) / 'restore.list'
            listing.write_text(restore_list(toc), encoding='utf-8')
            command(['docker', 'cp', str(listing), container + ':/tmp/restore.list'])
        pg('pg_restore', '-U', 'postgres', '--dbname=atlas_restore',
           '--no-owner', '--no-privileges', '--exit-on-error', '--single-transaction',
           '--use-list=/tmp/restore.list', '/tmp/backup.dump')
        actual = {table: int(sql(f'SELECT COUNT(*) FROM public."{table}";').strip())
                  for table in expected}
        assert_counts(actual, expected)
        if sql("SELECT count(*) FROM pg_extension WHERE extname = 'vector';").strip() != '1':
            raise DrillError('Restored database has no pgvector extension.')
        if sql("SELECT t.typname FROM pg_attribute a JOIN pg_type t ON t.oid = a.atttypid "
               "WHERE a.attrelid = 'public.embeddings'::regclass AND a.attname = 'embedding' "
               "AND NOT a.attisdropped;").strip() != 'vector':
            raise DrillError('Restored embeddings.embedding is not a vector column.')
        print(f'Archive {index}: restore succeeded; exact counts {json.dumps(actual, sort_keys=True)}; pgvector verified.')
    finally:
        if created:
            # Only this invocation's freshly created container, including its
            # anonymous volume. No SQL deletes; no production connection exists.
            command(['docker', 'rm', '-f', '-v', container])


SEED = {'tasks': 37, 'journal_entries': 11, 'timeline_events': 53, 'workouts': 5}


def migration_sql() -> str:
    """Every migration, in the order Prisma applies them.

    Reading the real migrations rather than a hand-written fixture is the point:
    a drill against a schema nobody ships proves nothing about the schema
    everybody does.
    """
    directory = ROOT / 'packages/db/prisma/migrations'
    files = sorted(directory.glob('*/migration.sql'))
    if not files:
        raise DrillError('No migrations found; cannot build a synthetic database.')
    return '\n'.join(path.read_text(encoding='utf-8') for path in files)


def seed_sql() -> str:
    """Known row counts, and nothing resembling anyone's real data."""
    rows = [
        "INSERT INTO users (id, email, \"passwordHash\", \"updatedAt\") "
        "VALUES ('drill-user', 'drill@example.invalid', 'not-a-hash', NOW());",
    ]
    rows.append(
        f"INSERT INTO tasks (id, \"userId\", title, \"updatedAt\") "
        f"SELECT 'task-' || i, 'drill-user', 'drill task ' || i, NOW() "
        f"FROM generate_series(1, {SEED['tasks']}) AS i;"
    )
    rows.append(
        f"INSERT INTO journal_entries (id, \"userId\", \"entryDate\", body, \"updatedAt\") "
        f"SELECT 'journal-' || i, 'drill-user', NOW(), 'drill entry ' || i, NOW() "
        f"FROM generate_series(1, {SEED['journal_entries']}) AS i;"
    )
    rows.append(
        f"INSERT INTO timeline_events (id, \"userId\", type, source, title) "
        f"SELECT 'timeline-' || i, 'drill-user', 'drill.created', 'drill', 'drill ' || i "
        f"FROM generate_series(1, {SEED['timeline_events']}) AS i;"
    )
    rows.append(
        f"INSERT INTO workouts (id, \"userId\", \"updatedAt\") "
        f"SELECT 'workout-' || i, 'drill-user', NOW() "
        f"FROM generate_series(1, {SEED['workouts']}) AS i;"
    )
    return '\n'.join(rows)


def synthetic_dump(directory: Path) -> Path:
    """Migrate, seed and dump — producing a real archive with no real data in it."""
    container = 'atlas-seed-' + uuid.uuid4().hex
    created = False
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / 'synthetic-snapshot.dump'
    path.unlink(missing_ok=True)
    try:
        start_postgres(container)
        created = True

        def pg(tool: str, *args: str, stdin: str | None = None) -> str:
            return command(['docker', 'exec', '-i', container, tool, *args], stdin=stdin)

        pg('createdb', '-U', 'postgres', 'atlas_seed')
        for statements in (migration_sql(), seed_sql()):
            pg('psql', '-X', '-U', 'postgres', '-d', 'atlas_seed', '--set=ON_ERROR_STOP=1',
               stdin=statements)
        pg('pg_dump', '-U', 'postgres', '--format=custom', '--no-owner', '--no-privileges',
           '--file=/tmp/synthetic.dump', 'atlas_seed')
        command(['docker', 'cp', container + ':/tmp/synthetic.dump', str(path.resolve())])
    finally:
        if created:
            command(['docker', 'rm', '-f', '-v', container])
    if not path.is_file() or path.stat().st_size == 0:
        raise DrillError('Synthetic dump was not produced.')
    return path


def start_postgres(container: str) -> None:
    """A throwaway server with no network and no published port."""
    command(['docker', 'run', '-d', '--name', container, '--network', 'none',
             '--label', 'atlas.restore-drill=true',
             '-e', 'POSTGRES_HOST_AUTH_METHOD=trust',
             IMAGE])
    for _ in range(60):
        # The entrypoint's temporary init server only accepts Unix sockets.
        # TCP readiness proves the final server is up, avoiding its shutdown.
        ready = subprocess.run(
            ['docker', 'exec', container, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres'],
            capture_output=True, timeout=10)
        if ready.returncode == 0:
            return
        time.sleep(1)
    raise DrillError('Throwaway Postgres did not become ready.')


def main() -> None:
    args = sys.argv[1:]
    command(['docker', 'pull', IMAGE])

    if '--synthetic' in args:
        # CI's path. Nobody's data is involved, so this can run on every push
        # and on a fork, and it still exercises the real migrations.
        with tempfile.TemporaryDirectory() as workspace:
            dump = synthetic_dump(Path(workspace))
            restore_one(dump, SEED, 1)
        print('Synthetic restore drill passed: the shipped schema dumps and restores intact.')
        return

    # The local path: prove the REAL backup is good, on the machine that holds it.
    directory = ROOT / '.db-moves'
    dumps = find_dumps(directory)
    expected = json.loads((ROOT / '.github/restore-counts.json').read_text())
    if (not expected or any(not re.fullmatch(r'[a-z_]+', table) or type(count) is not int or count < 0
                            for table, count in expected.items())):
        raise DrillError('Invalid restore count manifest.')
    for index, path in enumerate(dumps, 1):
        restore_one(path, expected, index)


if __name__ == '__main__':
    try:
        main()
    except DrillError as error:
        print(f'FAIL: {error}', file=sys.stderr)
        sys.exit(1)
    except Exception:
        print('FAIL: restore drill could not complete; raw output withheld to protect backup data.', file=sys.stderr)
        sys.exit(1)
