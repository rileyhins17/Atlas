import { describe, expect, it } from 'vitest';
import type { EventDTO } from '@atlas/shared';
import {
  addDays,
  bucketByDay,
  combineLocal,
  countsByDay,
  dateFromDayKey,
  findOverlaps,
  formatDuration,
  isLive,
  minutesBetween,
  nextSlot,
  placeDayEvents,
  rangeLabel,
  startOfWeek,
  toTimeValue,
  visibleHourRange,
  weekDays,
} from '../lib/calendar-view';

function event(partial: Partial<EventDTO>): EventDTO {
  return {
    id: Math.random().toString(36).slice(2),
    title: 'e',
    description: null,
    location: null,
    startAt: new Date().toISOString(),
    endAt: new Date().toISOString(),
    allDay: false,
    source: 'atlas',
    recurrence: null,
    taskId: null,
    createdAt: new Date().toISOString(),
    ...partial,
  };
}

/** Sat 18 Jul 2026, noon local. Fixed so nothing depends on the run date. */
const NOW = new Date(2026, 6, 18, 12, 0, 0);

describe('startOfWeek / weekDays', () => {
  it('starts the week on Monday', () => {
    // 18 Jul 2026 is a Saturday; its Monday is the 13th.
    expect(startOfWeek(NOW).getDate()).toBe(13);
    expect(startOfWeek(NOW).getDay()).toBe(1);
  });

  it('treats Sunday as the end of its week, not the start', () => {
    const sunday = new Date(2026, 6, 19, 9, 0, 0);
    expect(startOfWeek(sunday).getDate()).toBe(13);
  });

  it('returns seven consecutive days', () => {
    const days = weekDays(NOW);
    expect(days).toHaveLength(7);
    expect(days.map((d) => d.getDate())).toEqual([13, 14, 15, 16, 17, 18, 19]);
  });

  it('crosses a month boundary correctly', () => {
    const days = weekDays(new Date(2026, 6, 30));
    expect(days.map((d) => d.getDate())).toEqual([27, 28, 29, 30, 31, 1, 2]);
  });
});

describe('bucketByDay', () => {
  it('keeps past days instead of dropping them', () => {
    const yesterday = new Date(NOW.getTime() - 86_400_000);
    const buckets = bucketByDay([
      event({ title: 'past', startAt: yesterday.toISOString() }),
      event({ title: 'today', startAt: NOW.toISOString() }),
    ]);
    expect(buckets.map((b) => b.events[0]!.title)).toEqual(['past', 'today']);
  });

  it('sorts events inside a day by start time', () => {
    const later = new Date(NOW.getTime() + 3 * 3600e3);
    const buckets = bucketByDay([
      event({ title: 'second', startAt: later.toISOString() }),
      event({ title: 'first', startAt: NOW.toISOString() }),
    ]);
    expect(buckets[0]!.events.map((e) => e.title)).toEqual(['first', 'second']);
  });

  it('honours an inclusive from/to window', () => {
    const before = new Date(2026, 6, 10, 9);
    const inside = new Date(2026, 6, 15, 9);
    const after = new Date(2026, 6, 25, 9);
    const buckets = bucketByDay(
      [
        event({ title: 'before', startAt: before.toISOString() }),
        event({ title: 'inside', startAt: inside.toISOString() }),
        event({ title: 'after', startAt: after.toISOString() }),
      ],
      new Date(2026, 6, 13),
      new Date(2026, 6, 19),
    );
    expect(buckets.map((b) => b.events[0]!.title)).toEqual(['inside']);
  });

  it('includes an event starting on the last day of the window', () => {
    // Late in the day, to catch an exclusive-end off-by-one.
    const edge = new Date(2026, 6, 19, 23, 30);
    const buckets = bucketByDay(
      [event({ title: 'edge', startAt: edge.toISOString() })],
      new Date(2026, 6, 13),
      new Date(2026, 6, 19),
    );
    expect(buckets).toHaveLength(1);
  });
});

describe('countsByDay', () => {
  it('counts per local day', () => {
    const counts = countsByDay([
      event({ startAt: new Date(2026, 6, 18, 9).toISOString() }),
      event({ startAt: new Date(2026, 6, 18, 14).toISOString() }),
      event({ startAt: new Date(2026, 6, 19, 9).toISOString() }),
    ]);
    expect(counts.get('2026-07-18')).toBe(2);
    expect(counts.get('2026-07-19')).toBe(1);
  });
});

describe('nextSlot', () => {
  it('rounds up to the next half hour', () => {
    expect(toTimeValue(nextSlot(new Date(2026, 6, 18, 14, 12)))).toBe('14:30');
    expect(toTimeValue(nextSlot(new Date(2026, 6, 18, 14, 47)))).toBe('15:00');
  });

  it('leaves an exact boundary alone', () => {
    expect(toTimeValue(nextSlot(new Date(2026, 6, 18, 14, 0)))).toBe('14:00');
  });

  it('rolls into the next day near midnight', () => {
    const slot = nextSlot(new Date(2026, 6, 18, 23, 45));
    expect(slot.getDate()).toBe(19);
    expect(toTimeValue(slot)).toBe('00:00');
  });
});

