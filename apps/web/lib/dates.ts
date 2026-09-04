/** Date helpers shared by the dashboard and domain views. Pure — unit-tested. */

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
 * these are pure functions called from everywhere, including outside React. It
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

/**
 * Options every formatter passes, so the clock and the zone are decided in ONE
 * place. `en-US` is the locale, not the user's, purely because it is the one
 * that renders `hour: 'numeric'` as "10:05 PM"; `hour12` is set explicitly as
 * well so the intent survives a locale change.
 */
export function fmt(opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormatOptions {
  return { ...opts, ...(displayTz ? { timeZone: displayTz } : {}) };
}

/**
 * Twenty-four hours, for ELAPSED time only — a rolling fetch window, a
 * "how long since" duration.
 *
 * It is NOT how you move between calendar days. A local day is 23 or 25 hours
 * on the DST transitions, so `date + DAY_MS` lands on the wrong date or the
 * wrong hour twice a year. Use `addDays` to step days and `dayDiff` to count
 * them; both are calendar arithmetic and neither cares how long a day was.
 */
export const DAY_MS = 86_400_000;

/** Local YYYY-MM-DD key for a date (calendar-day identity in the UI). */
export function localDayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Midnight (local) of the given date. */
export function startOfDay(d: Date): Date {
  const s = new Date(d);
  s.setHours(0, 0, 0, 0);
  return s;
}

/**
 * Move by whole CALENDAR days, keeping the wall-clock time.
 *
 * Not `+ n * 86_400_000`. A local day is not always 24 hours: on the autumn
 * transition it is 25, so adding a fixed day to midnight lands at 23:00 on the
 * SAME date — measured in America/Toronto, 1 Nov 2026 00:00 + 86_400_000ms is
 * 1 Nov 23:00, not 2 Nov. Anything paging by day then appears frozen for a day,
 * once a year, in the timezone this app is actually used in.
 *
 * `setDate` is calendar arithmetic and the runtime resolves the offset change.
 */
export function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

/** Whole local-calendar-day difference (b - a), ignoring time of day. */
export function dayDiff(a: Date, b: Date): number {
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / DAY_MS);
}

/**
 * Monday-based weekday bit for a date: bit 0 = Monday … bit 6 = Sunday. This is
 * the encoding `RoutineBlock.days` uses, so routine matching and canvas
 * building share one definition.
 */
export function dayBit(d: Date): number {
  return (d.getDay() + 6) % 7;
}

/**
 * Warm, compact phrasing for a due date relative to now:
 * overdue → "3d overdue" / "due yesterday"; today → "in 2h" / "in 20m" / "now";
 * then "tomorrow", "Fri", "Jul 28". Weekday names only inside the next week.
 */
export function formatDue(due: Date, now: Date = new Date()): string {
  const days = dayDiff(now, due);
  if (days < 0) {
    if (days === -1) return 'due yesterday';
    return `${-days}d overdue`;
  }
  if (days === 0) {
    const mins = Math.round((due.getTime() - now.getTime()) / 60_000);
    if (mins < -30) return 'earlier today';
    if (mins <= 5) return 'now';
    if (mins < 60) return `in ${mins}m`;
    return `in ${Math.round(mins / 60)}h`;
  }
  if (days === 1) return 'tomorrow';
  if (days < 7) return due.toLocaleDateString('en-US', fmt({ weekday: 'short' }));
  return due.toLocaleDateString('en-US', fmt({ month: 'short', day: 'numeric' }));
}

/** "Just now" / "12m ago" / "3h ago" / "yesterday" / "Jul 12" for the timeline. */
export function formatAgo(then: Date, now: Date = new Date()): string {
  const mins = Math.floor((now.getTime() - then.getTime()) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24 && dayDiff(then, now) === 0) return `${hours}h ago`;
  const days = dayDiff(then, now);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  return then.toLocaleDateString('en-US', fmt({ month: 'short', day: 'numeric' }));
}

/** Time-of-day greeting for the Home hero. */
export function greeting(now: Date = new Date()): string {
  const h = now.getHours();
  if (h < 5) return 'Up late';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

/** "Friday, July 18" style heading for a day group. */
export function formatDayHeading(d: Date, now: Date = new Date()): string {
  const days = dayDiff(d, now);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return d.toLocaleDateString('en-US', fmt({ weekday: 'long', month: 'long', day: 'numeric' }));
}

/** "9:30 AM" (or locale equivalent) without seconds. */
export function formatClock(d: Date): string {
  return d.toLocaleTimeString('en-US', fmt({ hour: 'numeric', minute: '2-digit', hour12: true }));
}
