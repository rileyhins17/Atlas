import type { HabitDTO, TaskDTO, WorkoutTemplateDTO } from '@atlas/shared';
import { localDayKey, startOfDay } from './dates';

/**
 * The pure half of soft style's Today. Everything here is what the screen
 * SAYS; the components only lay it out, so the wording and the grouping are
 * pinned by tests rather than eyeballed.
 */

export interface TodaysPlan {
  /** Open, and due before today began. Offered back, never nagged about. */
  earlier: TaskDTO[];
  /** Open and due today, soonest first. */
  today: TaskDTO[];
  /** Ticked off today — kept on screen, because seeing them is the reward. */
  doneToday: TaskDTO[];
}

/**
 * Today's plan from the task working set.
 *
 * Keyed by the task's LOCAL due day, not by whether its time has passed: a
 * task due at 9am that is still open at 2pm is still today's, and it must not
 * vanish from the list because the clock moved past it.
 */
export function todaysPlan(tasks: TaskDTO[], now: Date): TodaysPlan {
  const todayKey = localDayKey(now);
  const dayStart = startOfDay(now).getTime();
  const earlier: TaskDTO[] = [];
  const today: TaskDTO[] = [];
  const doneToday: TaskDTO[] = [];

  for (const t of tasks) {
    if (t.status === 'DONE') {
      if (t.completedAt && localDayKey(new Date(t.completedAt)) === todayKey) doneToday.push(t);
      continue;
    }
    if (t.status === 'ARCHIVED' || !t.dueAt) continue;
    const due = new Date(t.dueAt);
    if (localDayKey(due) === todayKey) today.push(t);
    else if (due.getTime() < dayStart) earlier.push(t);
  }

  const byDue = (a: TaskDTO, b: TaskDTO) => a.dueAt!.localeCompare(b.dueAt!);
  today.sort(byDue);
  earlier.sort(byDue);
  doneToday.sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''));
  return { earlier, today, doneToday };
}

/** 0–1: how much of a habit's daily target is met. */
export function habitFill(h: Pick<HabitDTO, 'todayCount' | 'target'>): number {
  if (h.target <= 0) return 1;
  return Math.min(1, h.todayCount / h.target);
}

/**
 * One kind sentence about the day, from what is actually left.
 *
 * It states counts and never grades them. "3 habits to go" is information;
 * "you're behind" would be a judgement the app has no business making.
 */
export function daySummary(planLeft: number, habitsLeft: number, habitsTotal: number): string {
  const plan =
    planLeft === 0 ? null : planLeft === 1 ? '1 thing on your plan' : `${planLeft} things on your plan`;
  const habits =
    habitsTotal === 0
      ? null
      : habitsLeft === 0
        ? 'every habit done'
        : habitsLeft === 1
          ? '1 habit to go'
          : `${habitsLeft} habits to go`;

  if (!plan && !habits) return 'A clear day. Add something, or just enjoy it.';
  if (!plan && habitsLeft === 0) return 'Plan clear and every habit done. Lovely.';
  if (!plan) return `Nothing planned — ${habits}.`;
  if (!habits) return `${capitalise(plan)} today.`;
  return `${capitalise(plan)} and ${habits}.`;
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * The saved training day that is most "due": never trained first, then the
 * one trained longest ago. Ties keep the user's own order.
 *
 * This is the rotation a split already implies, stated as a suggestion — the
 * card offers the others too.
 */
export function suggestedTemplate(templates: WorkoutTemplateDTO[]): WorkoutTemplateDTO | null {
  if (templates.length === 0) return null;
  return [...templates].sort((a, b) => {
    if (a.lastPerformedAt === b.lastPerformedAt) return a.position - b.position;
    if (a.lastPerformedAt === null) return -1;
    if (b.lastPerformedAt === null) return 1;
    return a.lastPerformedAt.localeCompare(b.lastPerformedAt);
  })[0]!;
}

/** End of the local day — where "add to today" puts a task's due time. */
export function endOfToday(now: Date): Date {
  const d = startOfDay(now);
  d.setHours(23, 59, 0, 0);
  return d;
}
