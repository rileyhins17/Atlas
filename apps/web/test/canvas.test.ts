import { describe, expect, it } from 'vitest';
import type { EventDTO, RoutineBlockDTO, TaskDTO, TimelineEventDTO } from '@atlas/shared';
import { buildDayCanvas, buildDayOverview, supposedTo, CANVAS_NOISE_TYPES, type DayCanvas } from '@/lib/canvas';
import { localDayKey } from '@/lib/dates';

/**
 * The Day Canvas engine is the heart of Atlas v4 — these tests pin its whole
 * contract with fixed local dates (Wed Jul 15 2026).
 */

const DAILY = 0b1111111;
const WEEKDAYS = 0b0011111;
const FRI = 1 << 4;

const at = (h: number, m = 0, dayOffset = 0) => new Date(2026, 6, 15 + dayOffset, h, m);
const NOW = at(14, 30); // Wed 2:30 PM

const block = (over: Partial<RoutineBlockDTO>): RoutineBlockDTO => ({
  id: over.id ?? `b${Math.random()}`,
  label: over.label ?? 'Block',
  kind: over.kind ?? 'custom',
  days: over.days ?? DAILY,
  onDate: over.onDate ?? null,
  startMin: over.startMin ?? 0,
  endMin: over.endMin ?? 60,
  ...over,
});

const event = (over: Partial<EventDTO> & { startAt: string; endAt: string }): EventDTO =>
  ({
    id: over.id ?? `e${Math.random()}`,
    title: over.title ?? 'Event',
    description: null,
    location: over.location ?? null,
    allDay: over.allDay ?? false,
    source: 'atlas',
    createdAt: NOW.toISOString(),
    ...over,
  }) as EventDTO;

const task = (over: Partial<TaskDTO>): TaskDTO =>
  ({
    id: over.id ?? `t${Math.random()}`,
    title: over.title ?? 'Task',
    notes: null,
    status: 'OPEN',
    priority: 'NONE',
    dueAt: null,
    completedAt: null,
    tags: [],
    goalId: null,
    recurrence: null,
    recurrenceParentId: null,
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    ...over,
  }) as TaskDTO;

const row = (over: Partial<TimelineEventDTO>): TimelineEventDTO => ({
  id: over.id ?? `r${Math.random()}`,
  type: over.type ?? 'habit.checked',
  source: over.source ?? 'habits',
  title: over.title ?? 'Row',
  summary: null,
  refType: over.refType ?? null,
  refId: over.refId ?? null,
  occurredAt: over.occurredAt ?? NOW.toISOString(),
  ...over,
});

/** The standard fixture week: sleep 23–7, breakfast 7:15–7:45, work 9–17 M–F. */
const ROUTINE = [
  block({ id: 'sleep', label: 'Sleep', kind: 'sleep', startMin: 23 * 60, endMin: 7 * 60 }),
  block({ id: 'bfast', label: 'Breakfast', kind: 'meal', startMin: 7 * 60 + 15, endMin: 7 * 60 + 45 }),
  block({ id: 'work', label: 'Work', kind: 'work', days: WEEKDAYS, startMin: 9 * 60, endMin: 17 * 60 }),
];

