import { describe, expect, it, vi } from 'vitest';
import { StatsService } from '../src/modules/stats/stats.service.js';
import type { PrismaService } from '../src/core/prisma.service.js';
import type { UserTimezoneService } from '../src/core/user-timezone.service.js';

describe('statistics calendar boundaries', () => {
  it.each([
    ['2026-03-09T18:00:00Z', '2026-02-24T05:00:00.000Z'],
    ['2026-11-02T18:00:00Z', '2026-10-20T04:00:00.000Z'],
  ])('reads two complete seven-day windows on %s', async (instant, expected) => {
    const query = vi.fn().mockResolvedValue([]);
    const service = new StatsService(
      { client: { $queryRaw: query } } as unknown as PrismaService,
      { get: async () => 'America/Toronto' } as unknown as UserTimezoneService,
    );
    vi.setSystemTime(new Date(instant));
    try {
      await service.rollup('synthetic-user', 7);
      expect(query).toHaveBeenCalledTimes(8);
      for (const [sql] of query.mock.calls) {
        expect(sql.values).toContain('synthetic-user');
        expect(sql.values.find((v: unknown) => v instanceof Date)?.toISOString()).toBe(expected);
      }
    } finally {
      vi.useRealTimers();
    }
  });
});
