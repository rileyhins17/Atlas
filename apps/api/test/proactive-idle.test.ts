import { describe, expect, it, vi } from 'vitest';
import { ProactiveService } from '../src/modules/ai/proactive.service.js';
import { ActivityService } from '../src/core/activity.service.js';

/**
 * An idle Atlas must make no database calls.
 *
 * This is the rule that exists because breaking it had consequences: two
 * timer-driven sweeps kept a serverless Postgres awake around the clock and
 * burned its entire monthly compute quota in about a week, after which it
 * refused every query — reads included — for three users.
 *
 * `EmbeddingService.sweepPending` was fixed for exactly this and gates on
 * `ActivityService.hasRequestsSince`. `ProactiveService.sweep` copied that
 * class's re-entrancy guard and its docstring — it literally says "Mirrors
 * EmbeddingService.sweepPending" — and missed the gate, which was the whole
 * point of the code it was mirroring. It ran `user.findMany` with a join every
 * hour, forever, whether or not anyone had opened the app.
 */
function makeService() {
  const findMany = vi.fn(async () => []);
  const prisma = { client: { user: { findMany } } };
  const activity = new ActivityService();
  const service = new ProactiveService(
    prisma as never,
    { } as never,
    { } as never,
    activity,
  );
  return { service, findMany, activity };
}

describe('the proactive sweep', () => {
  it('touches the database not at all while nobody is using Atlas', async () => {
    const { service, findMany } = makeService();
    await service.sweep();
    await service.sweep();
    await service.sweep();
    expect(findMany, 'an idle API must make no database calls').not.toHaveBeenCalled();
  });

  it('runs once a real request has arrived', async () => {
    const { service, findMany, activity } = makeService();
    activity.mark();
    await service.sweep();
    expect(findMany).toHaveBeenCalledTimes(1);
  });

  /**
   * One request must buy one sweep, not a sweep every hour thereafter — that
   * would put a single visit back on the always-on path.
   */
  it('does not keep sweeping on the strength of one old request', async () => {
    const { service, findMany, activity } = makeService();
    activity.mark();
    await service.sweep();
    await service.sweep();
    expect(findMany).toHaveBeenCalledTimes(1);

    activity.mark();
    await service.sweep();
    expect(findMany).toHaveBeenCalledTimes(2);
  });
});
