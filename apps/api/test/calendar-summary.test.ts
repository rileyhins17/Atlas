import { describe, expect, it, vi } from 'vitest';
import { CalendarService } from '../src/modules/calendar/calendar.service.js';

/**
 * "I'm unable to cancel events using Atlas."
 *
 * The tool was there and worked. What was missing was the id: every other
 * domain renders `[id]` in its AI summary precisely so update and delete are
 * addressable, and calendar was the one that did not. The model could see
 * "Dentist — Sep 5" and had nothing to pass to `calendar.delete`, so cancelling
 * an event was impossible in a way that looked like the model being unhelpful.
 *
 * The second bug in the same three lines: times were rendered with
 * `toISOString()`, which is UTC. A 7pm Toronto event reached the model as 23:00
 * and was read back to the user as 11pm.
 */
function makeService(events: { id: string; title: string; startAt: string; allDay?: boolean }[]) {
  const prisma = {
    client: {
      user: { findUnique: vi.fn(async () => ({ timezone: 'America/Toronto' })) },
      event: {
        findMany: vi.fn(async () =>
          events.map((e) => ({
            id: e.id,
            userId: 'u1',
            title: e.title,
            description: null,
            location: null,
            startAt: new Date(e.startAt),
            endAt: new Date(e.startAt),
            allDay: e.allDay ?? false,
            source: 'atlas',
            sourceId: null,
            sourceCalendarId: null,
            rrule: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          })),
        ),
      },
    },
  };
  return new CalendarService(prisma as never, { write: vi.fn(async () => {}) } as never);
}

describe('what the AI is told about the calendar', () => {
  it('says there are none rather than inventing a section', async () => {
    expect(await makeService([]).summarize('u1')).toBe('No upcoming events.');
  });

  /** The regression this file exists for. */
  it('gives every event an id, so it can be cancelled or moved', async () => {
    const text = await makeService([
      { id: 'evt_abc123', title: 'Dentist', startAt: '2026-09-05T23:00:00Z' },
    ]).summarize('u1');
    expect(text).toContain('[evt_abc123]');
    expect(text).toContain('Dentist');
  });

  /**
   * 23:00 UTC is 7pm in Toronto. Rendering the ISO string handed the model the
   * UTC hour and it repeated it back as if it were the user's.
   */
  it('renders the time in the user timezone, not UTC', async () => {
    const text = await makeService([
      { id: 'e1', title: 'Chest Day', startAt: '2026-09-05T23:00:00Z' },
    ]).summarize('u1');
    expect(text).toContain('7:00 PM');
    expect(text).not.toContain('23:00');
    // And it says which zone those times are in, so the model cannot assume.
    expect(text).toContain('America/Toronto');
  });

  it('says all day rather than inventing a time for an all-day event', async () => {
    const text = await makeService([
      { id: 'e1', title: 'Birthday', startAt: '2026-09-05T04:00:00Z', allDay: true },
    ]).summarize('u1');
    expect(text).toContain('all day');
  });
});
