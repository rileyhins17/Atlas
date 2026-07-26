/**
 * Pure logic behind the calendar view. No React, no fetching — so the day
 * bucketing, the slot maths and the overlap check are unit-tested rather than
 * eyeballed through the UI.
 */
import type { EventDTO } from '@atlas/shared';
import { localDayKey, startOfDay } from './dates';

const DAY_MS = 86_400_000;

/** Duration chips offered in the composer, in minutes. */
export const DURATION_PRESETS = [15, 30, 45, 60, 90, 120] as const;

export function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

/**
 * Monday-based start of the week containing `d`. Monday because the routine
 * model already encodes weekdays with bit 0 = Monday; two different week
 * origins in one app is how off-by-one-day bugs get born.
 */
export function startOfWeek(d: Date): Date {
  const s = startOfDay(d);
  return addDays(s, -((s.getDay() + 6) % 7));
}

/** The seven dates of the week containing `anchor`, Monday first. */
export function weekDays(anchor: Date): Date[] {
  const start = startOfWeek(anchor);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export interface DayBucket {
  key: string;
  date: Date;
  events: EventDTO[];
}

/** How many events fall on each local day — drives the week-strip density dots. */
export function countsByDay(events: EventDTO[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const e of events) {
    const key = localDayKey(new Date(e.startAt));
    out.set(key, (out.get(key) ?? 0) + 1);
  }
  return out;
}

/**
 * Group events into local calendar days, ascending, start-time ordered inside
 * each day. Unlike the old agenda this does NOT drop past days — being unable
 * to look at yesterday is a bug, not a feature. Callers choose the range.
 */
export function bucketByDay(events: EventDTO[], from?: Date, to?: Date): DayBucket[] {
  const lo = from ? startOfDay(from).getTime() : -Infinity;
  const hi = to ? startOfDay(to).getTime() + DAY_MS : Infinity;
  const byDay = new Map<string, EventDTO[]>();

  for (const e of events) {
    const start = new Date(e.startAt);
    const t = startOfDay(start).getTime();
    if (t < lo || t >= hi) continue;
    const key = localDayKey(start);
    const arr = byDay.get(key);
    if (arr) arr.push(e);
    else byDay.set(key, [e]);
  }

  return [...byDay.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([key, list]) => ({
      key,
      date: dateFromDayKey(key),
      events: list.sort(
        (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
      ),
    }));
}

/**
 * A local Date at noon on the given YYYY-MM-DD. Noon, not midnight, so that a
 * DST transition can never shunt the date to the previous day.
 */
export function dateFromDayKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1, 12, 0, 0, 0);
}

/** The next :00 or :30 boundary at or after `now`. */
export function nextSlot(now: Date, stepMin = 30): Date {
  const out = new Date(now);
  out.setSeconds(0, 0);
  const rem = out.getMinutes() % stepMin;
  out.setMinutes(out.getMinutes() + (rem === 0 ? 0 : stepMin - rem));
  return out;
}

/** "14:30" for an `<input type="time">`. */
export function toTimeValue(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Combine a YYYY-MM-DD day key and an HH:MM time into a LOCAL Date. */
export function combineLocal(dayKey: string, hhmm: string): Date {
  const [y, m, d] = dayKey.split('-').map(Number);
  const [hh, mm] = hhmm.split(':').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1, hh ?? 0, mm ?? 0, 0, 0);
}

export function minutesBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 60_000);
}

/** "45m" · "1h" · "1h 30m" · "all day". */
export function formatDuration(mins: number): string {
  if (mins <= 0) return '0m';
  if (mins >= 1440 && mins % 1440 === 0) return `${mins / 1440}d`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (!h) return `${m}m`;
  if (!m) return `${h}h`;
  return `${h}h ${m}m`;
}

/**
 * Events that overlap [start, end), so the composer can warn before creating a
 * double-booking. Half-open on both sides: an event ending exactly when another
 * starts is back-to-back, not a clash.
 */
export function findOverlaps(
  events: EventDTO[],
  start: Date,
  end: Date,
  ignoreId?: string,
): EventDTO[] {
  const s = start.getTime();
  const e = end.getTime();
  return events.filter((ev) => {
    if (ignoreId && ev.id === ignoreId) return false;
    if (ev.allDay) return false;
    const evS = new Date(ev.startAt).getTime();
    const evE = new Date(ev.endAt).getTime();
    return evS < e && evE > s;
  });
}

/** Index in `events` where a "now" marker belongs, or -1 if it does not apply. */
export function nowMarkerIndex(events: EventDTO[], now: Date): number {
  const t = now.getTime();
  const i = events.findIndex((e) => new Date(e.startAt).getTime() > t);
  return i;
}

/** True when the event is happening right now. */
export function isLive(e: EventDTO, now: Date): boolean {
  if (e.allDay) return localDayKey(new Date(e.startAt)) === localDayKey(now);
  const t = now.getTime();
  return new Date(e.startAt).getTime() <= t && new Date(e.endAt).getTime() > t;
}

/** "Mon" · "Tue" … single-letter variants are ambiguous (T/T, S/S). */
export function weekdayShort(d: Date): string {
  return d.toLocaleDateString(undefined, { weekday: 'short' });
}

/** "July 2026", or "Jun – Jul 2026" when the visible week straddles months. */
export function rangeLabel(days: Date[]): string {
  if (days.length === 0) return '';
  const first = days[0]!;
  const last = days[days.length - 1]!;
  if (first.getMonth() === last.getMonth() && first.getFullYear() === last.getFullYear()) {
    return first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  }
  const a = first.toLocaleDateString(undefined, { month: 'short' });
  const b = last.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
  return `${a} – ${b}`;
}
