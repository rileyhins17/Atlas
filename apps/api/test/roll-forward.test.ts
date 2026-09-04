import { describe, expect, it, vi } from 'vitest';
import { TasksService } from '../src/modules/tasks/tasks.service.js';

/**
 * The batched decision on work that slipped.
 *
 * What matters here is that the boundary is the USER's midnight (not the
 * server's), that dropping archives rather than completes, and that a task id
 * belonging to someone else simply cannot be touched.
 */
function makeService(opts: { tasks?: unknown[]; timezone?: string } = {}) {
  const findMany = vi.fn().mockResolvedValue(opts.tasks ?? []);
  const updateMany = vi.fn().mockResolvedValue({ count: (opts.tasks ?? []).length });
  const client = {
    task: { findMany, updateMany },
    user: { findUnique: vi.fn().mockResolvedValue({ timezone: opts.timezone ?? 'UTC' }) },
  };
  const timeline = {
    write: vi.fn().mockResolvedValue(undefined),
    writeMany: vi.fn().mockResolvedValue(undefined),
  };
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service: new TasksService({ client } as any, timeline as any),
    findMany,
    updateMany,
    timeline,
  };
}

const task = (id: string, title = `Task ${id}`) => ({ id, title, recurrence: null });

describe('slipped', () => {
  it('asks only for open work due before the user’s own midnight', async () => {
    // Toronto is UTC-4 in July, so "today" starts at 04:00 UTC there. A server
    // using its own midnight would call this wrong for four hours a day.
    const { service, findMany } = makeService({ timezone: 'America/Toronto' });
    vi.setSystemTime(new Date('2026-07-15T18:00:00Z'));
    await service.slipped('u1');
    const where = findMany.mock.calls[0]![0].where;
    expect(where.userId).toBe('u1');
    expect(where.status).toEqual({ in: ['TODO', 'IN_PROGRESS'] });
    expect((where.dueAt.lt as Date).toISOString()).toBe('2026-07-15T04:00:00.000Z');
    vi.useRealTimers();
  });

  it('is bounded — a years-old backlog cannot return unbounded rows', async () => {
    const { service, findMany } = makeService();
    await service.slipped('u1');
    expect(findMany.mock.calls[0]![0].take).toBeGreaterThan(0);
  });
});

describe('rollForward', () => {
  it('moves the chosen tasks to the end of the user’s local day', async () => {
    const { service, updateMany } = makeService({
      tasks: [task('t1'), task('t2')],
      timezone: 'America/Toronto',
    });
    vi.setSystemTime(new Date('2026-07-15T18:00:00Z'));
    const res = await service.rollForward('u1', ['t1', 't2'], 'today');
    expect(res).toEqual({ action: 'today', count: 2 });
    // 23:59 local, not midnight — landing on midnight would read as overdue again.
    expect((updateMany.mock.calls[0]![0].data.dueAt as Date).toISOString()).toBe(
      '2026-07-16T03:59:00.000Z',
    );
    vi.useRealTimers();
  });

  it('archives on drop — never deletes, and never marks it done', async () => {
    const { service, updateMany } = makeService({ tasks: [task('t1')] });
    await service.rollForward('u1', ['t1'], 'drop');
    // DONE would be a lie that inflates every completion statistic.
    expect(updateMany.mock.calls[0]![0].data).toEqual({ status: 'ARCHIVED' });
  });

  it('scopes the write by userId, so a borrowed id matches nothing', async () => {
    const { service, findMany } = makeService({ tasks: [task('t1')] });
    await service.rollForward('u1', ['t1', 'someone-elses'], 'drop');
    const where = findMany.mock.calls[0]![0].where;
    expect(where.userId).toBe('u1');
    expect(where.id).toEqual({ in: ['t1', 'someone-elses'] });
    // Already-finished work is not rollable either.
    expect(where.status).toEqual({ in: ['TODO', 'IN_PROGRESS'] });
  });

  it('does nothing, quietly, when none of the ids match', async () => {
    const { service, updateMany, timeline } = makeService({ tasks: [] });
    expect(await service.rollForward('u1', ['nope'], 'today')).toEqual({
      action: 'today',
      count: 0,
    });
    expect(updateMany).not.toHaveBeenCalled();
    expect(timeline.write).not.toHaveBeenCalled();
    expect(timeline.writeMany).not.toHaveBeenCalled();
  });

  /**
   * Still one row per task — that is per-task knowledge the AI reads — but in
   * ONE round trip. Twenty tasks used to mean twenty sequential inserts, which
   * against a database 384ms away is eight seconds for a button.
   */
  it('records one timeline row per task, so the AI can learn what you keep dropping', async () => {
    const { service, timeline } = makeService({ tasks: [task('t1', 'Call the bank'), task('t2')] });
    await service.rollForward('u1', ['t1', 't2'], 'drop');
    expect(timeline.writeMany).toHaveBeenCalledTimes(1);
    const rows = timeline.writeMany.mock.calls[0]![0];
    expect(rows).toHaveLength(2);
    expect(rows[0].type).toBe('task.dropped');
    expect(rows[0].title).toContain('Call the bank');
    expect(rows[0].refId).toBe('t1');
  });

  it('does not fall back to a write per task', async () => {
    const { service, timeline } = makeService({
      tasks: Array.from({ length: 20 }, (_, i) => task(`t${i}`)),
    });
    await service.rollForward('u1', Array.from({ length: 20 }, (_, i) => `t${i}`), 'today');
    expect(timeline.write).not.toHaveBeenCalled();
    expect(timeline.writeMany).toHaveBeenCalledTimes(1);
  });

  it('distinguishes a roll from a drop in the log', async () => {
    const { service, timeline } = makeService({ tasks: [task('t1')] });
    await service.rollForward('u1', ['t1'], 'today');
    expect(timeline.writeMany.mock.calls[0]![0][0].type).toBe('task.rolled_forward');
  });
});
