"""
Move Atlas's database to another Postgres, with the data.

`db-switch.ps1` points .env at a new host and runs migrations; it does NOT carry
the rows across, which is fine when the target is empty on purpose and wrong
when three people's journals, workouts and finances are in the old one.

Credentials never reach argv. pg_dump and pg_restore read PGHOST/PGUSER/
PGPASSWORD from the environment, so nothing lands in a PowerShell transcript,
in ConsoleHost_history.txt, or in a process list. URLs come from process env
first, then the gitignored .env outside CI. CI uses synthetic data only.

    python infra/db-move.py dump                 # snapshot the current database
    python infra/db-move.py restore <env-key>    # load it into the host in that key
    python infra/db-move.py counts <env-key>     # row counts, to compare the two
    python infra/db-move.py verify <src> <dst>  # indexes and constraints must match too

Nothing here writes .env or restarts the origin: switching over is a separate,
deliberate step, so a failed restore leaves the live site pointed at the
database that still works.
"""

from __future__ import annotations

import os
import re
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

REPO = Path(__file__).resolve().parent.parent
ENV = REPO / '.env'
PG_BIN = Path(r'C:\Program Files\PostgreSQL\17\bin')
DUMP_DIR = REPO / '.db-moves'


def read_env() -> dict[str, str]:
    out: dict[str, str] = {}
    for line in ENV.read_text(encoding='utf-8').splitlines():
        line = line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        key, value = line.split('=', 1)
        out[key.strip()] = value.strip().strip('"').strip("'")
    return out


def pg_env(url: str) -> dict[str, str]:
    """Connection details as environment variables, never as arguments."""
    parsed = urlparse(url)
    if not parsed.hostname or not parsed.username:
        raise SystemExit('That connection string has no host or user in it.')
    env = dict(os.environ)
    env.update(
        PGHOST=parsed.hostname,
        PGPORT=str(parsed.port or 5432),
        PGUSER=unquote(parsed.username),
        PGPASSWORD=unquote(parsed.password or ''),
        PGDATABASE=(parsed.path or '/postgres').lstrip('/') or 'postgres',
        PGSSLMODE=parse_qs(parsed.query).get('sslmode', ['require'])[0],
    )
    return env


def run(tool: str, args: list[str], env: dict[str, str]) -> subprocess.CompletedProcess[str]:
    # Keep the existing Windows default; CI selects clients matching pg16.
    configured_bin = os.environ.get('PG_BIN')
    exe = (Path(configured_bin) / (f'{tool}.exe' if os.name == 'nt' else tool)
           if configured_bin else PG_BIN / f'{tool}.exe' if os.name == 'nt'
           else Path(shutil.which(tool) or f'/missing/{tool}'))
    if not exe.is_file():
        raise SystemExit(f'{tool} not found. Install PostgreSQL clients or set PG_BIN.')
    return subprocess.run(
        [str(exe), *args], env=env, capture_output=True, text=True, encoding='utf-8', errors='replace'
    )


def url_for(key: str) -> str:
    if os.environ.get(key):
        return os.environ[key]
    if os.environ.get('CI'):
        raise SystemExit(f'{key} is not in the process environment; CI never reads .env.')
    env = read_env()
    if key not in env:
        raise SystemExit(f'{key} is not in .env. Keys present: {", ".join(sorted(env))}')
    return env[key]


def describe(url: str) -> str:
    parsed = urlparse(url)
    return f'{parsed.hostname}:{parsed.port or 5432}'


def cmd_dump(destination: str | None = None) -> None:
    if os.environ.get('CI') and not destination:
        raise SystemExit('CI must pass an explicit synthetic dump destination; never use .db-moves.')
    # The SESSION pooler (5432), never the transaction pooler: pg_dump needs
    # session state and prepared statements, which PgBouncer in transaction mode
    # does not give it.
    url = url_for('DIRECT_DATABASE_URL')
    stamp = datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')
    out = Path(destination) if destination else DUMP_DIR / f'atlas-{stamp}.dump'
    out.parent.mkdir(parents=True, exist_ok=True)
    if out.exists():
        raise SystemExit('Dump destination already exists; refusing to overwrite a backup.')

    print(f'Dumping {describe(url)} -> {out.name}')
    res = run(
        'pg_dump',
        [
            '--format=custom',
            '--no-owner',
            '--no-privileges',
            # Only Atlas's own tables. Supabase owns the rest of the cluster and
            # a restore that tries to recreate its schemas fails loudly on
            # permissions for objects we neither wrote nor need.
            '--schema=public',
            '--file',
            str(out),
        ],
        pg_env(url),
    )
    if res.returncode != 0:
        raise SystemExit('pg_dump failed — nothing was changed.')
    size = out.stat().st_size
    print(f'OK  {size:,} bytes  {out}')


