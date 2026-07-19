import { describe, expect, it, vi } from 'vitest';
import { TimelineReadService } from '../src/modules/timeline/timeline-read.service.js';

function makeService(rows: unknown[]) {
  const findMany = vi.fn().mockResolvedValue(rows);
  const prisma = { client: { timelineEvent: { findMany } } };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = new TimelineReadService(prisma as any);
  return { service, findMany };
}

function row(id: string) {
  return {
    id,
    userId: 'user-1',
    type: 'task.created',
    source: 'tasks',
    title: `Event ${id}`,
    summary: null,
    refType: 'task',
    refId: `task-${id}`,
    payload: null,
    occurredAt: new Date('2026-07-18T10:00:00.000Z'),
    createdAt: new Date('2026-07-18T10:00:00.000Z'),
  };
}

describe('TimelineReadService', () => {
  it('scopes the query to the user and maps rows to DTOs', async () => {
    const { service, findMany } = makeService([row('a')]);
    const page = await service.list('user-1', { limit: 50, offset: 0 });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1' }, orderBy: { occurredAt: 'desc' } }),
    );
    expect(page.events).toEqual([
      expect.objectContaining({
        id: 'a',
        type: 'task.created',
        source: 'tasks',
        occurredAt: '2026-07-18T10:00:00.000Z',
      }),
    ]);
    // No prisma internals (userId, payload, createdAt) leak into the DTO.
    expect(page.events[0]).not.toHaveProperty('userId');
    expect(page.events[0]).not.toHaveProperty('payload');
  });

  it('applies the source filter when given', async () => {
    const { service, findMany } = makeService([]);
    await service.list('user-1', { limit: 10, offset: 0, source: 'journal' });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1', source: 'journal' } }),
    );
  });

  it('over-fetches one row to compute hasMore and trims the page', async () => {
    const { service, findMany } = makeService([row('a'), row('b'), row('c')]);
    const page = await service.list('user-1', { limit: 2, offset: 4 });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 4, take: 3 }));
    expect(page.events).toHaveLength(2);
    expect(page.hasMore).toBe(true);
  });

  it('reports hasMore=false on the final page', async () => {
    const { service } = makeService([row('a')]);
    const page = await service.list('user-1', { limit: 2, offset: 0 });
    expect(page.events).toHaveLength(1);
    expect(page.hasMore).toBe(false);
  });
});
