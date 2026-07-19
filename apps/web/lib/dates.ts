/** Date helpers shared by the dashboard and domain views. Pure — unit-tested. */

const DAY_MS = 86_400_000;

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

/** Whole local-calendar-day difference (b - a), ignoring time of day. */
export function dayDiff(a: Date, b: Date): number {
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / DAY_MS);
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
  if (days < 7) return due.toLocaleDateString(undefined, { weekday: 'short' });
  return due.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
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
  return then.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
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
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
}

/** "9:30 AM" (or locale equivalent) without seconds. */
export function formatClock(d: Date): string {
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}
