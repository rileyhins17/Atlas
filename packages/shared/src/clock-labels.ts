import type { CanvasSection } from './canvas.js';
import { addDays, localDayKey, dayDiff, displayDateOptions, formatClockInTimezone } from './local-dates.js';
import { DAILY, WEEKDAYS } from './onboarding.js';

export const ROUTINE_DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export function canvasDayTitle(day: Date, now: Date, timezone?: string): string {
  const key = localDayKey(day);
  const nowKey = localDayKey(now);
  // Same DST reason as the pager itself: on a 25-hour day the fixed-ms form
  // makes "tomorrow" resolve to today, so the heading reads Today twice.
  const yesterday = localDayKey(addDays(now, -1));
  const tomorrow = localDayKey(addDays(now, 1));
  const pretty = day.toLocaleDateString('en-US', displayDateOptions({ weekday: 'long', month: 'long', day: 'numeric' }, timezone));
  if (key === nowKey) return `Today · ${pretty}`;
  if (key === yesterday) return `Yesterday · ${pretty}`;
  if (key === tomorrow) return `Tomorrow · ${pretty}`;
  return pretty;
}

/** "9 AM" — 12-hour, in the user's timezone, without minutes on the hour. */
export function calendarHourLabel(hour: number, now: Date, timezone?: string): string {
  const d = new Date(now);
  d.setHours(hour, 0, 0, 0);
  return d.toLocaleTimeString('en-US', displayDateOptions({ hour: 'numeric', hour12: true }, timezone));
}

export function clockOrMidnightInTimezone(d: Date, timezone?: string): string {
  return d.getHours() === 0 && d.getMinutes() === 0 ? 'midnight' : formatClockInTimezone(d, timezone);
}

export function canvasSpanLabel(s: CanvasSection, timezone?: string): string {
  return `${clockOrMidnightInTimezone(s.start, timezone)} – ${clockOrMidnightInTimezone(s.end, timezone)}`;
}

/** "3 days ago" / "today" — how long since a saved day was last trained. */
export function workoutRecencyLabel(iso: string | null, now: Date): string {
  if (!iso) return 'not done yet';
  // Calendar days, not elapsed hours. Dividing the gap by 24h called a session
  // logged at 23:00 last night "today" until 23:00 tonight, because barely a
  // day had passed — while every calendar on the screen said otherwise.
  const days = dayDiff(new Date(iso), now);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 14) return 'last week';
  return `${Math.floor(days / 7)} weeks ago`;
}

/** Minutes elapsed, rendered as the running clock a session needs. */
export function elapsedWorkoutLabel(startedAt: string, nowMs: number): string {
  const mins = Math.max(0, Math.round((nowMs - new Date(startedAt).getTime()) / 60_000));
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m`;
}

export function describeRoutineDays(days: number): string {
  if (days === DAILY) return 'Every day';
  if (days === WEEKDAYS) return 'Weekdays';
  const on = ROUTINE_DAY_NAMES.filter((_, i) => days & (1 << i));
  if (on.length === 0) return 'Never';
  return on.map((d) => d.slice(0, 3)).join(', ');
}

