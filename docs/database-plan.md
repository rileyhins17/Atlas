# Where Atlas's database should live, and what to change so it never matters again

Written 29 Aug 2026, after Neon's free compute quota was exhausted and took the
product down for a day. The goal Riley set: **free, or a few dollars a year, and
still the right answer in two years.**

The lesson from the outage is not "Neon was the wrong host". It is that Atlas
had a host-shaped dependency nobody had measured. So this document does two
things, and the second matters more than the first:

1. Pick a host.
2. Make the choice cheap to reverse, so the next one is a config change.

---

## What Atlas actually requires of a database

Measured against the code, not assumed.

| Requirement | Reality |
|---|---|
| PostgreSQL | Yes. Prisma 6, 15 migrations, enums, `Json` columns. |
| `pgvector` | **Migrations require it. The runtime does not.** |
| `pgcrypto` | Declared and created — and **never used**. |
| DB-side generators | None. No `gen_random_uuid()`, no `dbgenerated()`. IDs are `cuid()` from Prisma. |
| Superuser / roles / schemas | None. No `CREATE ROLE`, `OWNER TO`, `CREATE SCHEMA`, `SET search_path`. |
| Raw SQL | Six sites, all ordinary Postgres. Only the two in `embedding.service.ts` are vector-specific. |
| Size | Unknown — see "What we still do not know". |

Two of these are worth spelling out, because they are what make Atlas portable.

**`pgcrypto` is dead weight.** Every hash, HMAC and cipher in the app runs in
Node — `createHash`, `scrypt`, `createHmac`, AES-256-GCM in `crypto.service.ts`.
Nothing calls a Postgres crypto function. It is one privileged statement we ask
a host for and never use.

**The runtime already survives without `pgvector`.** Semantic recall has exactly
one call site, `OrchestratorService.recallText`, and it is already wrapped:

```ts
} catch (err) {
  this.logger.warn(`Memory recall failed, continuing without it: …`);
  return '';
}
```

So on a Postgres with no `vector` extension, chat still works — it just loses the
"possibly relevant things you know about me" block. Keyword search
(`search.service.ts`) is a separate implementation that never touches pgvector.
**Only `migrate deploy` hard-requires the extension**, via `CREATE EXTENSION
vector` and the `vector(768)` column type.

That is a much weaker lock-in than it looked, and it is the reason the plan below
is small.

## The options

Compared on the axis that actually broke us — **does idle time cost anything** —
rather than on headline storage numbers.

| | Free storage | Metered compute? | Idle behaviour | pgvector | Backups on free |
|---|---|---|---|---|---|
| **Supabase** | 500 MB | **No** | Pauses after 7 days idle | Yes, all plans | **None** |
| **Aiven** | 1 GB | **No** | Powers off after inactivity, with warning | Yes, all plans | **Included** |
| **Neon** (current) | 3 GiB | **Yes — ~192 h/mo** | Scales to zero | Yes | Limited |
| Koyeb | — | **Yes — 50 h/mo** | Sleeps after 5 min | Yes | — |

Koyeb is out: 50 active hours a month is a quarter of the allowance Atlas just
exhausted.

Neon deserves a fair hearing, because **the fix already shipped may have made it
survivable.** The 720 compute-hours/month that burned the quota were ours: a
`SELECT 1` every two minutes and a sweep every sixty seconds, both now gated on
real request activity. What is left is roughly the hourly proactive sweep plus
actual use. But staying means betting the product on an estimate of a meter we
cannot see, and the failure mode is total — reads included, no dump, no way out.
Not worth it.

## Recommendation: Supabase free, with our own backups

- **No compute meter.** This is the single property that matters most, because
  it is the exact failure that just cost a day.
- **The 7-day pause will never fire.** Atlas is used daily; that is what the
  pause is for.
- **500 MB is years of headroom for three accounts** — subject to actually
  measuring it, below.
- **pgvector is first-class on every plan**, so nothing in the app changes.
- **There is a paid step on the same host** ($25/mo Pro) for when Atlas has
  customers — an upgrade, not another migration.

**Aiven is the better pure-free pick on one axis: it includes automated backups,
and Supabase free has none.** That single gap is why the backup work below is
not optional. Once we run our own nightly dumps, the gap closes and Supabase's
upgrade path and ecosystem win. If you would rather not own backups at all,
switch the recommendation to Aiven — the migration is identical either way, which
is the whole point of the work below.

