"""
Move Atlas's database to another Postgres, with the data.

`db-switch.ps1` points .env at a new host and runs migrations; it does NOT carry
the rows across, which is fine when the target is empty on purpose and wrong
when three people's journals, workouts and finances are in the old one.

Credentials never reach argv. pg_dump and pg_restore read PGHOST/PGUSER/
PGPASSWORD from the environment, so nothing lands in a PowerShell transcript,
in ConsoleHost_history.txt, or in a process list. The URLs are read from .env,
which is gitignored.

    python infra/db-move.py dump                 # snapshot the current database
    python infra/db-move.py restore <env-key>    # load it into the host in that key
    python infra/db-move.py counts <env-key>     # row counts, to compare the two

Nothing here writes .env or restarts the origin: switching over is a separate,
deliberate step, so a failed restore leaves the live site pointed at the
database that still works.
"""

from __future__ import annotations

import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import unquote, urlparse

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
        PGSSLMODE='require',
    )
    return env


def run(tool: str, args: list[str], env: dict[str, str]) -> subprocess.CompletedProcess[str]:
    exe = PG_BIN / f'{tool}.exe'
    if not exe.exists():
        raise SystemExit(
            f'{tool} not found at {exe}.\n'
            'Install it with:  winget install -e --id PostgreSQL.PostgreSQL.17'
        )
    return subprocess.run(
        [str(exe), *args], env=env, capture_output=True, text=True, encoding='utf-8', errors='replace'
    )


def url_for(key: str) -> str:
    env = read_env()
    if key not in env:
        raise SystemExit(f'{key} is not in .env. Keys present: {", ".join(sorted(env))}')
    return env[key]


def describe(url: str) -> str:
    parsed = urlparse(url)
    return f'{parsed.hostname}:{parsed.port or 5432}'


def cmd_dump() -> None:
    # The SESSION pooler (5432), never the transaction pooler: pg_dump needs
    # session state and prepared statements, which PgBouncer in transaction mode
    # does not give it.
    url = url_for('DIRECT_DATABASE_URL')
    DUMP_DIR.mkdir(exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')
    out = DUMP_DIR / f'atlas-{stamp}.dump'

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
        print(res.stderr[-4000:], file=sys.stderr)
        raise SystemExit('pg_dump failed — nothing was changed.')
    size = out.stat().st_size
    print(f'OK  {size:,} bytes  {out}')


def cmd_restore(key: str, dump: str | None) -> None:
    url = url_for(key)
    path = Path(dump) if dump else max(DUMP_DIR.glob('atlas-*.dump'), key=lambda p: p.stat().st_mtime)
    print(f'Restoring {path.name} -> {describe(url)}')

    res = run(
        'pg_restore',
        [
            '--no-owner',
            '--no-privileges',
            # The target is a brand-new project, so `public` already exists and
            # pgvector may already be installed. Those are the only errors worth
            # tolerating, and --exit-on-error would stop on the first one.
            '--dbname',
            os.environ.get('PGDATABASE', 'postgres'),
            str(path),
        ],
        pg_env(url),
    )
    # pg_restore reports a non-zero code for warnings as well as failures, so
    # the output is what decides, not the code.
    tail = res.stderr.strip()
    if tail:
        print(tail[-4000:], file=sys.stderr)
    print('pg_restore exit', res.returncode)


SQL_COUNTS = """
select relname, n_live_tup
from pg_stat_user_tables
where schemaname = 'public'
order by relname;
"""


def cmd_counts(key: str) -> None:
    url = url_for(key)
    res = run('psql', ['--tuples-only', '--no-align', '--command', SQL_COUNTS], pg_env(url))
    if res.returncode != 0:
        print(res.stderr[-2000:], file=sys.stderr)
        raise SystemExit('psql failed.')
    print(f'-- {describe(url)}')
    print(res.stdout.strip())


def main() -> None:
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    action = sys.argv[1]
    if action == 'dump':
        cmd_dump()
    elif action == 'restore':
        cmd_restore(sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else None)
    elif action == 'counts':
        cmd_counts(sys.argv[2])
    else:
        raise SystemExit(__doc__)


if __name__ == '__main__':
    main()
