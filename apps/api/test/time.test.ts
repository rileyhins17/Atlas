import { describe, expect, it } from 'vitest';
import {
  dayKeyInTz,
  dayKeyStartUtc,
  localDayStartUtc,
  localHour,
  localWeekStartUtc,
  shiftDayKey,
  tzOffsetMs,
  weekdayOfDayKey,
} from '../src/core/time.js';

// 2026-07-15 is a Wednesday; July ⇒ America/Toronto is EDT (UTC-4).
const d = new Date('2026-07-15T12:00:00Z');

describe('core/time', () => {
  it('tzOffsetMs is 0 for UTC and -4h for Toronto in summer', () => {
    expect(tzOffsetMs('UTC', d)).toBe(0);
    expect(tzOffsetMs('America/Toronto', d)).toBe(-4 * 3600 * 1000);
  });

  it('localHour returns the wall-clock hour', () => {
    expect(localHour('UTC', d)).toBe(12);
    expect(localHour('America/Toronto', d)).toBe(8);
  });

  it('localDayStartUtc is the UTC instant of local midnight', () => {
    expect(localDayStartUtc('America/Toronto', d).toISOString()).toBe('2026-07-15T04:00:00.000Z');
  });

  it('localWeekStartUtc is Monday local midnight', () => {
    expect(localWeekStartUtc('America/Toronto', d).toISOString()).toBe('2026-07-13T04:00:00.000Z');
  });

  it('falls back to UTC for an unknown timezone', () => {
    expect(tzOffsetMs('Not/AZone', d)).toBe(0);
    expect(localHour('Not/AZone', d)).toBe(12);
  });

  it('knows which local day an evening in Toronto belongs to', () => {
    // 21:30 EDT is already the next day in UTC — the window where a UTC day
    // key put a habit check-in on tomorrow.
    const evening = new Date('2026-07-16T01:30:00Z');
    expect(dayKeyInTz(evening, 'America/Toronto')).toBe('2026-07-15');
    expect(dayKeyInTz(evening, 'UTC')).toBe('2026-07-16');
  });

  it('steps day keys by calendar, across months and years', () => {
    expect(shiftDayKey('2026-12-31', 1)).toBe('2027-01-01');
    expect(shiftDayKey('2026-03-01', -1)).toBe('2026-02-28');
    expect(weekdayOfDayKey('2026-07-13')).toBe(0); // Monday
    expect(weekdayOfDayKey('2026-07-19')).toBe(6); // Sunday
  });
});

/**
 * The two days a year where "a day is 24 hours" is false. The old
 * implementation read the zone offset at the given moment rather than at local
 * midnight, so both of these came out an hour wrong.
 */
describe('core/time across DST', () => {
  it('starts 1 Nov 2026 at EDT midnight, not EST', () => {
    // Afternoon of the fall-back day: the offset NOW is -5, at midnight it was -4.
    const afternoon = new Date('2026-11-01T17:00:00Z');
    expect(localDayStartUtc('America/Toronto', afternoon).toISOString()).toBe(
      '2026-11-01T04:00:00.000Z',
    );
  });

  it('starts 8 Mar 2026 at EST midnight, not EDT', () => {
    const afternoon = new Date('2026-03-08T17:00:00Z');
    expect(localDayStartUtc('America/Toronto', afternoon).toISOString()).toBe(
      '2026-03-08T05:00:00.000Z',
    );
  });

  it('finds Monday midnight for a week that crosses the transition', () => {
    // Sunday 1 Nov is EST; its Monday (26 Oct) began in EDT.
    const sunday = new Date('2026-11-01T17:00:00Z');
    expect(localWeekStartUtc('America/Toronto', sunday).toISOString()).toBe(
      '2026-10-26T04:00:00.000Z',
    );
  });

  it('round-trips every day key of a year through its start instant', () => {
    let key = '2026-01-01';
    for (let i = 0; i < 365; i++) {
      const start = dayKeyStartUtc(key, 'America/Toronto');
      expect(dayKeyInTz(start, 'America/Toronto')).toBe(key);
      // One millisecond earlier is the previous day.
      expect(dayKeyInTz(new Date(start.getTime() - 1), 'America/Toronto')).toBe(
        shiftDayKey(key, -1),
      );
      key = shiftDayKey(key, 1);
    }
  });

  it('shifts to another local midnight by calendar day, not by 24h', () => {
    // 30 days before 15 Nov is 16 Oct — in EDT, so its midnight is 04:00Z.
    const nov = new Date('2026-11-15T17:00:00Z');
    expect(localDayStartUtc('America/Toronto', nov, -30).toISOString()).toBe(
      '2026-10-16T04:00:00.000Z',
    );
    // The end of the fall-back day is the start of 2 Nov, 25 hours after its own start.
    const fallBack = new Date('2026-11-01T12:00:00Z');
    const len =
      localDayStartUtc('America/Toronto', fallBack, 1).getTime() -
      localDayStartUtc('America/Toronto', fallBack).getTime();
    expect(len).toBe(25 * 3_600_000);
  });
});
