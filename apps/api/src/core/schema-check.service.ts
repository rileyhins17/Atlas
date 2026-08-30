import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';

export interface SchemaFinding {
  check: string;
  ok: boolean;
  detail: string;
}

/**
 * Assert once at boot that the database is the shape Atlas needs.
 *
 * WHY: `prisma migrate deploy` exiting 0 does not mean the database is usable,
 * and the ways it lies are silent. Supabase pre-installs pgvector into the
 * `extensions` schema, so `CREATE EXTENSION IF NOT EXISTS vector` is a no-op and
 * the `vector(768)` column type resolves only if `extensions` is on the
 * search_path — get that wrong and every migration reports success, the app
 * starts, and semantic recall returns nothing forever. Nothing on screen says
 * so; the only symptom is an AI that has quietly stopped remembering.
 *
 * `packages/db/scripts/verify.mjs` checks the same things at switch time. This
 * is the standing version: a database can drift after the switch — restored
 * from a snapshot, pointed at a different project, migrated by hand — and the
 * switch script is not there to notice.
 *
 * IT LOGS, IT DOES NOT THROW. The lesson from the August outage is that
 * refusing to boot over a database problem takes the whole origin down for
 * something a restart cannot fix: the API stops listening, Caddy 502s every
 * route, and sign-in dies along with the data routes. A degraded API that says
 * loudly what is wrong beats a dead one that says nothing.
 */
@Injectable()
export class SchemaCheckService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SchemaCheckService.name);
  /** Last result, so `/health` and support can read it without re-querying. */
  findings: SchemaFinding[] = [];

  constructor(private readonly prisma: PrismaService) {}

  onApplicationBootstrap(): void {
    // Not awaited: a slow database must not hold up the port binding, and the
    // API is required to come up even when the database is unreachable.
    void this.run();
  }

  async run(): Promise<SchemaFinding[]> {
    if (!this.prisma.dbReachableAtBoot) {
      // Nothing to say that /health does not already say better, and querying a
      // database we know is down just logs a second, more confusing error.
      this.logger.warn('Skipping schema checks — the database was unreachable at boot.');
      this.findings = [];
      return this.findings;
    }

    const findings: SchemaFinding[] = [];
    try {
      const ext = await this.prisma.client.$queryRaw<{ version: string }[]>`
        SELECT extversion::text AS version FROM pg_extension WHERE extname = 'vector'
      `;
      findings.push({
        check: 'pgvector installed',
        ok: ext.length > 0,
        detail: ext[0] ? `vector ${ext[0].version}` : 'pg_extension has no row for "vector"',
      });

      // The check that actually catches the search_path trap: not "is the
      // extension installed" but "did the column come out as a vector".
      const col = await this.prisma.client.$queryRaw<{ type: string }[]>`
        SELECT atttypid::regtype::text AS type
        FROM pg_attribute
        WHERE attrelid = 'embeddings'::regclass AND attname = 'embedding' AND NOT attisdropped
      `;
      const type = col[0]?.type ?? 'missing';
      findings.push({
        check: 'embeddings.embedding is a vector',
        ok: type === 'vector',
        detail:
          type === 'vector' ? 'vector' : `got "${type}" — check the search_path, not the migration`,
      });

      // Deliberately NOT an exact count. Counting migration directories from
      // the running API ties it to a repo layout it should not know about, and
      // the failure that matters is a migration that FAILED, which Prisma
      // records — not one that has not been written yet.
      const rows = await this.prisma.client.$queryRaw<{ applied: number; broken: number }[]>`
        SELECT
          count(*) FILTER (WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL)::int AS applied,
          count(*) FILTER (WHERE rolled_back_at IS NOT NULL OR finished_at IS NULL)::int AS broken
        FROM _prisma_migrations
      `;
      const applied = rows[0]?.applied ?? 0;
      const broken = rows[0]?.broken ?? 0;
      findings.push({
        check: 'migrations',
        ok: applied > 0 && broken === 0,
        detail: `${applied} applied, ${broken} failed or unfinished`,
      });
    } catch (err) {
      findings.push({
        check: 'schema checks',
        ok: false,
        detail: err instanceof Error ? err.message.split('\n')[0]! : 'unknown error',
      });
    }

    this.findings = findings;
    const failed = findings.filter((f) => !f.ok);
    if (failed.length === 0) {
      this.logger.log(`Schema OK — ${findings.map((f) => f.detail).join(' · ')}`);
    } else {
      for (const f of failed) {
        this.logger.error(`SCHEMA PROBLEM — ${f.check}: ${f.detail}`);
      }
      this.logger.error(
        'The API is running anyway. Data routes may fail or return nothing. ' +
          'Run: node packages/db/scripts/verify.mjs',
      );
    }
    return findings;
  }
}
