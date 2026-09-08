import { displayDateOptions, formatDueAt, formatAgoAt, greetingAt, formatDayHeadingAt, formatClockInTimezone } from '@atlas/shared';
export { DAY_MS, localDayKey, startOfDay, addDays, dayDiff, dayBit } from '@atlas/shared';

/** Web adapter: owns the display timezone and supplies the current clock. */

/**
 * The timezone times are DISPLAYED in, and whether to use a 12-hour clock.
 *
 * Two real bugs live here, both reported by the same user on the same day.
 *
 * `toLocaleTimeString(undefined, { hour: 'numeric' })` takes the browser's
 * locale, and en-GB and en-CA render that as a 24-hour clock: a massage at ten
 * past ten in the evening came out as "22:05", which nobody reads as a time
 * they are about to attend. Atlas is a day planner, so it is now explicitly a
 * 12-hour clock everywhere rather than whatever the machine happens to prefer.
 *
 * The timezone is the more serious half. Every time in the app was rendered in
 * the BROWSER'S timezone, while the API buckets days by the timezone stored on
 * the user record — so a device that disagrees puts the whole app an hour or
 * four out, silently, and only for that person. The stored timezone is the one
 * Atlas already treats as the truth, so it is now the one the screen uses.
 *
 * A module-level value rather than a prop threaded through fifty components:
 * these adapters are called from everywhere, including outside React. It
 * defaults to the browser until `/auth/me` arrives, which is the same answer
 * for anyone whose device is set correctly.
 */
let displayTz: string | undefined;

/** Set once the user record is known. Ignores nonsense rather than throwing. */
export function setDisplayTimezone(tz: string | null | undefined): void {
  if (!tz) return;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    displayTz = tz;
  } catch {
    /* not a real IANA zone — keep the browser's */
  }
}

/** The timezone the UI is formatting in, or undefined for the browser's. */
export function displayTimezone(): string | undefined {
  return displayTz;
}

export function fmt(opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormatOptions {
  return displayDateOptions(opts, displayTz);
}
export function formatDue(due: Date, now: Date = new Date()): string {
  return formatDueAt(due, now, displayTz);
}
export function formatAgo(then: Date, now: Date = new Date()): string {
  return formatAgoAt(then, now, displayTz);
}
export function greeting(now: Date = new Date()): string {
  return greetingAt(now);
}
export function formatDayHeading(d: Date, now: Date = new Date()): string {
  return formatDayHeadingAt(d, now, displayTz);
}
export function formatClock(d: Date): string {
  return formatClockInTimezone(d, displayTz);
}
