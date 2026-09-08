import { afterEach, describe, expect, it } from 'vitest';
import { displayTimezone, formatClock, setDisplayTimezone } from '../lib/dates';

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