## The compatibility plan

Ordered so each step makes the next one safer. Nothing here is speculative
tidying; each item is either closing a gap we measured or removing a reason a
future move would be hard.

### 1. Nightly backup, and a restore you have actually done

**The most important item on this page, and it is not really about hosting.**
Supabase free takes no backups. Atlas holds journal entries, finance and fitness
history — the data whose loss is unrecoverable in a way an outage is not.

- `infra/atlas-backup.ps1`: `pg_dump --format=custom` → encrypt → copy off this
  machine. Retention 14 daily + 8 weekly.
- Registered the same way as the health watchdog, and it must log where the
  watchdog logs, so a silent failure is visible.
- **A restore drill, executed and written down.** A backup that has never been
  restored is a hypothesis. Restore into a scratch database and compare row
  counts.

This is also what removes lock-in permanently: once a verified dump exists every
night, moving hosts is a `psql -f` and a connection string.

*Needs from Riley:* a PG17 `pg_dump` on the PC, and somewhere off-machine to put
it (Cloudflare R2 and Backblaze B2 both have free tiers well above what this
needs).

### 2. One command to switch hosts

`infra/db-switch.ps1 -Pooled <url> -Direct <url>` that writes `.env`, runs
`migrate deploy`, runs the verification queries, restarts the origin and checks
`/health?probe=1`.

Turning a migration into a repeatable operation is what stops the *next* host
decision from being a project. It also makes the Supabase move itself less
error-prone than following the runbook by hand.

### 3. Assert the database is what we think at boot

The API should check, once at startup, that the `vector` extension is present,
that `embeddings.embedding` really is a `vector` column, and that the migration
count matches — then **log loudly rather than crash.** We learned in the last
outage that refusing to boot over a database problem takes the whole origin down
for something a restart cannot fix.

Catches a half-applied migration immediately, instead of as "search quietly
returns nothing" three weeks later.

### 4. Measure the size, before it is a question

We do not know how big the database is, and 500 MB is a real ceiling. Add total
size and per-table size to the backup log, so growth is visible long before it
matters.

### 5. Trim the last unconditional timer

`ProactiveService.sweep` still queries hourly regardless of activity, because its
job is to act when you are *not* there. On a host with no compute meter this is
harmless, so it is **low priority on Supabase and high priority only if we stay
on Neon** — worth writing down so nobody "fixes" it without knowing which world
they are in.

### 6. Not recommended: removing the pgvector requirement

It is possible — the runtime already degrades, so only the migration would need
to change (store embeddings as a native `Float[]` and compute cosine similarity
in Node). For three users and a few thousand rows that is genuinely fine.

**Do not do it now.** Every host on the shortlist supports pgvector, so it buys
nothing today and costs the one part of Atlas that is genuinely product-grade.
Written down because it is the escape hatch if a future host ever lacks the
extension — and because knowing it exists is what makes "we are locked into
pgvector" false.

## Sequencing

| | Depends on | Blocked? |
|---|---|---|
| Backup script + restore drill | a readable database | **Yes — Neon is down** |
| `db-switch.ps1` | nothing | No |
| Boot assertions | nothing | No |
| Size telemetry | a readable database | **Yes** |
| The Supabase move itself | Riley creating the project | Riley |
| Copying the existing data | Neon readable again | **Yes** |

The unblocked work is worth doing first precisely because it makes the move
safer when the rest unblocks.

## What we still do not know

- **How big the database is.** Everything about the 500 MB ceiling is an
  assumption until Neon answers a query again.
- **When Neon's quota resets.** Visible in Riley's console; it decides whether
  the existing data can be carried across or whether three accounts start over.
- **Whether the idle fix is sufficient on its own.** It cannot be measured while
  the database refuses connections. If the quota resets and usage stays well
  under the allowance for a week, staying put becomes a legitimate option again —
  but the backup gap would still need closing, so none of the work above is
  wasted either way.

## See also

- `docs/migrate-to-supabase.md` — the step-by-step execution runbook, including
  the two Supabase-specific traps (the `extensions` schema and the IPv6-only
  direct host).
- `docs/GOTCHAS.md` — why an idle API must make no database calls.
