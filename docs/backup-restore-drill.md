# Proving the September 2026 backup

The `Prove private backup restores` CI job restores the private snapshot into
`pgvector/pgvector:pg17` and checks exact `COUNT(*)` results:

| Table | Expected rows |
| --- | ---: |
| tasks | 2,194 |
| journal_entries | 636 |
| timeline_events | 2,698 |
| workouts | 147 |

These are the snapshot counts recorded in HANDOFF.md, not new measurements of
production. A green run is the evidence that this archive actually restores.
The manifest lives in `.github/restore-counts.json`. For a replacement snapshot,
review its independently captured counts and checksum together; never change
the manifest merely to make an unexpected restore result pass.

## Supply the private archive

`.db-moves/` must remain gitignored. CI cannot receive these files from checkout.
Put the existing dump in owner-controlled private HTTPS storage, then configure:

- Actions secret `ATLAS_RESTORE_DUMP_URL`: a read-only HTTPS download URL for the
  dump (a signed URL is supported; renew it before it expires).
- Actions variable `ATLAS_RESTORE_DUMP_SHA256`: its SHA-256 checksum, computed
  locally with `Get-FileHash -Algorithm SHA256 <path-to-dump>`.

Never put the URL, backup bytes, production database credentials or encryption
key in a commit, PR, log or artifact. The runner downloads the archive as
`.db-moves/ci-snapshot.dump` and checks the checksum before restoring it. A
missing secret, inaccessible download, expired URL or checksum mismatch fails
the job. Fork PRs do not receive secrets and therefore cannot satisfy this gate;
maintainers must review and run a trusted branch in the private repository.
Do not use `pull_request_target` to run untrusted code with backup access.

## What the drill proves

The runner creates a unique container with `--network none`, no published ports
and no host mounts. It copies the archive in, creates a fresh database from
`template0`, restores using `--exit-on-error --single-transaction --no-owner
--no-privileges`, then checks exact counts and the real vector column type.
It never reads `.env`, accepts a database URL, runs migrations or starts Atlas.
It removes only its newly created container and anonymous volume in `finally`;
CI also removes the downloaded file, including after failure.

The fresh database already has the `public` schema, so the restore list omits
only that schema's creation entry. Every table, data and constraint entry is
retained. Public-only Supabase dumps can reference an extension they did not
include; the drill provisions pgvector in `extensions` or `public` according to
the archive's schema before restoring. PostgreSQL 17 matches the dump tooling
documented in HANDOFF.md; the existing e2e job keeps its own PostgreSQL 16.

The log contains only archive numbers, exact counts and status. Raw database
errors are deliberately withheld because a failed COPY can include private
row contents. A failure is never converted to success based on stderr text.

To run against local archives on a machine with Docker available:

```bash
python .github/scripts/restore_backup.py
```

Every `.db-moves/*.dump` gets its own fresh container and must match the manifest.
Do not mix snapshots with different expected counts in this drill directory.
The command without `--download` does not use the storage secret or change the
source dumps. To test the safety contracts without Docker or private data:

```bash
python -m unittest discover -s .github/scripts -p 'test_*.py'
```

This proves recovery of a specific snapshot. It does not register the nightly
backup task, select an off-machine retention policy, prove newer data is backed
up, or prove encrypted connector credentials can be decrypted without the
separately retained production encryption key.
