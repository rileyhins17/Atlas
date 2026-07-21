import type { EventDTO, RoutineBlockDTO, TaskDTO, TimelineEventDTO } from '@atlas/shared';
import { localDayKey } from './dates';

/**
 * The Day Canvas engine — pure, exhaustively unit-tested (see docs/atlas-design-v4.md §3).
 *
 * A day is a vertical sequence of TIME SECTIONS: the user's routine blocks as
 * the backbone (sized by content, not wall-clock scale) with the gaps rendered
 * as tappable "Open" sections. Foreground items (events, due tasks, actuals
 * from the timeline) are distributed into the section containing their moment.
 */

export type CanvasItem =
  | {
      type: 'event';
      id: string;
      title: string;
      at: Date;
      end: Date | null;
      location: string | null;
    }
  | { type: 'task'; id: string; taskId: string; title: string; at: Date }
  | { type: 'actual'; id: string; row: TimelineEventDTO; at: Date };

export interface CanvasSection {
  kind: 'routine' | 'open';
  /** Routine sections carry their block's kind for the background tint. */
  routineKind?: string;
  label: string;
  start: Date;
  end: Date;
  items: CanvasItem[];
  /** True on today's section containing `now`. */
  isNow: boolean;
  /** Insertion index of the now-line among `items` (only when isNow). */
  nowIndex?: number;
}

export type DayFlavor = 'past' | 'today' | 'future';

export interface DayCanvas {
  flavor: DayFlavor;
  sections: CanvasSection[];
  /** All-day events, rendered in the day header rather than a time slot. */
  allDay: CanvasItem[];
}

/**
 * Timeline rows that are CRUD noise on a canvas, not life moments. The canvas
 * shows what HAPPENED at a time — completions, check-ins, entries, money —
 * not that a record was edited (the event/task cards already show the record).
 */
export const CANVAS_NOISE_TYPES = new Set([
  'event.created',
  'event.updated',
  'event.deleted',
  'event.imported',
  'task.created',
  'task.updated',
  'task.deleted',
  'connector.connected',
  'finance.synced',
]);

/** Ignore sub-5-minute slivers between routine blocks — not a plannable gap. */
const MIN_OPEN_MS = 5 * 60_000;

const DAY_MS = 86_400_000;

/** Monday-based day bit (bit 0 = Monday … bit 6 = Sunday) — matches RoutineBlock.days. */
function dayBit(d: Date): number {
  return (d.getDay() + 6) % 7;
}

