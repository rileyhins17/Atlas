import type { EventDTO, RoutineBlockDTO, TaskDTO, TimelineEventDTO } from '@atlas/shared';
import { addDays, dayBit, localDayKey, startOfDay } from './dates';

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
  // Rolling a task into today puts it in today's checklist — a card saying so
  // is the same fact twice. ('task.dropped' is NOT noise: the task disappears
  // from every list, so the feed row is the only trace of the decision.)
  'task.rolled_forward',
  // The completed row carries the whole session summary; the start is noise.
  'workout.started',
]);

/** Ignore sub-5-minute slivers between routine blocks — not a plannable gap. */
const MIN_OPEN_MS = 5 * 60_000;


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
  // Calendar arithmetic throughout. A fixed 24h made `dayEnd` an hour short on
  // the 25-hour autumn day — dropping the last hour of the routine from the
  // canvas — and made "yesterday" resolve to TODAY, so the overnight tail was
  // matched against the wrong day's mask.
  const dayEnd = addDays(dayStart, 1);
  const yesterday = addDays(dayStart, -1);
  const todayMask = 1 << dayBit(dayStart);
  const yesterdayMask = 1 << dayBit(yesterday);
  const todayKey = localDayKey(dayStart);
  const yesterdayKey = localDayKey(yesterday);

  // A dated block DESCRIBES this particular day, so it replaces the weekly block
  // it stands in for — but only the one of the SAME KIND. "Working 7–3 today"
  // should override the usual 9–5 work block and leave sleep and meals alone,
  // and it must not leak into any other day. 'off' never replaces anything; it
  // is a carver, handled below.
  const replacedKinds = new Set(
    blocks.filter((b) => b.onDate === todayKey && b.kind !== 'off').map((b) => b.kind),
  );
  const source = blocks.filter((b) =>
    b.onDate ? b.onDate === todayKey || b.onDate === yesterdayKey : !replacedKinds.has(b.kind),
  );

  const applies = (b: RoutineBlockDTO, mask: number, key: string) =>
    b.onDate ? b.onDate === key : (b.days & mask) !== 0;

  const raw: Segment[] = [];
  for (const b of source) {
    if (b.startMin <= b.endMin) {
      if (applies(b, todayMask, todayKey)) {
        raw.push({ block: b, start: atMinute(dayStart, b.startMin), end: atMinute(dayStart, b.endMin) });
      }
    } else {
      // Morning tail (block started yesterday).
      if (applies(b, yesterdayMask, yesterdayKey)) {
        raw.push({ block: b, start: dayStart, end: atMinute(dayStart, b.endMin) });
      }
      // Night head (block starts today, runs to midnight).
      if (applies(b, todayMask, todayKey)) {
        raw.push({ block: b, start: atMinute(dayStart, b.startMin), end: dayEnd });
      }
    }
  }

  // 'off' is not something you do — it CLEARS the routine for its window, so a
  // vacation day or a swapped shift stops reading as Work. Subtract those spans
  // from everything else before resolving overlaps.
  const offs = raw.filter((r) => r.block.kind === 'off');
  const kept: Segment[] = [];
  for (const seg of raw.filter((r) => r.block.kind !== 'off')) {
    let pieces: Segment[] = [seg];
    for (const off of offs) {
      const next: Segment[] = [];
      for (const p of pieces) {
        // No overlap — the piece survives whole.
        if (off.end <= p.start || off.start >= p.end) {
          next.push(p);
          continue;
        }
        // The head before the off window, and the tail after it. Either may be
        // empty, which is how a fully-covered segment disappears.
        if (p.start < off.start) next.push({ ...p, end: off.start });
        if (off.end < p.end) next.push({ ...p, start: off.end });
      }
      pieces = next;
    }
    kept.push(...pieces);
  }

  // Chronological; overlaps resolved deterministically: earlier start wins,
  // the later segment is clamped forward (dropped if fully swallowed).
  kept.sort((a, b) => a.start.getTime() - b.start.getTime());
  const resolved: Segment[] = [];
  for (const seg of kept) {
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
  const dayEnd = addDays(dayStart, 1);
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
  const dayStart = startOfDay(day);
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

/* ── The Today overview ───────────────────────────────────────────────────
 * The full canvas is the PLANNING surface; it renders every hour, which on a
 * normal day is ~65% empty scaffolding. The overview is the DAILY-USE surface:
 * it answers the only four questions you actually open the app with —
 * what now, what's left, habits done, what happened — and nothing else.
 */

export interface DayOverview {
  /** The routine block you're inside right now (null in a gap / on other days). */
  now: { label: string; kind: string; until: Date } | null;
  /**
   * A timed item that has ALREADY STARTED and hasn't ended — you are in it now.
   * Kept separate from `next` because calling a live thing "Next 4:11" when it
   * began two minutes ago is simply wrong, and that is what the UI showed
   * before this existed.
   */
  current: CanvasItem | null;
  /** The next thing that hasn't started yet, if any remain today. */
  next: CanvasItem | null;
  /** Everything still ahead today, chronological — `next` is its first entry. */
  ahead: CanvasItem[];
  /**
   * Things you TICK OFF: tasks still due today. The UI merges habits in — they
   * aren't canvas items, but they belong to the same "check it and move on" act.
   */
  checklist: CanvasItem[];
  /** Things you SHOW UP TO: timed events still ahead. Different verb, own block. */
  timed: CanvasItem[];
  /** What already happened today, most recent first (collapsed in the UI). */
  earlier: CanvasItem[];
  /** All-day events, surfaced as a banner. */
  allDay: CanvasItem[];
  /**
   * Unclaimed windows still ahead today — the raw material for planning.
   * Sleep and wind-down are NOT free time, so they never appear here.
   */
  gaps: { start: Date; end: Date; minutes: number }[];
}

/**
 * Flatten a day canvas into the overview. Routine becomes context (the "now"
 * line) rather than twelve mostly-empty sections, and real items are split by
 * whether they're still ahead of you.
 */
export function buildDayOverview(canvas: DayCanvas, now: Date): DayOverview {
  const current = canvas.sections.find((s) => s.isNow);
  const items = canvas.sections.flatMap((s) => s.items);

  const ahead: CanvasItem[] = [];
  const earlier: CanvasItem[] = [];
  for (const item of items) {
    // An event you're currently inside still counts as ahead — it's live.
    const over = item.type === 'event' && item.end ? item.end <= now : item.at <= now;
    // Actuals are always history; they're records of things that happened.
    if (item.type === 'actual' || over) earlier.push(item);
    else ahead.push(item);
  }

  ahead.sort((a, b) => a.at.getTime() - b.at.getTime());
  earlier.sort((a, b) => b.at.getTime() - a.at.getTime());

  // Split "happening right now" out of "ahead". An event that started at 4:11
  // and runs to 11:00 is not your NEXT thing at 4:13 — it's your current one.
  const live = ahead.find((i) => i.type === 'event' && i.at <= now && (i.end ? i.end > now : false)) ?? null;
  const upcoming = ahead.filter((i) => i !== live);

  return {
    now:
      current && current.kind === 'routine'
        ? { label: current.label, kind: current.routineKind ?? 'custom', until: current.end }
        : null,
    current: live,
    next: upcoming[0] ?? null,
    ahead,
    checklist: ahead.filter((i) => i.type === 'task'),
    timed: ahead.filter((i) => i.type === 'event'),
    earlier,
    allDay: canvas.allDay,
    gaps: openGaps(canvas, now),
  };
}

/** Below this a gap isn't worth offering — you can't plan into 10 minutes. */
const MIN_GAP_MS = 20 * 60_000;

/**
 * How long an event with no end time is treated as claiming. Atlas always
 * writes an end, so this only covers imported events; half an hour is the
 * smallest claim that isn't just a reminder.
 */
const UNBOUNDED_EVENT_MS = 30 * 60_000;

/**
 * The windows still open ahead of `now`.
 *
 * Only genuinely unclaimed time counts: an Open gap, minus anything already
 * scheduled inside it. EVERY routine block is excluded, not just sleep and
 * work — a meal or a gym slot is time you already spoke for, and offering it
 * back would recreate the exact problem this feature exists to fix (the day
 * claiming you're free when you aren't).
 *
 * Events are SUBTRACTED rather than disqualifying the window they sit in. A
 * single one-hour event must not swallow an eight-hour evening: that made the
 * day read as fully booked the moment you accepted one proposal, and on a day
 * off — the one day the whole span is open — it hid free time entirely.
 */
function openGaps(canvas: DayCanvas, now: Date): { start: Date; end: Date; minutes: number }[] {
  const out: { start: Date; end: Date; minutes: number }[] = [];
  for (const s of canvas.sections) {
    if (s.end <= now) continue;
    if (s.kind === 'routine') continue;

    // A gap already under way starts "now", not at its nominal start.
    let pieces = [{ start: s.start > now ? s.start : now, end: s.end }];
    for (const item of s.items) {
      if (item.type !== 'event') continue;
      const busyStart = item.at;
      const busyEnd = item.end ?? new Date(item.at.getTime() + UNBOUNDED_EVENT_MS);
      const next: { start: Date; end: Date }[] = [];
      for (const p of pieces) {
        if (busyEnd <= p.start || busyStart >= p.end) {
          next.push(p);
          continue;
        }
        if (p.start < busyStart) next.push({ start: p.start, end: busyStart });
        if (busyEnd < p.end) next.push({ start: busyEnd, end: p.end });
      }
      pieces = next;
    }

    for (const p of pieces) {
      const ms = p.end.getTime() - p.start.getTime();
      if (ms < MIN_GAP_MS) continue;
      out.push({ start: p.start, end: p.end, minutes: Math.round(ms / 60_000) });
    }
  }
  return out.sort((a, b) => a.start.getTime() - b.start.getTime());
}