const shape = (c: DayCanvas) => c.sections.map((s) => `${s.label} ${fmt(s.start)}-${fmt(s.end)}`);
const fmt = (d: Date) => `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;

describe('section skeleton', () => {
  it('covers the entire day: routine backbone + Open gaps, in order', () => {
    const c = buildDayCanvas(at(12), ROUTINE, [], [], [], NOW);
    expect(shape(c)).toEqual([
      'Sleep 0:00-7:00', // morning tail of the overnight block
      'Open 7:00-7:15',
      'Breakfast 7:15-7:45',
      'Open 7:45-9:00',
      'Work 9:00-17:00',
      'Open 17:00-23:00',
      'Sleep 23:00-0:00', // night head
    ]);
    // Full coverage, no holes: each section starts where the previous ended.
    for (let i = 1; i < c.sections.length; i++) {
      expect(c.sections[i]!.start.getTime()).toBe(c.sections[i - 1]!.end.getTime());
    }
  });

  it('suppresses sub-5-minute slivers between blocks', () => {
    const tight = [
      block({ label: 'A', startMin: 600, endMin: 660 }),
      block({ label: 'B', startMin: 663, endMin: 720 }), // 3-min gap
    ];
    const c = buildDayCanvas(at(12), tight, [], [], [], NOW);
    expect(shape(c)).toEqual(['Open 0:00-10:00', 'A 10:00-11:00', 'B 11:03-12:00', 'Open 12:00-0:00']);
  });

  it('weekday-masked work is absent on Saturday; overnight tail follows yesterday mask', () => {
    // Saturday Jul 18. Work (M–F) gone; Friday-only sleep still gives a Sat morning tail.
    const friSleep = block({ label: 'FriSleep', kind: 'sleep', days: FRI, startMin: 23 * 60, endMin: 7 * 60 });
    const c = buildDayCanvas(at(12, 0, 3), [friSleep, ROUTINE[2]!], [], [], [], NOW);
    expect(shape(c)).toEqual(['FriSleep 0:00-7:00', 'Open 7:00-0:00']);
  });

  it('resolves overlaps deterministically: earlier start wins, later clamps or drops', () => {
    const overlapping = [
      block({ label: 'Long', startMin: 9 * 60, endMin: 12 * 60 }),
      block({ label: 'Inside', startMin: 10 * 60, endMin: 11 * 60 }), // swallowed → dropped
      block({ label: 'Tail', startMin: 11 * 60, endMin: 13 * 60 }), // clamped to 12:00
    ];
    const c = buildDayCanvas(at(12), overlapping, [], [], [], NOW);
    expect(shape(c)).toEqual(['Open 0:00-9:00', 'Long 9:00-12:00', 'Tail 12:00-13:00', 'Open 13:00-0:00']);
  });

  it('no routine at all → one full-day Open section (canvas still works)', () => {
    const c = buildDayCanvas(at(12), [], [], [], [], NOW);
    expect(shape(c)).toEqual(['Open 0:00-0:00']);
  });
});

describe('item placement', () => {
  it('places events/tasks/actuals into the section containing their moment, sorted', () => {
    const c = buildDayCanvas(
      at(12),
      ROUTINE,
      [event({ id: 'standup', title: 'Standup', startAt: at(9, 30).toISOString(), endAt: at(10).toISOString() })],
      [task({ id: 'ship', title: 'Ship it', dueAt: at(16).toISOString() })],
      [row({ id: 'gym', title: 'Checked in: Gym', occurredAt: at(12, 15).toISOString() })],
      NOW,
    );
    const work = c.sections.find((s) => s.label === 'Work')!;
    expect(work.items.map((i) => i.type)).toEqual(['event', 'actual', 'task']); // 9:30, 12:15, 16:00
  });

  it('all-day events go to the header lane, not a time slot', () => {
    const c = buildDayCanvas(
      at(12),
      ROUTINE,
      [event({ title: 'Trip', allDay: true, startAt: at(0).toISOString(), endAt: at(23, 59).toISOString() })],
      [],
      [],
      NOW,
    );
    expect(c.allDay.map((i) => (i.type === 'event' ? i.title : i.type))).toEqual(['Trip']);
    expect(c.sections.every((s) => s.items.length === 0)).toBe(true);
  });

  it('skips done tasks, undated tasks, other-day items, and CRUD-noise rows', () => {
    const c = buildDayCanvas(
      at(12),
      ROUTINE,
      [event({ title: 'Tomorrow', startAt: at(10, 0, 1).toISOString(), endAt: at(11, 0, 1).toISOString() })],
      [
        task({ title: 'Done', dueAt: at(10).toISOString(), status: 'DONE' }),
        task({ title: 'Undated' }),
      ],
      [row({ type: 'task.created', title: 'noise', occurredAt: at(10).toISOString() })],
      NOW,
    );
    expect(c.sections.every((s) => s.items.length === 0)).toBe(true);
    expect(CANVAS_NOISE_TYPES.has('task.created')).toBe(true);
  });
});

describe('buildDayOverview', () => {
  const canvasAt = (nowTime: Date) =>
    buildDayCanvas(
      at(12),
      ROUTINE,
      [
        event({ id: 'past', title: 'Standup', startAt: at(9).toISOString(), endAt: at(9, 30).toISOString() }),
        event({ id: 'live', title: 'Workshop', startAt: at(14).toISOString(), endAt: at(16).toISOString() }),
        event({ id: 'later', title: 'Dinner out', startAt: at(19).toISOString(), endAt: at(20).toISOString() }),
      ],
      [task({ id: 'due', title: 'Ship it', dueAt: at(21).toISOString() })],
      [row({ id: 'gym', title: 'Checked in: Gym', occurredAt: at(8).toISOString() })],
      nowTime,
    );

  it('splits the day into what is still ahead and what already happened', () => {
    const o = buildDayOverview(canvasAt(at(14, 30)), at(14, 30)); // mid-Workshop
    expect(o.ahead.map((i) => (i.type === 'event' ? i.title : 'task'))).toEqual([
      'Workshop', // live events stay ahead until they end
      'Dinner out',
      'task',
    ]);
    // Earlier is newest-first and holds the finished event + the actual.
    expect(o.earlier.map((i) => (i.type === 'event' ? i.title : i.type))).toEqual([
      'Standup',
      'actual',
    ]);
  });

  it('surfaces the current routine block, the live item, and the next thing up', () => {
    const o = buildDayOverview(canvasAt(at(14, 30)), at(14, 30));
    expect(o.now).toMatchObject({ label: 'Work' });
    expect(o.now!.until.getHours()).toBe(17);
    // 2:30 PM is INSIDE the Workshop, so it is what's happening, not what's
    // next — this expectation used to read `next: 'Workshop'`, which is exactly
    // the "it says Next for something already running" bug.
    expect(o.current && o.current.type === 'event' ? o.current.title : null).toBe('Workshop');
    expect(o.next && o.next.type === 'event' ? o.next.title : null).toBe('Dinner out');
  });

  it('reports nothing ahead once the day is done', () => {
    const o = buildDayOverview(canvasAt(at(23, 30)), at(23, 30));
    expect(o.ahead).toEqual([]);
    expect(o.next).toBeNull();
    expect(o.earlier.length).toBe(5); // 3 events + 1 task + 1 actual
  });

  it('has no now-block when the clock sits in an Open gap', () => {
    const o = buildDayOverview(canvasAt(at(8)), at(8)); // 7:45–9:00 is Open
    expect(o.now).toBeNull();
  });

  it('splits what is ahead into things you tick off vs things you show up to', () => {
    const o = buildDayOverview(canvasAt(at(14, 30)), at(14, 30));
    // Tasks are the checklist; events are the schedule. Together they are `ahead`.
    expect(o.checklist.every((i) => i.type === 'task')).toBe(true);
    expect(o.checklist.map((i) => (i.type === 'task' ? i.title : ''))).toEqual(['Ship it']);
    expect(o.timed.map((i) => (i.type === 'event' ? i.title : ''))).toEqual([
      'Workshop',
      'Dinner out',
    ]);
    expect(o.checklist.length + o.timed.length).toBe(o.ahead.length);
  });

  it('keeps both split lists empty once the day is done', () => {
    const o = buildDayOverview(canvasAt(at(23, 30)), at(23, 30));
    expect(o.checklist).toEqual([]);
    expect(o.timed).toEqual([]);
  });
});

describe('now + flavor', () => {
  it('today: marks the current section and computes the now-line insertion index', () => {
    const c = buildDayCanvas(
      at(12),
      ROUTINE,
      [event({ title: 'Morning', startAt: at(9, 30).toISOString(), endAt: at(10).toISOString() })],
      [task({ title: 'Later', dueAt: at(16).toISOString() })],
      [],
      NOW, // 14:30 → inside Work
    );
    expect(c.flavor).toBe('today');
    const work = c.sections.find((s) => s.isNow)!;
    expect(work.label).toBe('Work');
    expect(work.nowIndex).toBe(1); // after the 9:30 event, before the 16:00 task
  });

  it('past and future days carry no now-line', () => {
    const past = buildDayCanvas(at(12, 0, -1), ROUTINE, [], [], [], NOW);
    const future = buildDayCanvas(at(12, 0, 1), ROUTINE, [], [], [], NOW);
    expect(past.flavor).toBe('past');
    expect(future.flavor).toBe('future');
    expect([...past.sections, ...future.sections].some((s) => s.isNow)).toBe(false);
  });

  it('supposedTo reads the current routine section; null in an Open gap', () => {
    expect(supposedTo(buildDayCanvas(at(12), ROUTINE, [], [], [], NOW))).toMatchObject({
      label: 'Work',
    });
    const evening = buildDayCanvas(at(12), ROUTINE, [], [], [], at(18)); // 18:00 → Open
    expect(supposedTo(evening)).toBeNull();
  });
});

describe('date-specific routine blocks (shift work)', () => {
  const DAY = '2026-07-15'; // the Wednesday these tests run on

  it('a dated block REPLACES the weekly pattern for that day', () => {
    // Usual week says 9–5. This Wednesday the shift is 7–3.
    const canvas = buildDayCanvas(
      at(12),
      [
        block({ label: 'Work', kind: 'work', days: WEEKDAYS, startMin: 540, endMin: 1020 }),
        block({ label: 'Shift', kind: 'work', onDate: DAY, startMin: 420, endMin: 900 }),
      ],
      [],
      [],
      [],
      at(12),
    );
    const work = canvas.sections.filter((s) => s.kind === 'routine');
    expect(work).toHaveLength(1);
    expect(work[0]!.label).toBe('Shift');
    expect(work[0]!.start.getHours()).toBe(7);
    expect(work[0]!.end.getHours()).toBe(15);
  });

  it('leaves other days on the weekly pattern', () => {
    const canvas = buildDayCanvas(
      at(12, 0, 1), // Thursday
      [
        block({ label: 'Work', kind: 'work', days: WEEKDAYS, startMin: 540, endMin: 1020 }),
        block({ label: 'Shift', kind: 'work', onDate: DAY, startMin: 420, endMin: 900 }),
      ],
      [],
      [],
      [],
      at(12, 0, 1),
    );
    const work = canvas.sections.filter((s) => s.kind === 'routine');
    expect(work.map((w) => w.label)).toEqual(['Work']);
  });
});

describe("'off' clears the routine rather than adding to it", () => {
  const DAY = '2026-07-15';

  it('a full-day off wipes the usual work block', () => {
    const canvas = buildDayCanvas(
      at(12),
      [
        block({ label: 'Work', kind: 'work', days: WEEKDAYS, startMin: 540, endMin: 1020 }),
        block({ label: 'Day off', kind: 'off', onDate: DAY, startMin: 0, endMin: 1439 }),
      ],
      [],
      [],
      [],
      at(12),
    );
    expect(canvas.sections.every((s) => s.kind === 'open')).toBe(true);
  });

  it('a partial off splits the block around it, keeping both sides', () => {
    // Work 9–17, off 12–13 → 9–12 and 13–17 survive.
    const canvas = buildDayCanvas(
      at(12),
      [
        block({ label: 'Work', kind: 'work', days: WEEKDAYS, startMin: 540, endMin: 1020 }),
        block({ label: 'Appointment', kind: 'off', onDate: DAY, startMin: 720, endMin: 780 }),
      ],
      [],
      [],
      [],
      at(12),
    );
    const work = canvas.sections.filter((s) => s.kind === 'routine');
    expect(work).toHaveLength(2);
    expect([work[0]!.start.getHours(), work[0]!.end.getHours()]).toEqual([9, 12]);
    expect([work[1]!.start.getHours(), work[1]!.end.getHours()]).toEqual([13, 17]);
    // And the carved-out hour is offered as free time.
    expect(canvas.sections.some((s) => s.kind === 'open' && s.start.getHours() === 12)).toBe(true);
  });
});

describe('overview: current vs next', () => {
  it('an event already under way is CURRENT, not next', () => {
    // The reported bug: sleep booked 4:11 → 11:00, read at 4:13 as "Next 4:11".
    const canvas = buildDayCanvas(
      at(4, 13),
      [],
      [
        event({
          title: 'Sleep',
          startAt: at(4, 11).toISOString(),
          endAt: at(11, 0).toISOString(),
        }),
      ],
      [],
      [],
      at(4, 13),
    );
    const o = buildDayOverview(canvas, at(4, 13));
    expect(o.current && o.current.type === 'event' ? o.current.title : null).toBe('Sleep');
    // It must NOT also be announced as the next thing.
    expect(o.next && o.next.type === 'event' ? o.next.title : null).not.toBe('Sleep');
  });

  it('an event that has not started yet is next, and nothing is current', () => {
    const canvas = buildDayCanvas(
      at(9),
      [],
      [event({ title: 'Standup', startAt: at(10).toISOString(), endAt: at(10, 30).toISOString() })],
      [],
      [],
      at(9),
    );
    const o = buildDayOverview(canvas, at(9));
    expect(o.current).toBeNull();
    expect(o.next && o.next.type === 'event' ? o.next.title : null).toBe('Standup');
  });

  it('an event that already ended is neither current nor next', () => {
    const canvas = buildDayCanvas(
      at(12),
      [],
      [event({ title: 'Standup', startAt: at(10).toISOString(), endAt: at(10, 30).toISOString() })],
      [],
      [],
      at(12),
    );
    const o = buildDayOverview(canvas, at(12));
    expect(o.current).toBeNull();
    expect(o.next).toBeNull();
    expect(o.earlier.some((i) => i.type === 'event' && i.title === 'Standup')).toBe(true);
  });
});

describe('overview: free-time gaps', () => {
  const workDay = [
    block({ label: 'Sleep', kind: 'sleep', days: DAILY, startMin: 1380, endMin: 420 }),
    block({ label: 'Work', kind: 'work', days: WEEKDAYS, startMin: 540, endMin: 1020 }),
  ];

  it('offers the window between work ending and wind-down', () => {
    const o = buildDayOverview(
      buildDayCanvas(at(18), workDay, [], [], [], at(18)),
      at(18),
    );
    // Work ends 17:00, sleep starts 23:00 → 17:00–23:00 free, already under way.
    expect(o.gaps).toHaveLength(1);
    expect(o.gaps[0]!.start.getHours()).toBe(18); // clipped to now, not 17
    expect(o.gaps[0]!.end.getHours()).toBe(23);
  });

  it('never offers work hours as free time — the whole point', () => {
    const o = buildDayOverview(buildDayCanvas(at(10), workDay, [], [], [], at(10)), at(10));
    const insideWork = o.gaps.some((g) => g.start.getHours() >= 9 && g.start.getHours() < 17);
    expect(insideWork).toBe(false);
  });

  it('never offers sleep as free time', () => {
    const o = buildDayOverview(buildDayCanvas(at(23, 30), workDay, [], [], [], at(23, 30)), at(23, 30));
    expect(o.gaps).toHaveLength(0);
  });

  it('subtracts an event from its window instead of writing the window off', () => {
    // 17:00–23:00 is free; dinner claims 19:00–21:00. What is left is the two
    // sides of it, not nothing — one event must never swallow a whole evening.
    const canvas = buildDayCanvas(
      at(18),
      workDay,
      [event({ title: 'Dinner out', startAt: at(19).toISOString(), endAt: at(21).toISOString() })],
      [],
      [],
      at(18),
    );
    const { gaps } = buildDayOverview(canvas, at(18));
    expect(gaps.map((g) => `${fmt(g.start)}-${fmt(g.end)}`)).toEqual(['18:00-19:00', '21:00-23:00']);
  });

  it('offers nothing when an event covers the rest of the window', () => {
    const canvas = buildDayCanvas(
      at(18),
      workDay,
      [event({ title: 'Long dinner', startAt: at(17).toISOString(), endAt: at(23).toISOString() })],
      [],
      [],
      at(18),
    );
    expect(buildDayOverview(canvas, at(18)).gaps).toHaveLength(0);
  });

  it('treats an event with no end time as claiming half an hour', () => {
    // The schema types endAt as required, but the canvas tolerates a blank one
    // arriving off the wire — that is the only way `end` is ever null.
    const canvas = buildDayCanvas(
      at(18),
      workDay,
      [event({ title: 'Call', startAt: at(19).toISOString(), endAt: '' })],
      [],
      [],
      at(18),
    );
    const { gaps } = buildDayOverview(canvas, at(18));
    expect(gaps.map((g) => `${fmt(g.start)}-${fmt(g.end)}`)).toEqual(['18:00-19:00', '19:30-23:00']);
  });

  it('drops the leftover slice when subtracting an event leaves only a sliver', () => {
    // 18:00–18:10 survives the subtraction but is too short to plan into.
    const canvas = buildDayCanvas(
      at(18),
      workDay,
      [event({ title: 'Dinner out', startAt: at(18, 10).toISOString(), endAt: at(23).toISOString() })],
      [],
      [],
      at(18),
    );
    expect(buildDayOverview(canvas, at(18)).gaps).toHaveLength(0);
  });

  it('a day off carves the routine out and the whole day becomes plannable', () => {
    // The exact shape the routine editor's "I am off today" button writes.
    const dayOff = [
      ...workDay,
      block({
        label: 'Day off',
        kind: 'off',
        days: DAILY,
        onDate: localDayKey(at(12)),
        startMin: 0,
        endMin: 1439,
      }),
    ];
    const { gaps } = buildDayOverview(
      buildDayCanvas(at(12), dayOff, [], [], [], at(12)),
      at(12),
    );
    expect(gaps).toHaveLength(1);
    expect(fmt(gaps[0]!.start)).toBe('12:00');
    expect(gaps[0]!.minutes).toBeGreaterThan(11 * 60);
  });

  it('ignores slivers too short to plan into', () => {
    const packed = [
      block({ label: 'Work', kind: 'work', days: DAILY, startMin: 540, endMin: 1020 }),
      block({ label: 'Gym', kind: 'exercise', days: DAILY, startMin: 1030, endMin: 1140 }),
    ];
    // The 10-minute 17:00–17:10 gap must not be offered.
    const o = buildDayOverview(buildDayCanvas(at(17), packed, [], [], [], at(17)), at(17));
    expect(o.gaps.some((g) => g.minutes < 20)).toBe(false);
  });
});
