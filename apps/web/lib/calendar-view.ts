/**
 * Pure logic behind the calendar view. No React, no fetching — so the day
 * bucketing, the slot maths and the overlap check are unit-tested rather than
 * eyeballed through the UI.
 */
import type { EventDTO } from '@atlas/shared';
import { localDayKey, startOfDay } from './dates';

const DAY_MS = 86_400_000;

/** Duration chips offered in the composer, in minutes. */
/**
 * Durations offered when creating an event.
 *
 * This used to stop at two hours, which quietly made a whole class of real
 * event — a shift, a flight, a match, an exam, a day of teaching — impossible
 * to enter without editing it afterwards. The chips exist so an end cannot
 * precede a start; that guarantee does not require them to be short.
 */
export const DURATION_PRESETS = [15, 30, 45, 60, 90, 120, 180, 240, 360, 480, 720] as const;

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

/* ── The week grid ──────────────────────────────────────────────────────────
   "Week" showed a flat agenda list grouped by day, which answers "what is next"
   — the question Today already answers — and not "what shape is my week", which
   is the only reason to look at seven days at once. A grid answers it: where
   the day is packed, where it is empty, what collides.

   All of the maths is here rather than in the component so the overlap
   columns and the window clamping are unit-tested instead of eyeballed.        */

/** Minutes past local midnight, for an instant on a given day. */
function minuteOfDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

export interface HourWindow {
  /** Whole hours, 0–24. `end` is exclusive and always > start. */
  startHour: number;
  endHour: number;
}

const DEFAULT_WINDOW: HourWindow = { startHour: 7, endHour: 23 };
/** Below this the grid stops reading as a day at all. */
const MIN_SPAN_HOURS = 8;

/**
 * The hours worth drawing.
 *
 * A fixed midnight-to-midnight grid spends most of its height on hours nobody
 * has anything in, which pushes the part you care about off the screen. So the
 * window starts from a sensible default and only widens to whatever the week
 * actually contains — a 6am gym session or a 1am flight pulls it open, and an
 * ordinary week never pays for them.
 */
export function visibleHourRange(events: EventDTO[]): HourWindow {
  let { startHour, endHour } = DEFAULT_WINDOW;
  for (const e of events) {
    if (e.allDay) continue;
    const s = new Date(e.startAt);
    const end = new Date(e.endAt);
    startHour = Math.min(startHour, Math.floor(minuteOfDay(s) / 60));
    // An event ending at 18:01 needs the 19:00 line. One ending exactly on the
    // hour does not, or every 5–6pm meeting would add a dead row.
    const endMin = end.getTime() > s.getTime() ? minuteOfDay(end) : minuteOfDay(s) + 30;
    endHour = Math.max(endHour, Math.ceil(endMin / 60));
  }
  startHour = Math.max(0, Math.min(startHour, 23));
  endHour = Math.min(24, Math.max(endHour, startHour + 1));
  if (endHour - startHour < MIN_SPAN_HOURS) {
    endHour = Math.min(24, startHour + MIN_SPAN_HOURS);
    startHour = Math.max(0, endHour - MIN_SPAN_HOURS);
  }
  return { startHour, endHour };
}

export interface PlacedEvent {
  event: EventDTO;
  /** Fractions of the window's height, 0–1. */
  top: number;
  height: number;
  /** Which of `cols` side-by-side columns this event takes. */
  col: number;
  cols: number;
}

/** Shortest block that stays readable and tappable, as a fraction of an hour. */
const MIN_BLOCK_MINUTES = 24;

/**
 * Place one day's timed events into the window, side by side where they clash.
 *
 * Events are grouped into clusters of transitively overlapping events, and each
 * cluster is split into as many columns as it needs — so two meetings at 2pm
 * each take half the width, and an unrelated 5pm one still takes all of it.
 * Clustering transitively matters: A–B overlapping and B–C overlapping means
 * all three share a width even when A and C do not touch.
 */
export function placeDayEvents(
  events: EventDTO[],
  day: Date,
  window: HourWindow,
): PlacedEvent[] {
  const key = localDayKey(day);
  const winStart = window.startHour * 60;
  const winSpan = (window.endHour - window.startHour) * 60;
  if (winSpan <= 0) return [];

  const timed = events
    .filter((e) => !e.allDay && localDayKey(new Date(e.startAt)) === key)
    .map((event) => {
      const s = new Date(event.startAt);
      const e = new Date(event.endAt);
      const startMin = minuteOfDay(s);
      // An event running past midnight is clipped to this day rather than
      // wrapping to a negative height.
      const rawEnd = e.getTime() > s.getTime() && localDayKey(e) === key ? minuteOfDay(e) : 1440;
      return { event, startMin, endMin: Math.max(startMin + MIN_BLOCK_MINUTES, rawEnd) };
    })
    .sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);

  const out: PlacedEvent[] = [];
  let i = 0;
  while (i < timed.length) {
    // One cluster: extend while the next event starts before the cluster ends.
    let clusterEnd = timed[i]!.endMin;
    let j = i + 1;
    while (j < timed.length && timed[j]!.startMin < clusterEnd) {
      clusterEnd = Math.max(clusterEnd, timed[j]!.endMin);
      j += 1;
    }

    // First column whose last event has already finished.
    const colEnds: number[] = [];
    const assigned: number[] = [];
    for (let k = i; k < j; k++) {
      const item = timed[k]!;
      let col = colEnds.findIndex((end) => end <= item.startMin);
      if (col === -1) {
        col = colEnds.length;
        colEnds.push(item.endMin);
      } else {
        colEnds[col] = item.endMin;
      }
      assigned.push(col);
    }

    const cols = colEnds.length;
    for (let k = i; k < j; k++) {
      const item = timed[k]!;
      const top = (item.startMin - winStart) / winSpan;
      const bottom = (item.endMin - winStart) / winSpan;
      // Clamped, not dropped: an event partly outside the window still has to
      // appear, or the grid quietly lies about the day.
      const clampedTop = Math.max(0, Math.min(1, top));
      const clampedBottom = Math.max(0, Math.min(1, bottom));
      if (clampedBottom <= clampedTop) continue;
      out.push({
        event: item.event,
        top: clampedTop,
        height: clampedBottom - clampedTop,
        col: assigned[k - i]!,
        cols,
      });
    }
    i = j;
  }
  return out;
}
