// Toronto: the app's timezone, and one that observes DST. Set before any Date.
process.env.TZ = 'America/Toronto';

import { describe, expect, it } from 'vitest';
import { blankDraft, draftAtSlot, draftInterval, draftToPayload, type Draft } from '../lib/event-draft';

/**
 * The composer's draft -> API conversion. Extracting this out of CalendarPanel
 * is what made it reachable: it decides an all-day event's end, which is the
 * one place in the app where a fixed 24 hours is wrong twice a year, and it had
 * no test because it only existed inside a 600-line component.
 */
const FALL_BACK = '2026-11-01'; // 25-hour day
const SPRING_FWD = '2026-03-08'; // 23-hour day

const draft = (over: Partial<Draft> = {}): Draft => ({
  id: null,
  title: 'Standup',
  day: '2026-06-10',
  startTime: '09:00',
  durationMin: 30,
  location: '',
  allDay: false,
  recurrence: null,
  ...over,
});

describe('draftInterval', () => {
  it('ends a timed event a duration after its start', () => {
    const { start, end } = draftInterval(draft({ startTime: '09:00', durationMin: 90 }));
    expect(end.getTime() - start.getTime()).toBe(90 * 60_000);
  });

  it('keeps an all-day event inside its own day on a 25-hour day', () => {
    const { start, end } = draftInterval(draft({ day: FALL_BACK, allDay: true }));
    expect(start.getHours()).toBe(0);
    expect(end.getHours()).toBe(23);
    expect(end.getMinutes()).toBe(59);
    expect(end.getDate()).toBe(start.getDate());
    // The old form (start + 24h - 1min) ended it at 22:59 here.
    expect(new Date(start.getTime() + 86_400_000 - 60_000).getHours()).toBe(22);
  });

  it('does not spill an all-day event into the next day on a 23-hour day', () => {
    const { start, end } = draftInterval(draft({ day: SPRING_FWD, allDay: true }));
    expect(end.getDate()).toBe(start.getDate());
    // The old form crossed midnight, putting an "all day" event on two days.
    expect(new Date(start.getTime() + 86_400_000 - 60_000).getDate()).toBe(start.getDate() + 1);
  });
});

describe('draftToPayload', () => {
  it('refuses a draft with no title, rather than throwing', () => {
    expect(draftToPayload(draft({ title: '   ' }))).toBeNull();
  });

  it('trims the title and drops an empty location', () => {
    const p = draftToPayload(draft({ title: '  Standup  ', location: '   ' }));
    expect(p?.title).toBe('Standup');
    expect(p?.location).toBeUndefined();
  });

  it('keeps a real location', () => {
    expect(draftToPayload(draft({ location: " Nonna's " }))?.location).toBe("Nonna's");
  });

  it('never emits an end before the start', () => {
    for (const day of [FALL_BACK, SPRING_FWD, '2026-06-10']) {
      for (const allDay of [true, false]) {
        const p = draftToPayload(draft({ day, allDay }));
        expect(new Date(p!.endAt).getTime()).toBeGreaterThan(new Date(p!.startAt).getTime());
      }
    }
  });
});

describe('draft builders', () => {
  it('opens a future day at 09:00 rather than a stale "next slot"', () => {
    const now = new Date(2026, 5, 10, 14, 20);
    expect(blankDraft('2026-06-20', now).startTime).toBe('09:00');
  });

  it('starts a grid-slot draft at the slot that was clicked', () => {
    const now = new Date(2026, 5, 10, 14, 20);
    expect(draftAtSlot(new Date(2026, 5, 12), 13 * 60 + 45, now).startTime).toBe('13:45');
    expect(draftAtSlot(new Date(2026, 5, 12), 7 * 60, now).startTime).toBe('07:00');
  });
});
