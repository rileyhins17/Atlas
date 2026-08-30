import { describe, expect, it, vi } from 'vitest';
import { SchemaCheckService, type SchemaFinding } from '../src/core/schema-check.service.js';

/**
 * A database can be migrated and still be wrong, in ways nothing on screen
 * reports. The one that motivated this: Supabase pre-installs pgvector into the
 * `extensions` schema, so the migration's `CREATE EXTENSION IF NOT EXISTS` is a
 * no-op and `vector(768)` resolves only via the search_path. Get it wrong and
 * every migration says success, the app starts, and semantic recall silently
 * returns nothing — forever, with no error anywhere.
 *
 * The other half of the contract matters just as much: THIS MUST NOT THROW.
 * Refusing to boot over a database problem is what took the origin down in
 * August — the API stops listening and Caddy 502s every route, including
 * sign-in, over something a restart cannot fix.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anyCast = (value: unknown): any => value;

const VECTOR_OK = [{ version: '0.8.2' }];
const COLUMN_OK = [{ type: 'vector' }];
const MIGRATIONS_OK = [{ applied: 14, broken: 0 }];

/**
 * The service fires three queries in order. Routing by call index rather than
 * by parsing SQL keeps the fake honest about ordering without making it a
 * second implementation of the service.
 */
function makeService(
  responses: unknown[] = [VECTOR_OK, COLUMN_OK, MIGRATIONS_OK],
  dbReachableAtBoot = true,
) {
  let call = 0;
  const $queryRaw = vi.fn().mockImplementation(() => {
    const next = responses[call++];
    return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
  });
  const service = new SchemaCheckService(anyCast({ client: { $queryRaw }, dbReachableAtBoot }));
  return { service, $queryRaw };
}

const failed = (findings: SchemaFinding[]) => findings.filter((f) => !f.ok);

describe('SchemaCheckService', () => {
  it('passes a correctly migrated database', async () => {
    const { service } = makeService();
    const findings = await service.run();
    expect(failed(findings)).toHaveLength(0);
    expect(findings.map((f) => f.check)).toEqual([
      'pgvector installed',
      'embeddings.embedding is a vector',
      'migrations',
    ]);
  });

  it('catches the column that came out as something other than a vector', async () => {
    // The exact Supabase search_path failure: extension present, column wrong.
    const { service } = makeService([VECTOR_OK, [{ type: 'text' }], MIGRATIONS_OK]);
    const findings = await service.run();
    const bad = failed(findings);
    expect(bad).toHaveLength(1);
    expect(bad[0]!.check).toBe('embeddings.embedding is a vector');
    expect(bad[0]!.detail).toContain('search_path');
  });

  it('catches a missing pgvector extension', async () => {
    const { service } = makeService([[], COLUMN_OK, MIGRATIONS_OK]);
    const bad = failed(await service.run());
    expect(bad).toHaveLength(1);
    expect(bad[0]!.check).toBe('pgvector installed');
  });

  it('catches a failed or half-applied migration', async () => {
    const { service } = makeService([VECTOR_OK, COLUMN_OK, [{ applied: 9, broken: 1 }]]);
    const bad = failed(await service.run());
    expect(bad).toHaveLength(1);
    expect(bad[0]!.check).toBe('migrations');
    expect(bad[0]!.detail).toContain('1 failed');
  });

  it('treats a database with no migrations at all as wrong', async () => {
    const { service } = makeService([VECTOR_OK, COLUMN_OK, [{ applied: 0, broken: 0 }]]);
    const bad = failed(await service.run());
    expect(bad.map((f) => f.check)).toContain('migrations');
  });

  /**
   * The rule the August outage bought: a database problem degrades the API, it
   * never stops it. Anything that can reject here runs at boot.
   */
  it('never throws when the queries fail', async () => {
    const { service } = makeService([new Error('connection reset')]);
    const findings = await service.run();
    expect(failed(findings)).toHaveLength(1);
    expect(findings[0]!.detail).toContain('connection reset');
  });

  it('does not query at all when the database was unreachable at boot', async () => {
    const { service, $queryRaw } = makeService(undefined, false);
    const findings = await service.run();
    // /health already reports this, and a second failing query only adds a
    // more confusing error to the log.
    expect($queryRaw).not.toHaveBeenCalled();
    expect(findings).toEqual([]);
  });

  it('survives being started through the Nest lifecycle hook', async () => {
    const { service } = makeService([new Error('boom')]);
    // onApplicationBootstrap deliberately does not await; the contract is that
    // it returns without throwing so boot continues.
    expect(() => service.onApplicationBootstrap()).not.toThrow();
    await vi.waitFor(() => expect(service.findings.length).toBeGreaterThan(0));
  });
});
