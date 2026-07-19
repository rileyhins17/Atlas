import { describe, expect, it } from 'vitest';
import type { EventDTO, TaskDTO } from '@atlas/shared';
import { groupTasks } from '../components/panels/TasksPanel';
import { groupEventsByDay } from '../components/panels/CalendarPanel';
import { weekCells } from '../components/panels/HabitsPanel';
import { localDayKey } from '../lib/dates';

const NOW = new Date(2026, 6, 18, 12, 0, 0); // Sat Jul 18, noon local

function task(partial: Partial<TaskDTO>): TaskDTO {
  return {
    id: Math.random().toString(36).slice(2),
    title: 't',
    notes: null,
    status: 'TODO' as TaskDTO['status'],
    priority: 'MEDIUM' as TaskDTO['priority'],
    dueAt: null,
    completedAt: null,
    tags: [],
    goalId: null,
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    ...partial,
  };
}

describe('groupTasks', () => {
  it('buckets by due horizon and hides empty groups', () => {
    const { groups, done } = groupTasks(
      [
        task({ title: 'overdue', dueAt: new Date(2026, 6, 16).toISOString() }),
        task({ title: 'today', dueAt: new Date(2026, 6, 18, 18).toISOString() }),
        task({ title: 'week', dueAt: new Date(2026, 6, 21).toISOString() }),
        task({ title: 'later', dueAt: new Date(2026, 7, 20).toISOString() }),
        task({ title: 'someday' }),
        task({ title: 'finished', status: 'DONE' as TaskDTO['status'] }),
      ],
      NOW,
    );
    expect(groups.map((g) => g.key)).toEqual(['overdue', 'today', 'week', 'later', 'someday']);
    expect(groups.map((g) => g.tasks[0].title)).toEqual([
      'overdue',
      'today',
      'week',
      'later',
      'someday',
    ]);
    expect(done.map((t) => t.title)).toEqual(['finished']);
  });

  it('sorts within a bucket by due time then priority', () => {
    const sameDue = new Date(2026, 6, 18, 20).toISOString();
    const { groups } = groupTasks(
      [
        task({ title: 'b-low', dueAt: sameDue, priority: 'LOW' as TaskDTO['priority'] }),
        task({ title: 'a-urgent', dueAt: sameDue, priority: 'URGENT' as TaskDTO['priority'] }),
        task({ title: 'earlier', dueAt: new Date(2026, 6, 18, 13).toISOString() }),
      ],
      NOW,
    );
    expect(groups[0].tasks.map((t) => t.title)).toEqual(['earlier', 'a-urgent', 'b-low']);
  });
});

describe('groupEventsByDay', () => {
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
      createdAt: new Date().toISOString(),
      ...partial,
    };
  }

  it('groups forward-looking events by local day, sorted within the day', () => {
    const today = new Date();
    const laterToday = new Date(today.getTime() + 3 * 3600e3);
    const yesterday = new Date(today.getTime() - 24 * 3600e3);
    const grouped = groupEventsByDay([
      event({ title: 'past', startAt: yesterday.toISOString() }),
      event({ title: 'second', startAt: laterToday.toISOString() }),
      event({ title: 'first', startAt: today.toISOString() }),
    ]);
    // Yesterday is dropped; today's two events are time-ordered.
    const todayKey = localDayKey(today);
    const todayGroup = grouped.find(([day]) => day === todayKey);
    expect(grouped.some(([day]) => day === localDayKey(yesterday))).toBe(false);
    expect(todayGroup?.[1].map((e) => e.title)).toEqual(['first', 'second']);
  });
});

describe('weekCells', () => {
  it('returns 7 cells oldest-first with target-aware done flags', () => {
    const today = new Date(2026, 6, 18);
    const counts = new Map<string, number>([
      [localDayKey(today), 2],
      [localDayKey(new Date(2026, 6, 17)), 1],
    ]);
    const cells = weekCells(counts, 2, today);
    expect(cells).toHaveLength(7);
    expect(cells.at(-1)).toEqual({ day: '2026-07-18', done: true, count: 2 });
    // Yesterday had 1 of target 2 → not done.
    expect(cells.at(-2)).toEqual({ day: '2026-07-17', done: false, count: 1 });
    expect(cells[0].day).toBe('2026-07-12');
  });
});
