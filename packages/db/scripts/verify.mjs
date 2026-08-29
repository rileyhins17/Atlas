/* eslint-disable no-console -- this is a command-line report; printing IS its job. */
/**
 * Verify a database is actually ready to serve Atlas.
 *
 * WHY: `prisma migrate deploy` exiting 0 does not mean the database is usable.
 * The failure that motivated this is specific and quiet — Supabase pre-installs
 * pgvector into the `extensions` schema, so `CREATE EXTENSION IF NOT EXISTS
 * vector` is a no-op and `vector(768)` only resolves if `extensions` is on the
 * search_path. Get that wrong and every migration reports success, the app
 * starts, and semantic recall silently returns nothing forever.
 *
 * So this asserts the three things that are true of a working Atlas database
 * and false of a half-migrated one, and says which failed rather than throwing
 * a stack trace at you.
 *
 * Run against whatever DIRECT_DATABASE_URL points at:
 *   node scripts/verify.mjs
 *
 * @prisma/client is imported directly here, which app code must never do — this
 * package is the one place that owns it.
 */
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

const here = dirname(fileURLToPath(import.meta.url));

/** Migration directories on disk are the source of truth for how many to expect. */
function expectedMigrations() {
  return readdirSync(join(here, '..', 'prisma', 'migrations'), { withFileTypes: true }).filter(
    (entry) => entry.isDirectory(),
  ).length;
}

const checks = [];
function record(name, ok, detail) {
  checks.push({ name, ok, detail });
}

/**
 * Prisma buries the useful sentence under a blank-padded preamble, so naively
 * taking the first few lines prints "Invalid `prisma.$queryRaw()` invocation:"
 * and nothing else — measured, and it is precisely the moment you need to be
 * told "compute time quota" or "no pg_hba entry".
 */
function meaningfulLines(err, limit = 2) {
  return String(err?.message ?? err)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !/^Invalid `.*` invocation:?$/.test(line))
    .slice(0, limit);
}

// Migrations need the direct (session) endpoint, and so does this: a pooled
// connection can answer from a different backend than the one that migrated.
const url = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) {
  console.error('FAIL  no DIRECT_DATABASE_URL or DATABASE_URL in the environment');
  process.exit(2);
}

const prisma = new PrismaClient({ datasources: { db: { url } } });

try {
  try {
    await prisma.$queryRaw`SELECT 1`;
    record('connect', true, 'database answered');
  } catch (err) {
    // Nothing below can mean anything if this failed, so stop here with the
    // real message — this is where a quota or a firewall shows itself.
    console.error('FAIL  connect');
    for (const line of meaningfulLines(err)) console.error(`      ${line}`);
    process.exit(2);
  }

  const ext = await prisma.$queryRaw`
    SELECT extname::text AS name, extversion::text AS version
    FROM pg_extension WHERE extname = 'vector'
  `;
  record(
    'pgvector installed',
    ext.length > 0,
    ext.length > 0 ? `vector ${ext[0].version}` : 'pg_extension has no row for "vector"',
  );

  // The check that actually catches the search_path trap: not "is the extension
  // there" but "did the column come out as a vector".
  const col = await prisma.$queryRaw`
    SELECT atttypid::regtype::text AS type
    FROM pg_attribute
    WHERE attrelid = 'embeddings'::regclass AND attname = 'embedding' AND NOT attisdropped
  `;
  const colType = col[0]?.type ?? 'missing';
  record(
    'embeddings.embedding is a vector',
    colType === 'vector',
    colType === 'vector' ? 'vector' : `got "${colType}" — check the search_path, not the migration`,
  );

  const expected = expectedMigrations();
  const rows = await prisma.$queryRaw`
    SELECT
      count(*) FILTER (WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL)::int AS applied,
      count(*) FILTER (WHERE rolled_back_at IS NOT NULL)::int AS rolled_back
    FROM _prisma_migrations
  `;
  const { applied, rolled_back: rolledBack } = rows[0] ?? { applied: 0, rolled_back: 0 };
  record(
    'migrations applied',
    applied === expected && rolledBack === 0,
    `${applied}/${expected} applied, ${rolledBack} rolled back`,
  );

  // A brand-new database is expected to be empty; this is reported, never failed.
  const [{ users }] = await prisma.$queryRaw`SELECT count(*)::int AS users FROM users`;

  const failed = checks.filter((c) => !c.ok);
  for (const c of checks) {
    console.log(`${c.ok ? 'ok  ' : 'FAIL'}  ${c.name.padEnd(32)} ${c.detail}`);
  }
  console.log(`      ${'accounts'.padEnd(32)} ${users}`);

  if (failed.length > 0) {
    console.error(`\n${failed.length} check(s) failed. The database is NOT ready to serve.`);
    process.exit(1);
  }
  console.log('\nAll checks passed.');
} finally {
  await prisma.$disconnect();
}
