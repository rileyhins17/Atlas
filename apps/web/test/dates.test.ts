import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  dayDiff,
  displayTimezone,
  formatAgo,
  formatClock,
  formatDue,
  greeting,
  localDayKey,
  setDisplayTimezone,
} from '../lib/dates';

// Fixed local-time anchor: a Saturday mid-afternoon.
const NOW = new Date(2026, 6, 18, 15, 0, 0); // 2026-07-18 15:00 local

describe('date helpers', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('localDayKey formats local YYYY-MM-DD', () => {
    expect(localDayKey(NOW)).toBe('2026-07-18');
    expect(localDayKey(new Date(2026, 0, 3))).toBe('2026-01-03');
  });

  it('dayDiff counts calendar days, not 24h periods', () => {
    const lateTonight = new Date(2026, 6, 18, 23, 30);
    const earlyTomorrow = new Date(2026, 6, 19, 0, 30);
    expect(dayDiff(lateTonight, earlyTomorrow)).toBe(1);
  });

  describe('formatDue', () => {
    it('phrases overdue days', () => {
      expect(formatDue(new Date(2026, 6, 17, 9), NOW)).toBe('due yesterday');
      expect(formatDue(new Date(2026, 6, 15, 9), NOW)).toBe('3d overdue');
    });
    it('phrases today by hours/minutes', () => {
      expect(formatDue(new Date(2026, 6, 18, 17, 0), NOW)).toBe('in 2h');
      expect(formatDue(new Date(2026, 6, 18, 15, 20), NOW)).toBe('in 20m');
      expect(formatDue(new Date(2026, 6, 18, 15, 2), NOW)).toBe('now');
    });
    it('phrases tomorrow and near-week days', () => {
      expect(formatDue(new Date(2026, 6, 19, 9), NOW)).toBe('tomorrow');
      // 2026-07-20 is a Monday, 2 days out → weekday name.
      expect(formatDue(new Date(2026, 6, 20, 9), NOW)).toMatch(/Mon/);
    });
    it('falls back to a date for far-out due dates', () => {
      expect(formatDue(new Date(2026, 7, 28, 9), NOW)).toMatch(/Aug/);
    });
  });

  describe('formatAgo', () => {
    it('covers just-now through days', () => {
      expect(formatAgo(new Date(NOW.getTime() - 30_000), NOW)).toBe('just now');
      expect(formatAgo(new Date(NOW.getTime() - 12 * 60_000), NOW)).toBe('12m ago');
      expect(formatAgo(new Date(2026, 6, 18, 11, 0), NOW)).toBe('4h ago');
      expect(formatAgo(new Date(2026, 6, 17, 15, 0), NOW)).toBe('yesterday');
      expect(formatAgo(new Date(2026, 6, 15, 15, 0), NOW)).toBe('3d ago');
    });
  });

  it('greeting tracks the hour', () => {
    expect(greeting(new Date(2026, 6, 18, 8))).toBe('Good morning');
    expect(greeting(new Date(2026, 6, 18, 14))).toBe('Good afternoon');
    expect(greeting(new Date(2026, 6, 18, 21))).toBe('Good evening');
    expect(greeting(new Date(2026, 6, 18, 2))).toBe('Up late');
  });
});

describe('the clock the app shows', () => {
  afterEach(() => setDisplayTimezone('UTC'));

  /**
   * `hour: 'numeric'` with the browser's locale renders 24-hour in en-GB and
   * en-CA, so a massage at ten past ten in the evening came out as "22:05" —
   * which nobody reads as a time they are about to attend. Atlas is a day
   * planner; the clock is 12-hour on purpose, not by whatever the machine
   * happens to prefer.
   */
  it('is always 12-hour, whatever the machine prefers', () => {
    setDisplayTimezone('America/Toronto');
    // 22:05 UTC on a summer date is 18:05 in Toronto.
    expect(formatClock(new Date('2026-09-03T22:05:00.000Z'))).toBe('6:05 PM');
  });

  it('says AM and PM rather than 00 and 12', () => {
    setDisplayTimezone('UTC');
    expect(formatClock(new Date('2026-09-03T00:30:00.000Z'))).toBe('12:30 AM');
    expect(formatClock(new Date('2026-09-03T12:30:00.000Z'))).toBe('12:30 PM');
  });

  /**
   * The more serious half. Every time was rendered in the BROWSER'S timezone
   * while the API buckets days by the timezone on the user record, so a device
   * set elsewhere put the whole screen hours out of step with the data behind
   * it — silently, and only for that person.
   */
  it('follows the timezone Atlas holds, not the browser', () => {
    const instant = new Date('2026-09-03T22:05:00.000Z');
    setDisplayTimezone('America/Toronto');
    const toronto = formatClock(instant);
    setDisplayTimezone('Europe/London');
    expect(formatClock(instant)).not.toBe(toronto);
    expect(toronto).toBe('6:05 PM');
  });

  /** A garbled or missing zone must not throw, or every time on screen breaks. */
  it('keeps the last good zone when handed nonsense', () => {
    setDisplayTimezone('America/Toronto');
    setDisplayTimezone('Not/AZone');
    setDisplayTimezone(null);
    setDisplayTimezone(undefined);
    expect(displayTimezone()).toBe('America/Toronto');
    expect(formatClock(new Date('2026-09-03T22:05:00.000Z'))).toBe('6:05 PM');
  });

  /** DST is the case a fixed offset gets wrong twice a year. */
  it('follows the zone across a DST boundary', () => {
    setDisplayTimezone('America/Toronto');
    // 1 Nov 2026 is after the autumn change: EST, UTC-5.
    expect(formatClock(new Date('2026-11-02T22:05:00.000Z'))).toBe('5:05 PM');
    // Mid-summer: EDT, UTC-4.
    expect(formatClock(new Date('2026-07-02T22:05:00.000Z'))).toBe('6:05 PM');
  });
});