function localMidnight(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Minutes-of-day → an absolute Date on the given local day. */
function atMinute(dayStart: Date, min: number): Date {
  return new Date(dayStart.getFullYear(), dayStart.getMonth(), dayStart.getDate(), 0, min);
}

interface Segment {
  block: RoutineBlockDTO;
  start: Date;
  end: Date;
}

/**
 * Resolve the routine segments overlapping one local day. An overnight block
 * (start > end) contributes its NIGHT HEAD on days matching its own mask and
 * its MORNING TAIL on the day after a matching day.
 */
function routineSegments(blocks: RoutineBlockDTO[], dayStart: Date): Segment[] {
  const dayEnd = new Date(dayStart.getTime() + DAY_MS);
  const todayMask = 1 << dayBit(dayStart);
  const yesterdayMask = 1 << dayBit(new Date(dayStart.getTime() - DAY_MS));
  const segments: Segment[] = [];

  for (const b of blocks) {
    if (b.startMin <= b.endMin) {
      if (b.days & todayMask) {
        segments.push({ block: b, start: atMinute(dayStart, b.startMin), end: atMinute(dayStart, b.endMin) });
      }
    } else {
      // Morning tail (block started yesterday).
      if (b.days & yesterdayMask) {
        segments.push({ block: b, start: dayStart, end: atMinute(dayStart, b.endMin) });
      }
      // Night head (block starts today, runs to midnight).
      if (b.days & todayMask) {
        segments.push({ block: b, start: atMinute(dayStart, b.startMin), end: dayEnd });
      }
    }
  }

  // Chronological; overlaps resolved deterministically: earlier start wins,
  // the later segment is clamped forward (dropped if fully swallowed).
  segments.sort((a, b) => a.start.getTime() - b.start.getTime());
  const resolved: Segment[] = [];
  for (const seg of segments) {
    const prev = resolved[resolved.length - 1];
    if (prev && seg.start.getTime() < prev.end.getTime()) {
      if (seg.end.getTime() <= prev.end.getTime()) continue; // swallowed
      resolved.push({ ...seg, start: prev.end });
    } else {
      resolved.push(seg);
    }
  }
  return resolved;
}

/** Build the full section skeleton: routine segments + Open gaps. */
function buildSections(blocks: RoutineBlockDTO[], dayStart: Date): CanvasSection[] {
  const dayEnd = new Date(dayStart.getTime() + DAY_MS);
  const segments = routineSegments(blocks, dayStart);
  const sections: CanvasSection[] = [];
  let cursor = dayStart;

  const pushOpen = (start: Date, end: Date) => {
    if (end.getTime() - start.getTime() >= MIN_OPEN_MS) {
      sections.push({ kind: 'open', label: 'Open', start, end, items: [], isNow: false });
    }
  };

  for (const seg of segments) {
    pushOpen(cursor, seg.start);
    sections.push({
      kind: 'routine',
      routineKind: seg.block.kind,
      label: seg.block.label,
      start: seg.start,
      end: seg.end,
      items: [],
      isNow: false,
    });
    cursor = seg.end;
  }
  pushOpen(cursor, dayEnd);

  // A day with no routine at all is still a canvas: one big Open section.
  if (sections.length === 0) {
    sections.push({ kind: 'open', label: 'Open', start: dayStart, end: dayEnd, items: [], isNow: false });
  }
  return sections;
}

/** The section whose [start, end) contains `at` (falls back to the last one). */
function sectionFor(sections: CanvasSection[], at: Date): CanvasSection {
  for (const s of sections) {
    if (at.getTime() >= s.start.getTime() && at.getTime() < s.end.getTime()) return s;
  }
  return sections[sections.length - 1]!;
}

/**
 * Assemble one local day. `day` is any instant within the target day; `now` is
 * the real current time (drives flavor + the now-line placement).
 */
export function buildDayCanvas(
  day: Date,
  blocks: RoutineBlockDTO[],
  events: EventDTO[],
  tasks: TaskDTO[],
  rows: TimelineEventDTO[],
  now: Date,
): DayCanvas {
  const dayStart = localMidnight(day);
  const dayKey = localDayKey(dayStart);
  const nowKey = localDayKey(now);
  const flavor: DayFlavor = dayKey === nowKey ? 'today' : dayKey < nowKey ? 'past' : 'future';

  const sections = buildSections(blocks, dayStart);
  const allDay: CanvasItem[] = [];

  for (const e of events) {
    const start = new Date(e.startAt);
    if (localDayKey(start) !== dayKey) continue;
    const item: CanvasItem = {
      type: 'event',
      id: `e-${e.id}`,
      title: e.title,
      at: start,
      end: e.endAt ? new Date(e.endAt) : null,
      location: e.location,
    };
    if (e.allDay) allDay.push(item);
    else sectionFor(sections, start).items.push(item);
  }

  for (const t of tasks) {
    // Time-anchored, still-open tasks only: done work appears as an actual
    // (task.completed) and undated tasks live on /tasks, not a time canvas.
    if (t.status === 'DONE' || !t.dueAt) continue;
    const due = new Date(t.dueAt);
    if (localDayKey(due) !== dayKey) continue;
    sectionFor(sections, due).items.push({
      type: 'task',
      id: `t-${t.id}`,
      taskId: t.id,
      title: t.title,
      at: due,
    });
  }

  for (const row of rows) {
    if (CANVAS_NOISE_TYPES.has(row.type)) continue;
    const at = new Date(row.occurredAt);
    if (localDayKey(at) !== dayKey) continue;
    sectionFor(sections, at).items.push({ type: 'actual', id: `r-${row.id}`, row, at });
  }

  for (const s of sections) {
    s.items.sort((a, b) => a.at.getTime() - b.at.getTime());
  }

  if (flavor === 'today') {
    const current = sectionFor(sections, now);
    current.isNow = true;
    current.nowIndex = current.items.filter((i) => i.at.getTime() <= now.getTime()).length;
  }

  return { flavor, sections, allDay };
}

/** "Work · until 5:00 PM" — the supposed-to-be-doing statement for the header. */
export function supposedTo(canvas: DayCanvas): { label: string; until: Date } | null {
  const current = canvas.sections.find((s) => s.isNow);
  if (!current || current.kind !== 'routine') return null;
  return { label: current.label, until: current.end };
}
