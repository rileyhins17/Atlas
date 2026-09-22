import { describe, expect, it, vi } from 'vitest';
import { HabitsService } from '../src/modules/habits/habits.service.js';

function makeService(opts: {
  habits: Array<{ id: string }>;
  logs: Array<{ habitId: string; loggedAt: Date; value: number }>;
  tz?: string;
}) {
  const habitFindMany = vi.fn().mockResolvedValue(opts.habits);
  const logFindMany = vi.fn().mockResolvedValue(opts.logs);
  const prisma = {
    client: {
      habit: { findMany: habitFindMany },
      habitLog: { findMany: logFindMany },
    },
  };
  const timeline = { write: vi.fn() };
  const timezones = { get: vi.fn().mockResolvedValue(opts.tz ?? 'UTC') };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = new HabitsService(prisma as any, timeline as any, timezones as any);
  return { service, habitFindMany, logFindMany };
}

describe('HabitsService.history', () => {
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
    expect(history[0]).toEqual({ habitId: 'h1', days: [{ day: '2026-07-18', count: 3 }] });
    expect(history[1]).toEqual({ habitId: 'h2', days: [{ day: '2026-07-18', count: 1 }] });
  });

  it('includes habits with no logs as empty day lists', async () => {
    const { service } = makeService({ habits: [{ id: 'h1' }], logs: [] });
    expect(await service.history('user-1', 30)).toEqual([{ habitId: 'h1', days: [] }]);
  });

  it('ignores logs for archived habits and scopes queries to the user', async () => {
    const { service, habitFindMany, logFindMany } = makeService({
      habits: [{ id: 'h1' }],
      logs: [{ habitId: 'archived', loggedAt: new Date(), value: 1 }],
    });
    const history = await service.history('user-1', 84);
    expect(history).toEqual([{ habitId: 'h1', days: [] }]);
    expect(habitFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1', active: true } }),
    );
    expect(logFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: 'user-1' }),
      }),
    );
  });

  it('returns [] without querying logs when there are no habits', async () => {
    const { service, logFindMany } = makeService({ habits: [], logs: [] });
    expect(await service.history('user-1', 84)).toEqual([]);
    expect(logFindMany).not.toHaveBeenCalled();
  });
});

describe('HabitsService day boundaries', () => {
  // 21:30 in Toronto on 15 July is 01:30 UTC on the 16th.
  const evening = new Date('2026-07-16T01:30:00.000Z');

  it('puts an evening check-in on the local day it happened', async () => {
    const { service } = makeService({
      habits: [{ id: 'h1' }],
      logs: [{ habitId: 'h1', loggedAt: evening, value: 1 }],
      tz: 'America/Toronto',
    });
    const [h1] = await service.history('user-1', 30);
    expect(h1!.days).toEqual([{ day: '2026-07-15', count: 1 }]);
  });

  it('still counts a morning check-in as done today at 9pm local', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(evening);
    try {
      const { service } = makeService({
        habits: [
          {
            id: 'h1',
            name: 'Stretch',
            cadence: 'daily',
            target: 1,
            active: true,
            createdAt: new Date(),
          } as never,
        ],
        logs: [{ habitId: 'h1', loggedAt: new Date('2026-07-15T13:00:00.000Z'), value: 1 }],
        tz: 'America/Toronto',
      });
      const [h1] = await service.list('user-1');
      expect(h1!.doneToday).toBe(true);
      expect(h1!.streak).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
