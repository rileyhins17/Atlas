import type { RoutineBlockDTO, TaskDTO, TimelineEventDTO } from '@atlas/shared';
import { localDayKey } from './dates';

/**
 * Pure logic for the History feed and the now-line. (The Up-Next plan logic
 * that used to live here was superseded by the Day Canvas — see lib/canvas.ts,
 * which owns "what fills the day".)
 */

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
