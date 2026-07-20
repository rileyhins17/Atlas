import type { EventDTO, RoutineBlockDTO, TaskDTO, TimelineEventDTO } from '@atlas/shared';
import { localDayKey } from './dates';

/**
 * Pure logic for The Stream — Atlas's home surface. No React, no fetching:
 * everything here is unit-tested with fixed dates.
 */

export interface UpNextItem {
  id: string;
  kind: 'task' | 'event';
  title: string;
  /** When it happens (event start / task due). */
  at: Date;
  end?: Date;
  allDay?: boolean;
  location?: string | null;
  /** Set for tasks — drives the one-tap complete. */
  taskId?: string;
  overdue?: boolean;
}

export interface UpNext {
  overdue: UpNextItem[];
  today: UpNextItem[];
  /** Tomorrow stays collapsed to a count so the plan never dwarfs the feed. */
  tomorrowCount: number;
}

/** Keep the plan glanceable: the feed is the star, not the todo pile. */
const TODAY_CAP = 8;
const OVERDUE_CAP = 5;

/**
 * The bounded plan above the now-line: overdue tasks (warm warning), then the
 * rest of today (remaining events + due tasks, chronological, all-day events
 * first), then tomorrow as a collapsed count.
 */
export function buildUpNext(events: EventDTO[], tasks: TaskDTO[], now: Date): UpNext {
  const todayKey = localDayKey(now);
  const tomorrowKey = localDayKey(new Date(now.getTime() + 86_400_000));

  const overdue: UpNextItem[] = [];
  const today: UpNextItem[] = [];
  let tomorrowCount = 0;

  for (const e of events) {
    const start = new Date(e.startAt);
    const end = new Date(e.endAt);
    const key = localDayKey(start);
    if (key === todayKey) {
      // Only what's still ahead (or running right now).
      if (end.getTime() >= now.getTime() || e.allDay) {
        today.push({
          id: `e-${e.id}`,
          kind: 'event',
          title: e.title,
          at: start,
          end,
          allDay: e.allDay,
          location: e.location,
        });
      }
    } else if (key === tomorrowKey) {
      tomorrowCount++;
    }
  }

  for (const t of tasks) {
    if (t.status === 'DONE' || !t.dueAt) continue;
    const due = new Date(t.dueAt);
    const key = localDayKey(due);
    if (due.getTime() < now.getTime() && key !== todayKey) {
      overdue.push({
        id: `t-${t.id}`,
        kind: 'task',
        title: t.title,
        at: due,
        taskId: t.id,
        overdue: true,
      });
    } else if (key === todayKey) {
      today.push({ id: `t-${t.id}`, kind: 'task', title: t.title, at: due, taskId: t.id });
    } else if (key === tomorrowKey) {
      tomorrowCount++;
    }
  }

  overdue.sort((a, b) => a.at.getTime() - b.at.getTime());
  today.sort(
    (a, b) =>
      Number(b.allDay ?? false) - Number(a.allDay ?? false) || a.at.getTime() - b.at.getTime(),
  );

  return {
    overdue: overdue.slice(0, OVERDUE_CAP),
    today: today.slice(0, TODAY_CAP),
    tomorrowCount,
  };
}

/** Feed rows grouped by local day, insertion (newest-first) order preserved. */
export function groupFeedByDay(rows: TimelineEventDTO[]): Array<[string, TimelineEventDTO[]]> {
  const byDay = new Map<string, TimelineEventDTO[]>();
  for (const row of rows) {
    const key = localDayKey(new Date(row.occurredAt));
    const arr = byDay.get(key) ?? [];
    arr.push(row);
    byDay.set(key, arr);
  }
  return [...byDay.entries()];
}

/**
 * The still-open task behind a feed row, or null. Lets the feed render a live
 * complete-checkbox on "task created" rows whose task hasn't been done yet —
 * the feed is a surface you act on, not just read.
 */
export function openTaskRef(row: TimelineEventDTO, tasks: TaskDTO[]): TaskDTO | null {
  if (row.refType !== 'task' || !row.refId) return null;
  if (!row.type.startsWith('task.') || row.type === 'task.completed' || row.type === 'task.deleted')
    return null;
  const task = tasks.find((t) => t.id === row.refId);
  return task && task.status !== 'DONE' ? task : null;
}

/* ── Routine awareness: what you're SUPPOSED to be doing right now ───────── */

/** Monday-based day bit for a date (bit 0 = Monday … bit 6 = Sunday). */
function dayBit(d: Date): number {
  return (d.getDay() + 6) % 7;
}

function minuteOf(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

/**
 * The routine block active at `now`, or null. Handles overnight blocks
 * (start > end, e.g. sleep 23:00–07:00): the early-morning half belongs to the
 * block that STARTED yesterday, so yesterday's day-mask governs it.
 */
export function routineAt(blocks: RoutineBlockDTO[], now: Date): RoutineBlockDTO | null {
  const t = minuteOf(now);
  const today = 1 << dayBit(now);
  const yesterday = 1 << dayBit(new Date(now.getTime() - 86_400_000));

  for (const b of blocks) {
    if (b.startMin <= b.endMin) {
      if (b.days & today && t >= b.startMin && t < b.endMin) return b;
    } else {
      // Wrapped: tonight's half (today's mask) or this morning's half (yesterday's mask).
      if ((b.days & today && t >= b.startMin) || (b.days & yesterday && t < b.endMin)) return b;
    }
  }
  return null;
}

/** The next routine block to start within 48h, as { block, at }. */
export function nextRoutine(
  blocks: RoutineBlockDTO[],
  now: Date,
): { block: RoutineBlockDTO; at: Date } | null {
  const t = minuteOf(now);
  let best: { block: RoutineBlockDTO; at: Date } | null = null;
  for (const dayOffset of [0, 1]) {
    const day = new Date(now.getTime() + dayOffset * 86_400_000);
    const mask = 1 << dayBit(day);
    for (const b of blocks) {
      if (!(b.days & mask)) continue;
      if (dayOffset === 0 && b.startMin <= t) continue; // already started today
      const at = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, b.startMin);
      if (!best || at.getTime() < best.at.getTime()) best = { block: b, at };
    }
    if (best) break; // earliest of the first day that has any future block
  }
  return best;
}

/** "07:00" → a Date-free display like "7:00 AM" via a throwaway date. */
export function formatMinute(min: number): string {
  return new Date(2000, 0, 1, Math.floor(min / 60), min % 60).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Where a feed row should navigate on tap, by its ref type. */
export function feedRowHref(row: TimelineEventDTO): string | null {
  switch (row.refType) {
    case 'task':
      return '/tasks';
    case 'event':
      return '/calendar';
    case 'habit':
      return '/habits';
    case 'journal':
      return '/journal';
    case 'note':
      return '/notes';
    case 'account':
    case 'transaction':
      return '/finance';
    default:
      return null;
  }
}