describe('combineLocal / dateFromDayKey', () => {
  it('builds a local date, not a UTC one', () => {
    const d = combineLocal('2026-07-18', '14:30');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(6);
    expect(d.getDate()).toBe(18);
    expect(d.getHours()).toBe(14);
    expect(d.getMinutes()).toBe(30);
  });

  it('keeps the calendar date across a DST boundary', () => {
    // Noon anchoring means a -1h shift cannot move this to the 7th.
    expect(dateFromDayKey('2026-03-08').getDate()).toBe(8);
    expect(dateFromDayKey('2026-11-01').getDate()).toBe(1);
  });
});

describe('formatDuration', () => {
  it('formats minutes, hours and mixed', () => {
    expect(formatDuration(45)).toBe('45m');
    expect(formatDuration(60)).toBe('1h');
    expect(formatDuration(90)).toBe('1h 30m');
    expect(formatDuration(120)).toBe('2h');
    expect(formatDuration(1440)).toBe('1d');
    expect(formatDuration(0)).toBe('0m');
  });
});

describe('minutesBetween', () => {
  it('measures forward span in whole minutes', () => {
    expect(minutesBetween(new Date(2026, 6, 18, 9), new Date(2026, 6, 18, 10, 30))).toBe(90);
  });
});

describe('findOverlaps', () => {
  const nine = new Date(2026, 6, 18, 9);
  const ten = new Date(2026, 6, 18, 10);
  const standup = event({
    id: 'standup',
    title: 'Standup',
    startAt: nine.toISOString(),
    endAt: ten.toISOString(),
  });

  it('finds a clash', () => {
    const hits = findOverlaps([standup], new Date(2026, 6, 18, 9, 30), new Date(2026, 6, 18, 10, 30));
    expect(hits.map((h) => h.title)).toEqual(['Standup']);
  });

  it('treats back-to-back as no clash', () => {
    expect(findOverlaps([standup], ten, new Date(2026, 6, 18, 11))).toEqual([]);
    expect(findOverlaps([standup], new Date(2026, 6, 18, 8), nine)).toEqual([]);
  });

  it('ignores the event being edited', () => {
    expect(findOverlaps([standup], nine, ten, 'standup')).toEqual([]);
  });

  it('ignores all-day events', () => {
    const holiday = event({ allDay: true, startAt: nine.toISOString(), endAt: ten.toISOString() });
    expect(findOverlaps([holiday], nine, ten)).toEqual([]);
  });
});

describe('isLive', () => {
  it('is true only inside the event', () => {
    const e = event({
      startAt: new Date(2026, 6, 18, 11).toISOString(),
      endAt: new Date(2026, 6, 18, 13).toISOString(),
    });
    expect(isLive(e, NOW)).toBe(true);
    expect(isLive(e, new Date(2026, 6, 18, 13, 1))).toBe(false);
    expect(isLive(e, new Date(2026, 6, 18, 10, 59))).toBe(false);
  });

  it('is exclusive at the end instant', () => {
    const e = event({
      startAt: new Date(2026, 6, 18, 11).toISOString(),
      endAt: new Date(2026, 6, 18, 12).toISOString(),
    });
    // This is the "sleep 4:11am–11am still says next at 4:11am" class of bug.
    expect(isLive(e, new Date(2026, 6, 18, 12))).toBe(false);
    expect(isLive(e, new Date(2026, 6, 18, 11, 59))).toBe(true);
  });
});

describe('rangeLabel', () => {
  it('names a single month', () => {
    expect(rangeLabel(weekDays(NOW))).toMatch(/July.*2026/);
  });

  it('shows both months when the week straddles them', () => {
    expect(rangeLabel(weekDays(new Date(2026, 6, 30)))).toMatch(/Jul.*Aug/);
  });

  it('survives an empty list', () => {
    expect(rangeLabel([])).toBe('');
  });
});

describe('addDays', () => {
  it('crosses month and year boundaries', () => {
    expect(addDays(new Date(2026, 11, 31), 1).getFullYear()).toBe(2027);
    expect(addDays(new Date(2026, 6, 31), 1).getMonth()).toBe(7);
  });
});

/** An event on the fixed test day, from local hh:mm to hh:mm. */
function at(startH: number, startM: number, endH: number, endM: number, title = 'e'): EventDTO {
  return event({
    title,
    startAt: new Date(2026, 6, 18, startH, startM).toISOString(),
    endAt: new Date(2026, 6, 18, endH, endM).toISOString(),
  });
}

