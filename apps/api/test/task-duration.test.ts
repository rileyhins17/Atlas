import { describe, expect, it, vi } from 'vitest';
import { TaskDurationService } from '../src/modules/tasks/task-duration.service.js';

/**
 * The read-back that turns a reserved block plus a completion into a real
 * measurement. The maths itself lives in @atlas/shared and is tested there;
 * what matters here is that the query asks for the right rows and that a
 * half-populated one cannot poison the result.
 */
function makeService(rows: unknown[]) {
  const findMany = vi.fn().mockResolvedValue(rows);
  const client = { event: { findMany } };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { service: new TaskDurationService({ client } as any), findMany };
}

const block = (title: string, startHour: number, minutes: number) => ({
  startAt: new Date(2026, 6, 15, startHour, 0),
  task: {
    title,
    completedAt: new Date(2026, 6, 15, startHour, minutes),
  },
});

describe('TaskDurationService', () => {
  it('only ever looks at this user, at blocks tied to a task, and at finished work', async () => {
    const { service, findMany } = makeService([]);
    await service.estimates('u1');
    const where = findMany.mock.calls[0]![0].where;
    expect(where.userId).toBe('u1');
    expect(where.taskId).toEqual({ not: null });
    expect(where.task.status).toBe('DONE');
    // An open task has no completion to measure against.
    expect(where.task.completedAt.not).toBeNull();
    // And the window is bounded, so this cannot degrade into a full scan.
    expect(where.task.completedAt.gte).toBeInstanceOf(Date);
    expect(findMany.mock.calls[0]![0].take).toBeGreaterThan(0);
  });

  it('turns blocks into a median estimate per title', async () => {
    const { service } = makeService([
      block('Draft the report', 9, 50),
      block('Draft the report', 13, 70),
    ]);
    const est = await service.estimates('u1');
    expect(est.get('draft the report')).toEqual({
      key: 'draft the report',
      minutes: 60,
      samples: 2,
    });
  });

  it('skips a row whose task lost its completion', async () => {
    const { service } = makeService([
      block('Draft the report', 9, 50),
      { startAt: new Date(2026, 6, 15, 13, 0), task: { title: 'Draft the report', completedAt: null } },
    ]);
    // One usable sample is not enough to claim a usual.
    expect((await service.estimates('u1')).size).toBe(0);
  });

  it('looks an estimate up by title, normalising as the UI does', async () => {
    const { service } = makeService([
      block('Weekly review', 9, 30),
      block('weekly review', 13, 40),
    ]);
    expect(await service.forTitle('u1', '  WEEKLY REVIEW ')).toEqual({
      key: 'weekly review',
      minutes: 35,
      samples: 2,
    });
    expect(await service.forTitle('u1', 'never done this')).toBeNull();
  });
});
