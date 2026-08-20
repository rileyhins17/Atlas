// Toronto, because that is where Atlas is used and it observes DST. Set before
// any Date is constructed in this file.
process.env.TZ = 'America/Toronto';

import { describe, expect, it } from 'vitest';
import { addDays, localDayKey, startOfDay } from '../lib/dates';

/**
 * A local day is not always 24 hours, and Atlas pages by day on its main screen.
 *
 * Autumn: the day is 25 hours, so midnight + 86_400_000ms is 23:00 on the SAME
 * date. Every "next day" built that way silently did nothing for one day a year
 * — the pager looked frozen, the heading said Today twice, and the day window
 * for events was an hour short so the last hour of that day vanished.
 *
 * Spring: the day is 23 hours, so the same arithmetic overshoots to 01:00 and a
 * canvas anchored there starts an hour late.
 *
 * These dates are the real North American transitions in 2026.
 */
const FALL_BACK = new Date(2026, 10, 1); // Sun 1 Nov 2026 — 25 hours
const SPRING_FWD = new Date(2026, 2, 8); // Sun 8 Mar 2026 — 23 hours

const naiveNextDay = (d: Date) => new Date(startOfDay(d).getTime() + 86_400_000);

describe('the timezone this runs in', () => {
  it('actually observes DST, or the rest of this file proves nothing', () => {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe('America/Toronto');
    const offsets = [FALL_BACK.getTimezoneOffset(), addDays(FALL_BACK, 1).getTimezoneOffset()];
    expect(offsets[0]).not.toBe(offsets[1]);
  });
});

describe('addDays across a DST boundary', () => {
  it('reaches the next date on the 25-hour day, where fixed milliseconds do not', () => {
    expect(localDayKey(addDays(FALL_BACK, 1))).toBe('2026-11-02');
    // The bug, pinned: the old form stayed on 1 Nov.
    expect(localDayKey(naiveNextDay(FALL_BACK))).toBe('2026-11-01');
  });

  it('lands on midnight, not 01:00, on the 23-hour day', () => {
    const next = startOfDay(addDays(SPRING_FWD, 1));
    expect(next.getHours()).toBe(0);
    expect(localDayKey(next)).toBe('2026-03-09');
    // The old form overshot the start of the day it was meant to anchor.
    expect(naiveNextDay(SPRING_FWD).getHours()).toBe(1);
  });

  it('steps forward and back symmetrically over the transition', () => {
    const forward = addDays(FALL_BACK, 1);
    expect(localDayKey(addDays(forward, -1))).toBe(localDayKey(FALL_BACK));
  });

  it('still behaves on ordinary days', () => {
    const plain = new Date(2026, 5, 10);
    expect(localDayKey(addDays(plain, 1))).toBe('2026-06-11');
    expect(localDayKey(addDays(plain, -1))).toBe('2026-06-09');
  });
});

describe('the day window used to fetch a day of events', () => {
  it('is the real length of that local day', () => {
    const hours = (a: Date, b: Date) => (b.getTime() - a.getTime()) / 3_600_000;
    // 25 hours in autumn, 23 in spring — a fixed 24 is wrong in both directions.
    expect(hours(startOfDay(FALL_BACK), addDays(startOfDay(FALL_BACK), 1))).toBe(25);
    expect(hours(startOfDay(SPRING_FWD), addDays(startOfDay(SPRING_FWD), 1))).toBe(23);
  });
});
