import { describe, expect, it, vi } from 'vitest';
import { ActivityService } from '../src/core/activity.service.js';
import { ActivityMiddleware } from '../src/common/activity.middleware.js';
import { HealthController } from '../src/core/health.controller.js';
import { EmbeddingService } from '../src/modules/ai/embedding.service.js';

/**
 * The rule under test: AN IDLE API MAKES NO DATABASE CALLS.
 *
 * This is not a theoretical tidiness point. `/health` ran `SELECT 1` on every
 * call and the watchdog polls it every two minutes forever; the embedding
 * backfill queried for pending rows every sixty seconds whether or not any
 * existed. Between them the database never got the few idle minutes it needs to
 * suspend itself, so a three-user personal app kept a serverless compute awake
 * around the clock and exhausted a monthly quota in about a week — after which
 * the database refused every query, reads included, and the product was down.
 *
 * A unit test is the only place this can be caught. Both sweeps behaved
 * perfectly in every functional sense; what was wrong was how OFTEN they ran
 * when nobody was there, and nothing about a passing suite or a green screen
 * showed it.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anyCast = (value: unknown): any => value;

describe('ActivityService', () => {
  it('counts requests monotonically', () => {
    const activity = new ActivityService();
    expect(activity.count).toBe(0);
    activity.mark();
    activity.mark();
    expect(activity.count).toBe(2);
  });

  /**
   * A counter and not a clock, on purpose: two events inside the same
   * millisecond are indistinguishable by timestamp, and the loser would be a
   * queued row whose sweep believes it was already covered.
   */
  it('reports activity against a previously observed count', () => {
    const activity = new ActivityService();
    const seen = activity.count;
    expect(activity.hasRequestsSince(seen)).toBe(false);
    activity.mark();
    expect(activity.hasRequestsSince(seen)).toBe(true);
    expect(activity.hasRequestsSince(activity.count)).toBe(false);
  });
});

describe('ActivityMiddleware', () => {
  const run = (path: string) => {
    const activity = new ActivityService();
    const next = vi.fn();
    new ActivityMiddleware(activity).use(anyCast({ path }), anyCast({}), next);
    return { activity, next };
  };

  it('counts a real request', () => {
    const { activity, next } = run('/tasks');
    expect(activity.count).toBe(1);
    expect(next).toHaveBeenCalledOnce();
  });

  /**
   * The whole mechanism collapses if the liveness poll counts as use: the
   * watchdog would make the API look permanently busy, every sweep would run
   * forever, and the database would never idle.
   */
  it('does not count the watchdog polling /health', () => {
    const { activity, next } = run('/health');
    expect(activity.count).toBe(0);
    expect(next).toHaveBeenCalledOnce();
  });
});

describe('HealthController', () => {
  function make(queryRaw = vi.fn().mockResolvedValue([{ ok: 1 }])) {
    const activity = new ActivityService();
    const prisma = { client: { $queryRaw: queryRaw }, dbReachableAtBoot: true };
    return { controller: new HealthController(anyCast(prisma), activity), activity, queryRaw };
  }

  it('probes once on the first call, when nothing is known yet', async () => {
    const { controller, queryRaw } = make();
    const report = await controller.check();
    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(report.db).toBe('ok');
    expect(report.status).toBe('ok');
  });

  it('does not touch the database again while the API sits idle', async () => {
    const { controller, queryRaw } = make();
    await controller.check();
    // Thirty more watchdog polls — an hour of them — and no further queries.
    for (let i = 0; i < 30; i++) await controller.check();
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });

  it('re-probes once somebody has actually used the API', async () => {
    const { controller, activity, queryRaw } = make();
    await controller.check();
    activity.mark();
    await controller.check();
    expect(queryRaw).toHaveBeenCalledTimes(2);
    // …and then goes quiet again until the next real request.
    await controller.check();
    expect(queryRaw).toHaveBeenCalledTimes(2);
  });

  it('probes on demand for a human debugging by hand', async () => {
    const { controller, queryRaw } = make();
    await controller.check();
    await controller.check('1');
    expect(queryRaw).toHaveBeenCalledTimes(2);
  });

  /**
   * 200 while degraded is deliberate: the only consumer restarts the API on
   * >=400, and restarting cannot fix a database on the other side of the
   * internet — it would 502 every route instead of only the ones needing data.
   */
  it('reports degraded rather than throwing when the database is down', async () => {
    const { controller } = make(vi.fn().mockRejectedValue(new Error('quota exceeded')));
    const report = await controller.check();
    expect(report.db).toBe('down');
    expect(report.status).toBe('degraded');
    expect(report.dbCheckedAt).not.toBe(new Date(0).toISOString());
  });

  it('reports the answer it has, and when that answer was earned', async () => {
    const { controller, queryRaw } = make();
    const first = await controller.check();
    const second = await controller.check();
    expect(queryRaw).toHaveBeenCalledTimes(1);
    // Stale but honest: the timestamp is the probe's, not the request's.
    expect(second.dbCheckedAt).toBe(first.dbCheckedAt);
  });
});

describe('EmbeddingService.sweepPending', () => {
  function make() {
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = { client: { embedding: { findMany } } };
    const embedder = { warmup: vi.fn().mockResolvedValue(undefined), embed: vi.fn() };
    const activity = new ActivityService();
    const service = new EmbeddingService(anyCast(prisma), anyCast(embedder), activity);
    return { service, findMany, activity, embedder };
  }

  it('queries nothing when no request has arrived since the last sweep', async () => {
    const { service, findMany, activity } = make();
    activity.mark();
    await service.sweepPending(); // the write that could have queued a row
    expect(findMany).toHaveBeenCalledTimes(1);

    // Sixty ticks — an hour of an idle API — and not one query.
    for (let i = 0; i < 60; i++) await service.sweepPending();
    expect(findMany).toHaveBeenCalledTimes(1);
  });

  it('runs again as soon as somebody writes something', async () => {
    const { service, findMany, activity } = make();
    activity.mark();
    await service.sweepPending();
    await service.sweepPending();
    expect(findMany).toHaveBeenCalledTimes(1);

    activity.mark();
    await service.sweepPending();
    expect(findMany).toHaveBeenCalledTimes(2);
  });

  /**
   * A row queued while a sweep is in flight was not seen by that sweep, so the
   * count is taken BEFORE the query. Getting this backwards leaves the row
   * unsearchable until the next unrelated request happens along.
   */
  it('does not swallow a write that lands mid-sweep', async () => {
    const { service, findMany, activity } = make();
    let release!: () => void;
    const gate = new Promise((resolve) => {
      release = () => resolve([]);
    });
    findMany.mockReturnValueOnce(gate);

    activity.mark();
    const inFlight = service.sweepPending();
    activity.mark(); // a journal entry saved while the sweep is running
    release();
    await inFlight;

    await service.sweepPending();
    expect(findMany).toHaveBeenCalledTimes(2);
  });

  /**
   * Rows queued before a restart have no request to vouch for them, so boot
   * drains once unconditionally — otherwise they wait for unrelated traffic.
   */
  it('drains once at boot, with no request to trigger it', async () => {
    const { service, findMany } = make();
    service.onApplicationBootstrap();
    await vi.waitFor(() => expect(findMany).toHaveBeenCalledTimes(1));

    // And the gate closes behind it: still idle, still no second query.
    await service.sweepPending();
    expect(findMany).toHaveBeenCalledTimes(1);
  });
});