def restore_list(toc: str) -> str:
    # A fresh Postgres database already has public. Retain every table, row,
    # index and constraint while omitting only its redundant CREATE SCHEMA.
    return '\n'.join(line for line in toc.splitlines()
                     if not re.match(r'^\d+; \d+ \d+ SCHEMA - public ', line)) + '\n'


def cmd_restore(key: str, dump: str | None) -> None:
    url = url_for(key)
    if os.environ.get('CI') and not dump:
        raise SystemExit('CI must pass an explicit synthetic dump; never read .db-moves.')
    path = Path(dump) if dump else max(DUMP_DIR.glob('atlas-*.dump'), key=lambda p: p.stat().st_mtime)
    print(f'Restoring {path.name} -> {describe(url)}')

    env = pg_env(url)
    listing = run('pg_restore', ['--list', str(path)], env)
    if listing.returncode:
        raise SystemExit('pg_restore could not read the archive; nothing was restored.')
    with tempfile.TemporaryDirectory() as temporary:
        toc = Path(temporary) / 'restore.list'
        toc.write_text(restore_list(listing.stdout), encoding='utf-8')
        res = run(
            'pg_restore',
            ['--no-owner', '--no-privileges', '--exit-on-error', '--single-transaction',
             '--use-list', str(toc), '--dbname', env['PGDATABASE'], str(path)],
            env,
        )
    if res.returncode != 0:
        # COPY failures can contain private rows. Report failure without them.
        raise SystemExit(f'pg_restore failed (exit {res.returncode}); restore was rolled back.')
    print('pg_restore exit 0')


SQL_COUNTS = r"""
SELECT format('SELECT %L AS table_name, count(*) FROM %I.%I;',
              tablename, schemaname, tablename)
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename
\gexec
"""


SQL_SCHEMA = """
SELECT 'index :: ' || tablename || ' :: ' || indexdef
FROM pg_indexes WHERE schemaname = 'public'
UNION ALL
SELECT 'constraint :: ' || c.relname || ' :: ' || pg_get_constraintdef(con.oid)
FROM pg_constraint con
JOIN pg_class c ON c.oid = con.conrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
ORDER BY 1
"""


def schema_lines(url: str) -> set[str]:
    res = run('psql', ['--tuples-only', '--no-align', '--command', SQL_SCHEMA], pg_env(url))
    if res.returncode != 0:
        print(res.stderr[-2000:], file=sys.stderr)
        raise SystemExit('psql failed.')
    return {line for line in res.stdout.splitlines() if line.strip()}


def cmd_verify(source_key: str, target_key: str) -> None:
    """Compare the SHAPE of two databases, not just how many rows are in them.

    Matching row counts are not a matching database. `pg_restore --table`
    carries a table and its data and leaves its indexes, unique constraints and
    foreign keys behind — and that is invisible until something upserts. It
    happened on the ca-central-1 move: all 27 tables matched exactly, and
    `embeddings` had lost its primary key, its unique index and its foreign key,
    so every journal write 500ed while every read looked fine.
    """
    source, target = url_for(source_key), url_for(target_key)
    src, dst = schema_lines(source), schema_lines(target)
    missing = sorted(src - dst)
    extra = sorted(dst - src)

    print(f'-- source {describe(source)}: {len(src)} indexes + constraints')
    print(f'-- target {describe(target)}: {len(dst)} indexes + constraints')
    for line in missing:
        print(f'MISSING FROM TARGET  {line}')
    for line in extra:
        print(f'ONLY ON TARGET       {line}')
    if missing or extra:
        raise SystemExit(
            f'{len(missing)} missing and {len(extra)} unexpected. '
            'The data may be there and the database is still not the same shape.'
        )
    print('OK  every index and constraint matches.')


def cmd_counts(key: str) -> None:
    url = url_for(key)
    # --command cannot mix SQL and psql's \gexec; a file can. Identifiers and
    # literals are quoted by Postgres format(), not interpolated by Python.
    with tempfile.TemporaryDirectory() as temporary:
        sql = Path(temporary) / 'counts.sql'
        sql.write_text(SQL_COUNTS, encoding='utf-8')
        res = run('psql', ['-X', '--set=ON_ERROR_STOP=1', '--tuples-only', '--no-align',
                           '--file', str(sql)], pg_env(url))
    if res.returncode != 0:
        raise SystemExit('psql failed.')
    print(f'-- {describe(url)}')
    print(res.stdout.strip())


def main() -> None:
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    action = sys.argv[1]
    if action == 'dump':
        cmd_dump(sys.argv[2] if len(sys.argv) > 2 else None)
    elif action == 'restore':
        cmd_restore(sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else None)
    elif action == 'counts':
        cmd_counts(sys.argv[2])
    elif action == 'verify':
        if len(sys.argv) < 4:
            raise SystemExit(__doc__)
        cmd_verify(sys.argv[2], sys.argv[3])
    else:
        raise SystemExit(__doc__)


if __name__ == '__main__':
    main()
