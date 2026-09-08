import type { TaskDTO, TransactionDTO } from './index.js';
import { dayDiff, localDayKey } from './local-dates.js';

const PRIORITY_WEIGHT: Record<TaskDTO['priority'], number> = {
  URGENT: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
};

export interface TaskGroup {
  key: string;
  label: string;
  overdue?: boolean;
  tasks: TaskDTO[];
}

/** Bucket open tasks by due horizon, each bucket due-then-priority sorted. */
export function groupTasks(tasks: TaskDTO[], now: Date): { groups: TaskGroup[]; done: TaskDTO[] } {
  const open = tasks.filter((t) => t.status !== 'DONE');
  const done = tasks.filter((t) => t.status === 'DONE');
  const buckets: Record<'overdue' | 'today' | 'week' | 'later' | 'someday', TaskDTO[]> = { overdue: [], today: [], week: [], later: [], someday: [] };
  for (const t of open) {
    if (!t.dueAt) {
      buckets.someday.push(t);
      continue;
    }
    const days = dayDiff(now, new Date(t.dueAt));
    if (days < 0) buckets.overdue.push(t);
    else if (days === 0) buckets.today.push(t);
    else if (days < 7) buckets.week.push(t);
    else buckets.later.push(t);
  }
  const order = (a: TaskDTO, b: TaskDTO) => {
    const ad = a.dueAt ? new Date(a.dueAt).getTime() : Infinity;
    const bd = b.dueAt ? new Date(b.dueAt).getTime() : Infinity;
    if (ad !== bd) return ad - bd;
    return PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority];
  };
  for (const key of Object.keys(buckets)) buckets[key as keyof typeof buckets].sort(order);
  const groups: TaskGroup[] = [
    { key: 'overdue', label: 'Overdue', overdue: true, tasks: buckets.overdue },
    { key: 'today', label: 'Today', tasks: buckets.today },
    { key: 'week', label: 'This week', tasks: buckets.week },
    { key: 'later', label: 'Later', tasks: buckets.later },
    { key: 'someday', label: 'No date', tasks: buckets.someday },
  ].filter((g) => g.tasks.length > 0);
  return { groups, done };
}

/**
 * Add a task straight into a group — the due date comes from the group itself,
 * so a dated task costs one line of typing and zero date-picking.
 */
/**
 * The groups whose quick-add does something the top composer does not.
 *
 * There were six ways to add a task on one phone screen — the composer at the
 * top, one per group, and the capture dock — and two of them were duplicates
 * rather than choices:
 *
 *   - "Add to no date" creates a task with no due date. So does the composer at
 *     the top of the page, which is always visible and always first.
 *   - "Add to overdue" reads as though it back-dates something, and does not:
 *     `quickAddDueDate('overdue')` returns the END OF TODAY, exactly like
 *     "Add to today" directly beneath it. Nobody deliberately creates an
 *     overdue task, and a control whose label disagrees with its behaviour is
 *     worse than one that is missing.
 *
 * The three that remain each set a due date nothing else on the screen sets, so
 * each is a genuine shortcut rather than another door to the same room.
 */
export const GROUPS_WORTH_ADDING_TO = new Set(['today', 'week', 'later']);

/** Transactions grouped by local calendar day, most recent first. */
export function groupTransactionsByDay(txns: TransactionDTO[]): Array<[string, TransactionDTO[]]> {
  const byDay = new Map<string, TransactionDTO[]>();
  const sorted = [...txns].sort(
    (a, b) => new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime(),
  );
  for (const t of sorted) {
    const key = localDayKey(new Date(t.postedAt));
    const arr = byDay.get(key) ?? [];
    arr.push(t);
    byDay.set(key, arr);
  }
  return [...byDay.entries()];
}

/** Last 7 local days (oldest first) with done-ness for the mini week grid. */
export function weekCells(
  counts: Map<string, number> | undefined,
  target: number,
  today: Date,
): Array<{ day: string; done: boolean; count: number }> {
  const cells: Array<{ day: string; done: boolean; count: number }> = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = localDayKey(d);
    const count = counts?.get(key) ?? 0;
    cells.push({ day: key, done: count >= Math.max(1, target), count });
  }
  return cells;
}
