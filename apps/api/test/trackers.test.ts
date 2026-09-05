import { describe, expect, it, vi } from 'vitest';
import { TrackersService } from '../src/modules/trackers/trackers.service.js';

/**
 * A rating is a statement about a DAY, and which day that is depends on the
 * user's timezone rather than on UTC. These pin the two things that follow from
 * that: the day is resolved in the user's zone, and rating the same day twice
 * is an edit rather than a second row.
 */
function makeService(opts: { timezone?: string } = {}) {
  const upserts: { where: unknown; create: Record<string, unknown>; update: Record<string, unknown> }[] =
    [];
  const tracker = {
    id: 't1',
    userId: 'u1',
    name: 'Bloating',
    emoji: null,
    direction: 'lower_better',
    lowLabel: null,
    highLabel: null,
    active: true,
    position: 0,
    createdAt: new Date('2026-09-01T00:00:00Z'),
    updatedAt: new Date(),
  };
  const prisma = {
    client: {
      user: {
        findUnique: vi.fn(async () => ({ timezone: opts.timezone ?? 'America/Toronto' })),
      },
      tracker: {
        findFirst: vi.fn(async () => tracker),
        findMany: vi.fn(async () => [tracker]),
        count: vi.fn(async () => 0),
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
          ...tracker,
          ...data,
        })),
        update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
          ...tracker,
          ...data,
        })),
      },
      trackerEntry: {
        findMany: vi.fn(async () => []),
        upsert: vi.fn(
          async (args: {
            where: unknown;
            create: Record<string, unknown>;
            update: Record<string, unknown>;
          }) => {
            upserts.push(args);
            return {
              id: 'e1',
              trackerId: 't1',
              dayKey: (args.create.dayKey as string) ?? '',
              value: args.create.value as number,
              note: (args.create.note as string) ?? null,
            };
          },
        ),
      },
    },
  };
  const service = new TrackersService(
    prisma as never,
    { write: vi.fn(async () => {}) } as never,
    { get: async () => opts.timezone ?? 'America/Toronto', prime() {}, forget() {} } as never,
  );
  return { service, prisma, upserts, tracker };
}

describe('rating a day', () => {
  /**
   * The unique constraint is on (trackerId, dayKey), and this is the write that
   * relies on it: rating a day again has to correct the number, not stack a
   * second opinion behind it.
   */
  it('upserts on the day, so re-rating corrects rather than duplicates', async () => {
    const { service, upserts } = makeService();
    await service.log('u1', 't1', { value: 7 });
    await service.log('u1', 't1', { value: 3 });

    expect(upserts).toHaveLength(2);
    expect(upserts[0]!.where).toEqual({ trackerId_dayKey: { trackerId: 't1', dayKey: upserts[0]!.create.dayKey } });
    expect(upserts[1]!.update).toMatchObject({ value: 3 });
  });

  /**
   * Toronto is UTC-4 in September, so 01:30 UTC is still the PREVIOUS day
   * there. Keying off UTC would file a late-night rating against tomorrow.
   */
  it('resolves the day in the user timezone, not UTC', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-09-05T01:30:00Z'));
      const { service, upserts } = makeService({ timezone: 'America/Toronto' });
      await service.log('u1', 't1', { value: 5 });
      expect(upserts[0]!.create.dayKey).toBe('2026-09-04');
    } finally {
      vi.useRealTimers();
    }
  });

  /** Last night, filled in this morning — which is when people remember to. */
  it('honours an explicit day', async () => {
    const { service, upserts } = makeService();
    await service.log('u1', 't1', { value: 8, dayKey: '2026-08-30' });
    expect(upserts[0]!.create.dayKey).toBe('2026-08-30');
  });

  it('records a note against the rating', async () => {
    const { service, upserts } = makeService();
    await service.log('u1', 't1', { value: 8, note: 'ate late' });
    expect(upserts[0]!.create.note).toBe('ate late');
  });
});

describe('setting one up', () => {
  it('caps how many things can be tracked at once', async () => {
    const { service, prisma } = makeService();
    prisma.client.tracker.count = vi.fn(async () => 8);
    await expect(service.create('u1', { name: 'Focus', direction: 'neutral' })).rejects.toThrow(
      /at once/i,
    );
  });

  /**
   * Archived rather than deleted, so the history survives — and re-adding the
   * same name brings that history back instead of failing on the unique
   * constraint or starting an empty second one.
   */
  it('revives an archived tracker rather than refusing the name', async () => {
    const { service, prisma } = makeService();
    prisma.client.tracker.findFirst = vi.fn(async () => ({ id: 't1', active: false }) as never);
    const revived = await service.create('u1', { name: 'Bloating', direction: 'lower_better' });
    expect(prisma.client.tracker.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ active: true }) }),
    );
    expect(revived.name).toBe('Bloating');
  });

  it('refuses a duplicate of something already being tracked', async () => {
    const { service, prisma } = makeService();
    prisma.client.tracker.findFirst = vi.fn(async () => ({ id: 't1', active: true }) as never);
    await expect(service.create('u1', { name: 'Bloating', direction: 'neutral' })).rejects.toThrow(
      /already tracking/i,
    );
  });
});

describe('what the AI is told', () => {
  it('says there are none rather than inventing a section', async () => {
    const { service, prisma } = makeService();
    prisma.client.tracker.findMany = vi.fn(async () => []);
    expect(await service.summarize('u1')).toBe('No personal trackers.');
  });

  /** A tracker set up and never answered is not a tracker reading zero. */
  it('says a tracker has not been rated rather than reporting a number', async () => {
    const { service } = makeService();
    const text = await service.summarize('u1');
    expect(text).toContain('not rated yet');
  });
});