describe('visibleHourRange', () => {
  it('uses the working-hours default when there is nothing to show', () => {
    expect(visibleHourRange([])).toEqual({ startHour: 7, endHour: 23 });
  });

  it('opens early for an early event and late for a late one', () => {
    expect(visibleHourRange([at(5, 30, 6, 30)]).startHour).toBe(5);
    expect(visibleHourRange([at(23, 0, 23, 59)]).endHour).toBe(24);
  });

  it('does not add a dead row for an event ending exactly on the hour', () => {
    // 17:00–18:00 needs the 18:00 line and nothing beyond it.
    expect(visibleHourRange([at(17, 0, 18, 0)]).endHour).toBe(23);
    expect(visibleHourRange([at(17, 0, 23, 0)]).endHour).toBe(23);
    expect(visibleHourRange([at(17, 0, 23, 1)]).endHour).toBe(24);
  });

  it('never returns a window too short to read as a day', () => {
    const w = visibleHourRange([]);
    expect(w.endHour - w.startHour).toBeGreaterThanOrEqual(8);
  });

  it('ignores all-day events, which have no place on the grid', () => {
    const allDay = event({
      allDay: true,
      startAt: new Date(2026, 6, 18, 0, 0).toISOString(),
      endAt: new Date(2026, 6, 18, 23, 59).toISOString(),
    });
    expect(visibleHourRange([allDay])).toEqual({ startHour: 7, endHour: 23 });
  });
});

describe('placeDayEvents', () => {
  const day = new Date(2026, 6, 18);
  const window = { startHour: 8, endHour: 20 } as const;

  it('positions an event as a fraction of the window', () => {
    // 12:00–14:00 in an 8:00–20:00 window: a third down, a sixth tall.
    const [p] = placeDayEvents([at(12, 0, 14, 0)], day, window);
    expect(p!.top).toBeCloseTo(1 / 3, 5);
    expect(p!.height).toBeCloseTo(1 / 6, 5);
    expect(p!.cols).toBe(1);
  });

  it('splits two clashing events into side-by-side columns', () => {
    const placed = placeDayEvents([at(9, 0, 11, 0, 'a'), at(10, 0, 12, 0, 'b')], day, window);
    expect(placed.map((p) => p.cols)).toEqual([2, 2]);
    expect(placed.map((p) => p.col).sort()).toEqual([0, 1]);
  });

  it('leaves a later, unrelated event at full width', () => {
    const placed = placeDayEvents(
      [at(9, 0, 11, 0, 'a'), at(10, 0, 12, 0, 'b'), at(15, 0, 16, 0, 'solo')],
      day,
      window,
    );
    expect(placed.find((p) => p.event.title === 'solo')!.cols).toBe(1);
  });

  it('clusters transitively, but still recycles a freed column', () => {
    // A 9–10, B 9:30–11, C 10:30–11:30. A and C never touch, but B bridges
    // them, so all three belong to one cluster and share a single width.
    // That width is TWO, not three: by the time C starts, A has finished and
    // its column is free — widening to a third would waste a third of the day
    // on nothing, and C never collides with A on screen.
    const placed = placeDayEvents(
      [at(9, 0, 10, 0, 'a'), at(9, 30, 11, 0, 'b'), at(10, 30, 11, 30, 'c')],
      day,
      window,
    );
    expect(placed.every((p) => p.cols === 2)).toBe(true);
    const col = (t: string) => placed.find((p) => p.event.title === t)!.col;
    expect(col('a')).toBe(0);
    expect(col('b')).toBe(1);
    expect(col('c')).toBe(0);
  });

  it('reuses a column once its event has finished', () => {
    // Back-to-back in the same slot is not a clash.
    const placed = placeDayEvents([at(9, 0, 10, 0, 'a'), at(10, 0, 11, 0, 'b')], day, window);
    expect(placed.every((p) => p.cols === 1)).toBe(true);
  });

  it('gives a zero-length event a readable minimum height', () => {
    const [p] = placeDayEvents([at(12, 0, 12, 0)], day, window);
    expect(p!.height).toBeGreaterThan(0);
  });

  it('clamps an event that starts before the window instead of dropping it', () => {
    const [p] = placeDayEvents([at(6, 0, 9, 0)], day, window);
    expect(p!.top).toBe(0);
    expect(p!.height).toBeGreaterThan(0);
  });

  it('omits an event that lies entirely outside the window', () => {
    expect(placeDayEvents([at(5, 0, 6, 0)], day, window)).toEqual([]);
  });

  it('only places events belonging to the day asked for', () => {
    const other = event({
      startAt: new Date(2026, 6, 19, 12, 0).toISOString(),
      endAt: new Date(2026, 6, 19, 13, 0).toISOString(),
    });
    expect(placeDayEvents([other], day, window)).toEqual([]);
  });

  it('clips an event running past midnight to the end of its own day', () => {
    const overnight = event({
      startAt: new Date(2026, 6, 18, 22, 0).toISOString(),
      endAt: new Date(2026, 6, 19, 2, 0).toISOString(),
    });
    const [p] = placeDayEvents([overnight], day, { startHour: 0, endHour: 24 });
    expect(p!.top + p!.height).toBeCloseTo(1, 5);
  });
});
