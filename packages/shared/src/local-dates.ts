export function displayDateOptions(opts: Intl.DateTimeFormatOptions, timezone?: string): Intl.DateTimeFormatOptions {
  return { ...opts, ...(timezone ? { timeZone: timezone } : {}) };
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
export function formatDueAt(due: Date, now: Date, timezone?: string): string {
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
  if (days < 7) return due.toLocaleDateString('en-US', displayDateOptions({ weekday: 'short' }, timezone));
  return due.toLocaleDateString('en-US', displayDateOptions({ month: 'short', day: 'numeric' }, timezone));
}

/** "Just now" / "12m ago" / "3h ago" / "yesterday" / "Jul 12" for the timeline. */
export function formatAgoAt(then: Date, now: Date, timezone?: string): string {
  const mins = Math.floor((now.getTime() - then.getTime()) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24 && dayDiff(then, now) === 0) return `${hours}h ago`;
  const days = dayDiff(then, now);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  return then.toLocaleDateString('en-US', displayDateOptions({ month: 'short', day: 'numeric' }, timezone));
}

/** Time-of-day greeting for the Home hero. */
export function greetingAt(now: Date): string {
  const h = now.getHours();
  if (h < 5) return 'Up late';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

/** "Friday, July 18" style heading for a day group. */
export function formatDayHeadingAt(d: Date, now: Date, timezone?: string): string {
  const days = dayDiff(d, now);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return d.toLocaleDateString('en-US', displayDateOptions({ weekday: 'long', month: 'long', day: 'numeric' }, timezone));
}

/** "9:30 AM" (or locale equivalent) without seconds. */
export function formatClockInTimezone(d: Date, timezone?: string): string {
  return d.toLocaleTimeString('en-US', displayDateOptions({ hour: 'numeric', minute: '2-digit', hour12: true }, timezone));
}
