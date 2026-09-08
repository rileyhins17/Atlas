import { afterEach, describe, expect, it, vi } from 'vitest';
import { OrchestratorService } from '../src/modules/ai/orchestrator.service.js';

afterEach(() => vi.useRealTimers());

describe('planning a day without an AI provider', () => {
  it('proposes real owner tasks inside free time without spending tokens or writing events', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-08T14:00:00Z'));
    const findMany = vi.fn(async () => [{ id: 'task-one', title: 'Review drawings', priority: 'HIGH', dueAt: null }]);
    const assertUnderCap = vi.fn(async () => { throw new Error('No AI provider configured'); });
    const record = vi.fn();
    const create = vi.fn();
    const service = new OrchestratorService(
      { client: { task: { findMany }, event: { create } } } as never,
      {} as never, {} as never, {} as never,
      { assertUnderCap, record } as never,
      {} as never, {} as never, {} as never,
      { estimates: async () => new Map(), energy: async () => ({ peak: [], trough: [], samples: 0 }) } as never,
      { get: async () => 'America/Toronto' } as never,
    );
    await expect(service.planDay('owner', [{
      startAt: new Date('2026-09-08T15:00:00Z'), endAt: new Date('2026-09-08T16:00:00Z'),
    }])).resolves.toMatchObject({ proposals: [{
      taskId: 'task-one', title: 'Review drawings',
      startAt: '2026-09-08T15:00:00.000Z', endAt: '2026-09-08T15:30:00.000Z',
    }] });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: 'owner', status: { in: ['TODO', 'IN_PROGRESS'] } }, take: 25,
    }));
    expect(assertUnderCap).toHaveBeenCalledOnce();
    expect(record).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });
});
