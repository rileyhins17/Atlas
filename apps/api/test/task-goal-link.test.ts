import { describe, expect, it, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { TasksService } from '../src/modules/tasks/tasks.service.js';

const NOW = new Date(2026, 6, 15, 9, 0);
const MINE = 'goal_mine';

function makeTask(over: Record<string, unknown> = {}) {
  return {
    id: 'task_1',
    userId: 'u1',
    title: 'Book the flights',
    notes: null,
    status: 'TODO',
    priority: 'MEDIUM',
    dueAt: null,
    completedAt: null,
    tags: [],
    goalId: null,
    recurrence: null,
    recurrenceParentId: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  };
}

/** `u1` owns exactly one goal. Every other goal id belongs to somebody else. */
function makeService() {
  const goal = {
    findFirst: vi.fn().mockImplementation(({ where }: { where: Record<string, unknown> }) =>
      Promise.resolve(where.id === MINE && where.userId === 'u1' ? { id: MINE } : null),
    ),
  };
  const task = {
    findFirst: vi.fn().mockImplementation(({ where }: { where: Record<string, unknown> }) =>
      Promise.resolve(makeTask({ id: where.id as string })),
    ),
    create: vi
      .fn()
      .mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve(makeTask(data)),
      ),
    update: vi
      .fn()
      .mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve(makeTask(data)),
      ),
  };
  const prisma = { client: { task, goal } };
  const timeline = { write: vi.fn().mockResolvedValue(undefined) };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = new TasksService(prisma as any, timeline as any);
  return { service, task, goal };
}

describe('linking a task to a goal', () => {
  it('accepts a goal the user owns', async () => {
    const { service, task } = makeService();
    const dto = await service.create('u1', { title: 'Book the flights', goalId: MINE } as never);
    expect(dto.goalId).toBe(MINE);
    expect(task.create).toHaveBeenCalledOnce();
  });

  it('refuses a goal belonging to somebody else, and writes nothing', async () => {
    const { service, task } = makeService();
    await expect(
      service.create('u1', { title: 'Book the flights', goalId: 'goal_theirs' } as never),
    ).rejects.toBeInstanceOf(NotFoundException);
    // The check has to happen BEFORE the write, or the row exists anyway.
    expect(task.create).not.toHaveBeenCalled();
  });

  it('refuses to move an existing task onto somebody else’s goal', async () => {
    const { service, task } = makeService();
    await expect(
      service.update('u1', 'task_1', { goalId: 'goal_theirs' } as never),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(task.update).not.toHaveBeenCalled();
  });

  it('allows unlinking, which is a null rather than an id to look up', async () => {
    const { service, task, goal } = makeService();
    const dto = await service.update('u1', 'task_1', { goalId: null } as never);
    expect(dto.goalId).toBeNull();
    expect(task.update).toHaveBeenCalledOnce();
    expect(goal.findFirst).not.toHaveBeenCalled();
  });

  it('leaves the link alone when the patch does not mention it', async () => {
    const { service, goal } = makeService();
    await service.update('u1', 'task_1', { title: 'Book the trains' } as never);
    // `undefined` means "not in this patch". Looking it up would turn every
    // unrelated edit into an extra query, and a rename into a link failure.
    expect(goal.findFirst).not.toHaveBeenCalled();
  });
});
