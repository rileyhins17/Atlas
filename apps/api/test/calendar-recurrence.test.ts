import { describe, expect, it, vi } from 'vitest';
import { CalendarService } from '../src/modules/calendar/calendar.service.js';

// Wed 15 Jul 2026, 09:00–10:00 local.
const START = new Date(2026, 6, 15, 9, 0);
const END = new Date(2026, 6, 15, 10, 0);

function makeEvent(over: Record<string, unknown> = {}) {
  return {
    id: 'ev_1',
    userId: 'u1',
    title: 'Standup',
    description: null,
    location: null,
    startAt: START,
    endAt: END,
    allDay: false,
    source: 'atlas',
    externalId: null,
    recurrence: null,
    recurrenceParentId: null,
    createdAt: START,
    updatedAt: START,
    ...over,
  };
}

/**
 * `list` runs two queries: the plain window query, then a series query filtered
 * on `recurrence: { not: null }`. The fake dispatches on that filter.
 */
function makeService(rows: Record<string, unknown>[], series: Record<string, unknown>[]) {
  const event = {
    findMany: vi.fn().mockImplementation(({ where }: { where: Record<string, unknown> }) =>
      Promise.resolve(where.recurrence ? series : rows),
    ),
  };
  const prisma = { client: { event } };
  const timeline = { write: vi.fn().mockResolvedValue(undefined) };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new CalendarService(prisma as any, timeline as any, { get: async () => 'America/Toronto', prime() {}, forget() {} } as any);
}

const from = new Date(2026, 6, 15, 0, 0);
const to = new Date(2026, 6, 22, 0, 0); // one week

describe('CalendarService.list recurrence expansion', () => {
  it('expands a daily series across the window, keeping each occurrence an hour long', async () => {
    const root = makeEvent({ recurrence: 'FREQ=DAILY' });
    const out = await makeService([root], [root]).list('u1', { from, to });

    // Seed (15th) plus the 16th–21st = 7 rows, none past the window end.
    expect(out).toHaveLength(7);
    expect(out.map((e) => new Date(e.startAt).getDate())).toEqual([15, 16, 17, 18, 19, 20, 21]);
    for (const e of out) {
      expect(new Date(e.endAt).getTime() - new Date(e.startAt).getTime()).toBe(3_600_000);
      expect(new Date(e.startAt).getHours()).toBe(9);
    }
  });

  it('marks generated rows as occurrences and leaves the stored row alone', async () => {
    const root = makeEvent({ recurrence: 'FREQ=DAILY' });
    const out = await makeService([root], [root]).list('u1', { from, to });

    expect(out[0]!.id).toBe('ev_1');
    expect(out[0]!.isOccurrence).toBeUndefined(); // the real row
    // Synthetic ids are namespaced by the root so they can never collide with
    // a real cuid, and the UI uses the flag to refuse a PATCH/DELETE.
    expect(out[1]!.id).toMatch(/^ev_1@\d+$/);
    expect(out[1]!.isOccurrence).toBe(true);
  });

  it('includes occurrences of a series that STARTED before the window', async () => {
    // Root is a week before the window, so the plain query returns nothing.
    const root = makeEvent({ startAt: new Date(2026, 6, 8, 9, 0), endAt: new Date(2026, 6, 8, 10, 0), recurrence: 'FREQ=WEEKLY' });
    const out = await makeService([], [root]).list('u1', { from, to });

    expect(out).toHaveLength(1);
    expect(new Date(out[0]!.startAt).getDate()).toBe(15);
    expect(out[0]!.isOccurrence).toBe(true);
  });

  it('does not expand without a window — an open-ended list has no stopping point', async () => {
    const root = makeEvent({ recurrence: 'FREQ=DAILY' });
    const out = await makeService([root], [root]).list('u1', { from });
    expect(out).toHaveLength(1);
  });

  it('leaves a rule it cannot parse completely alone rather than guessing', async () => {
    const root = makeEvent({ recurrence: 'FREQ=YEARLY;BYSETPOS=-1' });
    const out = await makeService([root], [root]).list('u1', { from, to });

    expect(out).toHaveLength(1);
    // Stored verbatim so a Google round-trip can never destroy it.
    expect(out[0]!.recurrence).toBe('FREQ=YEARLY;BYSETPOS=-1');
  });
});
