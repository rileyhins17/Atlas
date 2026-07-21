import { describe, expect, it } from 'vitest';
import type { EventDTO, RoutineBlockDTO, TaskDTO, TimelineEventDTO } from '@atlas/shared';
import { buildDayCanvas, supposedTo, CANVAS_NOISE_TYPES, type DayCanvas } from '@/lib/canvas';

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
