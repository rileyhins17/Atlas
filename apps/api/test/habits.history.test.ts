import { describe, expect, it, vi } from 'vitest';
import { HabitsService } from '../src/modules/habits/habits.service.js';
import { dayKey } from '../src/modules/habits/habits.util.js';

function makeService(opts: {
  habits: Array<{ id: string }>;
  logs: Array<{ habitId: string; loggedAt: Date; value: number }>;
}) {
  const habitFindMany = vi.fn().mockResolvedValue(opts.habits.map((habit) => ({
    name: 'Synthetic habit', cadence: 'daily', target: 1, active: true,
    createdAt: new Date('2026-01-01T00:00:00Z'), ...habit,
  })));
  const logFindMany = vi.fn().mockResolvedValue(opts.logs);
  const queryRaw = vi.fn().mockImplementation(async () => {
    const totals = new Map<string, { habitId: string; day: string; value: number }>();
    for (const log of opts.logs) {
      const day = dayKey(log.loggedAt);
      const key = `${log.habitId}:${day}`;
      const total = totals.get(key) ?? { habitId: log.habitId, day, value: 0 };
      total.value += log.value;
      totals.set(key, total);
    }
    return [...totals.values()];
  });
  const prisma = {
    client: {
      habit: { findMany: habitFindMany },
      habitLog: { findMany: logFindMany },
      $queryRaw: queryRaw,
    },
  };
  const timeline = { write: vi.fn() };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = new HabitsService(prisma as any, timeline as any);
  return { service, habitFindMany, logFindMany, queryRaw };
}

describe('HabitsService.history', () => {
  it('uses the same full daily totals for the checklist count and streak', async () => {
    const { service, logFindMany } = makeService({
      habits: [{ id: 'h1' }],
      logs: Array.from({ length: 2001 }, () => ({
        habitId: 'h1', loggedAt: new Date('2026-07-18T09:00:00Z'), value: 1,
      })),
    });
    vi.setSystemTime(new Date('2026-07-18T12:00:00Z'));
    try {
      expect(await service.list('user-1')).toEqual([
        expect.objectContaining({ id: 'h1', todayCount: 2001, doneToday: true, streak: 1 }),
      ]);
      expect(logFindMany).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps every check-in in the total without loading raw history rows', async () => {
    const { service, logFindMany, queryRaw } = makeService({
      habits: [{ id: 'h1' }],
      logs: Array.from({ length: 2001 }, () => ({
        habitId: 'h1', loggedAt: new Date('2026-07-18T09:00:00Z'), value: 1,
      })),
    });
    expect(await service.history('user-1', 84)).toEqual([
      { habitId: 'h1', days: [{ day: '2026-07-18', count: 2001 }] },
    ]);
    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(logFindMany).not.toHaveBeenCalled();
  });

  it('returns day-keyed counts per habit, summing multiple logs on one day', async () => {
    const day = new Date('2026-07-18T09:00:00.000Z');
    const { service } = makeService({
      habits: [{ id: 'h1' }, { id: 'h2' }],
      logs: [
        { habitId: 'h1', loggedAt: day, value: 1 },
        { habitId: 'h1', loggedAt: new Date('2026-07-18T20:00:00.000Z'), value: 2 },
        { habitId: 'h2', loggedAt: day, value: 1 },
      ],
    });
    const history = await service.history('user-1', 84);
    expect(history).toHaveLength(2);
    expect(history[0]).toEqual({ habitId: 'h1', days: [{ day: dayKey(day), count: 3 }] });
    expect(history[1]).toEqual({ habitId: 'h2', days: [{ day: dayKey(day), count: 1 }] });
  });

  it('includes habits with no logs as empty day lists', async () => {
    const { service } = makeService({ habits: [{ id: 'h1' }], logs: [] });
    expect(await service.history('user-1', 30)).toEqual([{ habitId: 'h1', days: [] }]);
  });

  it('ignores logs for archived habits and scopes queries to the user', async () => {
    const { service, habitFindMany, queryRaw } = makeService({
      habits: [{ id: 'h1' }],
      logs: [{ habitId: 'archived', loggedAt: new Date(), value: 1 }],
    });
    const history = await service.history('user-1', 84);
    expect(history).toEqual([{ habitId: 'h1', days: [] }]);
    expect(habitFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1', active: true } }),
    );
    const sql = queryRaw.mock.calls[0]![0];
    expect(sql.values).toContain('user-1');
    expect(sql.values).toContain('h1');
    expect(sql.values).not.toContain('archived');
    expect(sql.sql).toContain('"userId" = ?');
    expect(sql.sql).toContain('"habitId" IN (?)');
  });

  it('returns [] without querying logs when there are no habits', async () => {
    const { service, logFindMany, queryRaw } = makeService({ habits: [], logs: [] });
    expect(await service.history('user-1', 84)).toEqual([]);
    expect(logFindMany).not.toHaveBeenCalled();
    expect(queryRaw).not.toHaveBeenCalled();
  });
});
