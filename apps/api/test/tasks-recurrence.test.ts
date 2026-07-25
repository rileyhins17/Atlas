import { describe, expect, it, vi } from 'vitest';
import { TasksService } from '../src/modules/tasks/tasks.service.js';

const ROOT_ID = 'root_1';
// Wed 15 Jul 2026 09:00 local — the series seed.
const SEED = new Date(2026, 6, 15, 9, 0);

function makeTask(over: Record<string, unknown> = {}) {
  return {
    id: ROOT_ID,
    userId: 'u1',
    title: 'Water the plants',
    notes: null,
    status: 'TODO',
    priority: 'MEDIUM',
    dueAt: SEED,
    completedAt: null,
    tags: [],
    goalId: null,
    recurrence: null,
    recurrenceParentId: null,
    createdAt: SEED,
    updatedAt: SEED,
    ...over,
  };
}

function makeService(completed: Record<string, unknown>) {
  const done = makeTask({ status: 'DONE', completedAt: new Date(), ...completed });
  const task = {
    // `owned()` looks the task up, then `spawnNextInstance` may look up the root.
    findFirst: vi.fn().mockImplementation(({ where }: { where: Record<string, unknown> }) => {
      // The open-instance guard filters on status; nothing open exists by default.
      if (where.status) return Promise.resolve(null);
      if (where.recurrenceParentId !== undefined) return Promise.resolve(null);
      if (where.id === done.id) return Promise.resolve(done);
      return Promise.resolve(makeTask({ id: where.id as string }));
    }),
    update: vi.fn().mockResolvedValue(done),
    create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve(makeTask({ id: 'spawned_1', ...data })),
    ),
  };
  const prisma = { client: { task } };
  const timeline = { write: vi.fn().mockResolvedValue(undefined) };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = new TasksService(prisma as any, timeline as any);
  return { service, task, timeline };
}

describe('TasksService recurrence', () => {
  it('does not spawn anything for a one-off task', async () => {
    const { service, task } = makeService({});
    await service.complete('u1', ROOT_ID);
    expect(task.create).not.toHaveBeenCalled();
  });

  it('spawns exactly one next instance, linked to the series root', async () => {
    const { service, task } = makeService({ recurrence: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR' });
    await service.complete('u1', ROOT_ID);

    expect(task.create).toHaveBeenCalledTimes(1);
    const { data } = task.create.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(data.recurrenceParentId).toBe(ROOT_ID);
    expect(data.recurrence).toBe('FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR');
    expect(data.title).toBe('Water the plants');
    // Wed 15th → the next weekday is Thu 16th, at the same wall-clock time.
    expect((data.dueAt as Date).getDate()).toBe(16);
    expect((data.dueAt as Date).getHours()).toBe(9);
  });

  it('anchors the next date on the series ROOT, not the instance just finished', async () => {
    // Monthly on the 31st: January's instance clamped to Feb 28. Stepping from
    // that clamped instance would drift the series to the 28th forever, so the
    // root's date has to be the anchor.
    const jan31 = new Date(2026, 0, 31, 8, 0);
    const feb28 = new Date(2026, 1, 28, 8, 0);
    const { service, task } = makeService({
      id: 'inst_2',
      dueAt: feb28,
      recurrence: 'FREQ=MONTHLY',
      recurrenceParentId: ROOT_ID,
    });
    task.findFirst.mockImplementation(({ where }: { where: Record<string, unknown> }) => {
      if (where.status) return Promise.resolve(null); // no open instance
      if (where.id === ROOT_ID) {
        return Promise.resolve(makeTask({ dueAt: jan31, recurrence: 'FREQ=MONTHLY' }));
      }
      return Promise.resolve(
        makeTask({ id: 'inst_2', dueAt: feb28, recurrence: 'FREQ=MONTHLY', recurrenceParentId: ROOT_ID }),
      );
    });

    await service.complete('u1', 'inst_2');

    const { data } = task.create.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect((data.dueAt as Date).getMonth()).toBe(2); // March
    expect((data.dueAt as Date).getDate()).toBe(31); // …the 31st, not the 28th
    // Every instance points at the root, never at its predecessor.
    expect(data.recurrenceParentId).toBe(ROOT_ID);
  });

  it('stops when COUNT is exhausted rather than repeating forever', async () => {
    // COUNT=1 means the seed was the entire series (RFC 5545 counts DTSTART).
    const { service, task } = makeService({ recurrence: 'FREQ=DAILY;COUNT=1' });
    await service.complete('u1', ROOT_ID);
    expect(task.create).not.toHaveBeenCalled();
  });

  it('does not double-spawn when an open instance already exists', async () => {
    const { service, task } = makeService({ recurrence: 'FREQ=DAILY' });
    task.findFirst.mockImplementation(({ where }: { where: Record<string, unknown> }) =>
      Promise.resolve(
        where.status
          ? { id: 'already_open' } // the guard finds a live instance
          : makeTask({ recurrence: 'FREQ=DAILY' }),
      ),
    );

    await service.complete('u1', ROOT_ID);
    expect(task.create).not.toHaveBeenCalled();
  });

  it('advances the series when completed by PATCH too, not only POST /complete', async () => {
    const { service, task } = makeService({ recurrence: 'FREQ=DAILY' });
    await service.update('u1', ROOT_ID, { status: 'DONE' });
    expect(task.create).toHaveBeenCalledTimes(1);
  });
});
