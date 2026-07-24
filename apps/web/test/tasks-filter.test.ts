import { describe, expect, it } from 'vitest';
import type { TaskDTO } from '@atlas/shared';
import { filterTasks, quickAddDueDate } from '@/lib/tasks-filter';

const NOW = new Date(2026, 6, 15, 12, 0); // Wed Jul 15 2026, noon local

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
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    ...over,
  }) as TaskDTO;

const at = (dayOffset: number, h = 9) =>
  new Date(2026, 6, 15 + dayOffset, h).toISOString();

const FIXTURE = [
  task({ title: 'Overdue thing', dueAt: at(-2) }),
  task({ title: 'Due today', dueAt: at(0, 18) }),
  task({ title: 'Later this week', dueAt: at(3) }),
  task({ title: 'Someday idea' }),
  task({ title: 'Finished work', dueAt: at(-1), status: 'DONE' }),
];

const titles = (list: TaskDTO[]) => list.map((t) => t.title);

describe('filterTasks', () => {
  it('"all" shows every open task and hides done work', () => {
    expect(titles(filterTasks(FIXTURE, 'all', '', NOW))).toEqual([
      'Overdue thing',
      'Due today',
      'Later this week',
      'Someday idea',
    ]);
  });

  it('"today" is only tasks due on the local day', () => {
    expect(titles(filterTasks(FIXTURE, 'today', '', NOW))).toEqual(['Due today']);
  });

  it('"overdue" is only past-due open tasks', () => {
    expect(titles(filterTasks(FIXTURE, 'overdue', '', NOW))).toEqual(['Overdue thing']);
  });

  it('"done" shows only completed work', () => {
    expect(titles(filterTasks(FIXTURE, 'done', '', NOW))).toEqual(['Finished work']);
  });

  it('search narrows within the active filter, case-insensitively', () => {
    expect(titles(filterTasks(FIXTURE, 'all', 'THING', NOW))).toEqual(['Overdue thing']);
    // A match that exists but is filtered out stays out.
    expect(filterTasks(FIXTURE, 'today', 'thing', NOW)).toEqual([]);
  });

  it('undated tasks never appear in a horizon view', () => {
    expect(titles(filterTasks(FIXTURE, 'today', '', NOW))).not.toContain('Someday idea');
    expect(titles(filterTasks(FIXTURE, 'overdue', '', NOW))).not.toContain('Someday idea');
  });
});

describe('quickAddDueDate', () => {
  it('today/overdue add to the end of today', () => {
    const d = quickAddDueDate('today', NOW)!;
    expect(d.getDate()).toBe(15);
    expect(d.getHours()).toBe(23);
    expect(quickAddDueDate('overdue', NOW)!.getDate()).toBe(15);
  });

  it('week and later land inside their horizons', () => {
    expect(quickAddDueDate('week', NOW)!.getDate()).toBe(18);
    expect(quickAddDueDate('later', NOW)!.getDate()).toBe(29);
  });

  it('someday stays undated', () => {
    expect(quickAddDueDate('someday', NOW)).toBeNull();
  });
});
