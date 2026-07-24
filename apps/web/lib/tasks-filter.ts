import type { TaskDTO } from '@atlas/shared';
import { dayDiff, startOfDay } from './dates';

/** The Tasks page's view filters. `all` still hides done work. */
export type TaskFilter = 'all' | 'today' | 'overdue' | 'done';

export const TASK_FILTERS: { key: TaskFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'today', label: 'Today' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'done', label: 'Done' },
];

/**
 * Apply the filter chip and the search box. Pure so the page can stay a thin
 * render — and so the horizon rules are pinned by tests rather than eyeballed.
 */
export function filterTasks(
  tasks: TaskDTO[],
  filter: TaskFilter,
  query: string,
  now: Date,
): TaskDTO[] {
  const q = query.trim().toLowerCase();
  return tasks.filter((t) => {
    if (q && !t.title.toLowerCase().includes(q)) return false;

    const done = t.status === 'DONE';
    if (filter === 'done') return done;
    if (done) return false; // every other view is about open work

    if (filter === 'all') return true;

    if (!t.dueAt) return false; // undated work has no horizon
    const days = dayDiff(now, new Date(t.dueAt));
    if (filter === 'today') return days === 0;
    return days < 0; // 'overdue'
  });
}

/**
 * The due date a group's quick-add should pre-set, so adding a dated task takes
 * zero typing. End of day for the horizon buckets; null for "No date".
 */
export function quickAddDueDate(groupKey: string, now: Date): Date | null {
  const endOfDay = (d: Date) => {
    const x = startOfDay(d);
    x.setHours(23, 59, 0, 0);
    return x;
  };
  switch (groupKey) {
    case 'overdue':
    case 'today':
      return endOfDay(now);
    case 'week':
      // Mid-week: far enough to be "this week", near enough to stay actionable.
      return endOfDay(new Date(now.getTime() + 3 * 86_400_000));
    case 'later':
      return endOfDay(new Date(now.getTime() + 14 * 86_400_000));
    default:
      return null; // someday / no date
  }
}
