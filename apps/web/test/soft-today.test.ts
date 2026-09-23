import { describe, expect, it } from 'vitest';
import type { TaskDTO, WorkoutTemplateDTO } from '@atlas/shared';
import type { EventDTO } from '@atlas/shared';
import {
  dayProgress,
  daySummary,
  dayTimeline,
  endOfToday,
  isEndOfDay,
  habitFill,
  suggestedTemplate,
  todaysPlan,
} from '@/lib/soft-today';

const NOW = new Date(2026, 6, 15, 14, 0); // Wed Jul 15 2026, 2pm local

const task = (over: Partial<TaskDTO>): TaskDTO =>
  ({
    id: over.id ?? `t${Math.random()}`,
    title: over.title ?? 'Task',
    notes: null,
    status: 'TODO',
    priority: 'MEDIUM',
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

const at = (dayOffset: number, h = 9) => new Date(2026, 6, 15 + dayOffset, h).toISOString();

describe('todaysPlan', () => {
  it('keeps a task due this morning on today, even after its time has passed', () => {
    const plan = todaysPlan([task({ title: 'Morning call', dueAt: at(0, 9) })], NOW);
    expect(plan.today.map((t) => t.title)).toEqual(['Morning call']);
    expect(plan.earlier).toEqual([]);
  });

  it('sorts today by due time, and splits out what was due before today', () => {
    const plan = todaysPlan(
      [
        task({ title: 'Evening', dueAt: at(0, 19) }),
        task({ title: 'Noon', dueAt: at(0, 12) }),
        task({ title: 'Yesterday', dueAt: at(-1, 17) }),
        task({ title: 'Tomorrow', dueAt: at(1, 9) }),
        task({ title: 'Someday' }),
      ],
      NOW,
    );
    expect(plan.today.map((t) => t.title)).toEqual(['Noon', 'Evening']);
    expect(plan.earlier.map((t) => t.title)).toEqual(['Yesterday']);
  });

  it('shows what was ticked off today, newest first, and nothing done before today', () => {
    const plan = todaysPlan(
      [
        task({ title: 'Done early', status: 'DONE', completedAt: at(0, 8) }),
        task({ title: 'Done just now', status: 'DONE', completedAt: at(0, 13) }),
        task({ title: 'Done yesterday', status: 'DONE', completedAt: at(-1, 13) }),
      ],
      NOW,
    );
    expect(plan.doneToday.map((t) => t.title)).toEqual(['Done just now', 'Done early']);
  });
});

describe('daySummary', () => {
  it('states counts, never a judgement', () => {
    expect(daySummary(2, 3, 4)).toBe('2 things on your plan and 3 habits to go.');
    expect(daySummary(1, 1, 1)).toBe('1 thing on your plan and 1 habit to go.');
    expect(daySummary(1, 0, 2)).toBe('1 thing on your plan and every habit done.');
  });

  it('has something kind to say about an empty or finished day', () => {
    expect(daySummary(0, 0, 0)).toBe('A clear day. Add something, or just enjoy it.');
    expect(daySummary(0, 0, 3)).toBe('Plan clear and every habit done. Lovely.');
    expect(daySummary(0, 2, 3)).toBe('Nothing planned — 2 habits to go.');
    expect(daySummary(3, 0, 0)).toBe('3 things on your plan today.');
  });
});

describe('habitFill', () => {
  it('is the share of the daily target met, capped at full', () => {
    expect(habitFill({ todayCount: 0, target: 8 })).toBe(0);
    expect(habitFill({ todayCount: 4, target: 8 })).toBe(0.5);
    expect(habitFill({ todayCount: 9, target: 8 })).toBe(1);
  });
});

describe('suggestedTemplate', () => {
  const tpl = (id: string, position: number, lastPerformedAt: string | null) =>
    ({ id, name: id, position, exercises: [], lastPerformedAt, createdAt: '' }) as WorkoutTemplateDTO;

  it('suggests a day never trained, then the one trained longest ago', () => {
    expect(
      suggestedTemplate([tpl('push', 0, '2026-07-14'), tpl('legs', 2, null), tpl('pull', 1, null)])
        ?.id,
    ).toBe('pull');
    expect(
      suggestedTemplate([tpl('push', 0, '2026-07-14'), tpl('pull', 1, '2026-07-12')])?.id,
    ).toBe('pull');
  });

  it('is null with nothing saved', () => {
    expect(suggestedTemplate([])).toBeNull();
  });
});

describe('endOfToday', () => {
  it('is 23:59 local on the same date', () => {
    const end = endOfToday(NOW);
    expect(end.getDate()).toBe(15);
    expect(end.getHours()).toBe(23);
    expect(end.getMinutes()).toBe(59);
  });
});

const event = (over: Partial<EventDTO>): EventDTO => ({
  id: over.id ?? `e${Math.random()}`,
  title: 'Event',
  description: null,
  location: null,
  startAt: at(0, 10),
  endAt: at(0, 11),
  allDay: false,
  source: 'atlas',
  recurrence: null,
  taskId: null,
  createdAt: NOW.toISOString(),
  ...over,
});

describe('dayProgress', () => {
  it('counts today’s tasks and habit targets, and leaves carried-over work out', () => {
    const plan = todaysPlan(
      [
        task({ title: 'old', dueAt: at(-3) }),
        task({ title: 'open', dueAt: at(0, 16) }),
        task({ title: 'done', status: 'DONE', dueAt: at(0, 9), completedAt: at(0, 10) }),
      ],
      NOW,
    );
    const p = dayProgress(plan, [
      { todayCount: 1, target: 1 },
      { todayCount: 1, target: 3 },
    ]);
    expect(p).toEqual({ done: 2, total: 4, fraction: 0.5 });
  });

  it('never reads an empty day as complete', () => {
    expect(dayProgress({ earlier: [], today: [], doneToday: [] }, [])).toEqual({
      done: 0,
      total: 0,
      fraction: 0,
    });
  });
});

describe('dayTimeline', () => {
  it('interleaves events and timed tasks in the order the day runs', () => {
    const plan = todaysPlan(
      [task({ id: 'call', title: 'Call', dueAt: at(0, 15) }), task({ id: 'any', title: 'Any', dueAt: endOfToday(NOW).toISOString() })],
      NOW,
    );
    const tl = dayTimeline(
      [
        event({ id: 'lunch', title: 'Lunch', startAt: at(0, 12), endAt: at(0, 13) }),
        event({ id: 'gym', title: 'Gym', startAt: at(0, 18), endAt: at(0, 19) }),
        event({ id: 'hol', title: 'Holiday', allDay: true }),
      ],
      plan,
      NOW,
    );
    expect(tl.timed.map((e) => e.id)).toEqual(['lunch', 'call', 'gym']);
    expect(tl.anytime.map((t) => t.id)).toEqual(['any']);
  });

  it('marks what is over, what is happening and what is ahead', () => {
    const tl = dayTimeline(
      [
        event({ id: 'a', startAt: at(0, 9), endAt: at(0, 10) }),
        event({ id: 'b', startAt: at(0, 13), endAt: at(0, 15) }),
        event({ id: 'c', startAt: at(0, 16), endAt: at(0, 17) }),
      ],
      { earlier: [], today: [], doneToday: [] },
      NOW,
    );
    expect(tl.timed.map((e) => e.state)).toEqual(['past', 'now', 'upcoming']);
  });

  it('knows 11:59 PM means "sometime today"', () => {
    expect(isEndOfDay(endOfToday(NOW))).toBe(true);
    expect(isEndOfDay(new Date(2026, 6, 15, 23, 30))).toBe(false);
  });
});
