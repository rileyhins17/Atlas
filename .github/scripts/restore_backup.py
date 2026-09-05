"""Restore private .db-moves/*.dump archives into disposable, offline pgvector.

Never reads .env or accepts a database URL. SQL output is captured, not logged:
Postgres errors can include journal text, password hashes or credential rows.
"""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import time
import urllib.request
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


def verify_digest(path: Path, expected: str) -> None:
    if not re.fullmatch(r'[0-9a-fA-F]{64}', expected):
        raise DrillError('Configure the backup SHA-256 before downloading.')
    with path.open('rb') as stream:
        actual = hashlib.file_digest(stream, 'sha256').hexdigest()
    if actual != expected.lower():
        raise DrillError('Backup SHA-256 mismatch; refusing to restore.')


def download_backup(directory: Path) -> None:
    url = os.environ.get('ATLAS_RESTORE_DUMP_URL', '')
    digest = os.environ.get('ATLAS_RESTORE_DUMP_SHA256', '')
    if not url or not re.fullmatch(r'[0-9a-fA-F]{64}', digest):
        raise DrillError('Set ATLAS_RESTORE_DUMP_URL secret and ATLAS_RESTORE_DUMP_SHA256 variable. No restore was proved.')
    if not url.startswith('https://'):
        raise DrillError('The private backup download requires HTTPS.')
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / 'ci-snapshot.dump'
    try:
        # Never echo a signed URL or a urllib exception containing that URL.
        with urllib.request.urlopen(url, timeout=60) as response, path.open('xb') as output:
            if not response.url.startswith('https://'):
                raise DrillError('Backup redirect must use HTTPS.')
            total = 0
            while chunk := response.read(1024 * 1024):
                total += len(chunk)
                if total > 1024 * 1024 * 1024:
                    raise DrillError('Backup exceeds the 1 GiB drill limit.')
                output.write(chunk)
        verify_digest(path, digest)
    except DrillError:
        raise
    except Exception:
        raise DrillError('Private backup download failed; check storage access without logging its URL.') from None


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
        command(['docker', 'run', '-d', '--name', container, '--network', 'none',
                 '--label', 'atlas.restore-drill=true',
                 '-e', 'POSTGRES_HOST_AUTH_METHOD=trust',
                 IMAGE])
        created = True
        for _ in range(60):
            # The entrypoint's temporary init server only accepts Unix sockets.
            # TCP readiness proves the final server is up, avoiding its shutdown.
            ready = subprocess.run(['docker', 'exec', container, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres'],
                                   capture_output=True, timeout=10)
            if ready.returncode == 0:
                break
            time.sleep(1)
        else:
            raise DrillError('Throwaway Postgres did not become ready.')

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


def main() -> None:
    directory = ROOT / '.db-moves'
    if '--download' in sys.argv[1:]:
        download_backup(directory)
    dumps = find_dumps(directory)
    expected = json.loads((ROOT / '.github/restore-counts.json').read_text())
    if (not expected or any(not re.fullmatch(r'[a-z_]+', table) or type(count) is not int or count < 0
                            for table, count in expected.items())):
        raise DrillError('Invalid restore count manifest.')
    command(['docker', 'pull', IMAGE])
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
