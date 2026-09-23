import type { EventDTO, HabitDTO, TaskDTO, WorkoutTemplateDTO } from '@atlas/shared';
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

/** "Due 11:59 PM" is how "sometime today" is stored. */
export function isEndOfDay(d: Date): boolean {
  return d.getHours() === 23 && d.getMinutes() === 59;
}

export interface DayProgress {
  done: number;
  total: number;
  /** 0–1; 0 for a day with nothing in it, so an empty ring is never "complete". */
  fraction: number;
}

/**
 * How much of TODAY is done: today's tasks and every habit's daily target.
 *
 * Work carried over from earlier days is left out on purpose. It is offered
 * back on the plan, but counting it here would start a day at "0 of 9" because
 * of last week — the ring measures the day you are in, not a backlog.
 */
export function dayProgress(
  plan: TodaysPlan,
  habits: Pick<HabitDTO, 'todayCount' | 'target'>[],
): DayProgress {
  const habitsDone = habits.filter((h) => h.todayCount >= h.target).length;
  const done = plan.doneToday.length + habitsDone;
  const total = plan.today.length + plan.doneToday.length + habits.length;
  return { done, total, fraction: total === 0 ? 0 : done / total };
}

export type TimelineEntry =
  | {
      kind: 'event';
      id: string;
      title: string;
      start: Date;
      end: Date;
      state: 'past' | 'now' | 'upcoming';
    }
  | { kind: 'task'; id: string; title: string; start: Date; task: TaskDTO; state: 'past' | 'upcoming' };

export interface DayTimeline {
  /** Events and timed tasks, in the order the day runs. */
  timed: TimelineEntry[];
  /** Due today with no particular time — what "add to today" creates. */
  anytime: TaskDTO[];
}

/**
 * Today as one timeline: the calendar and the timed tasks interleaved, so the
 * day reads top to bottom as it will happen. All-day events are left out —
 * they are not a moment in the day — and a task with no time goes under
 * "anytime" rather than being pinned to 11:59 PM.
 */
export function dayTimeline(events: EventDTO[], plan: TodaysPlan, now: Date): DayTimeline {
  const t = now.getTime();
  const timed: TimelineEntry[] = [];
  const anytime: TaskDTO[] = [];

  for (const e of events) {
    if (e.allDay) continue;
    const start = new Date(e.startAt);
    const end = new Date(e.endAt);
    const state = end.getTime() <= t ? 'past' : start.getTime() <= t ? 'now' : 'upcoming';
    timed.push({ kind: 'event', id: e.id, title: e.title, start, end, state });
  }
  for (const task of plan.today) {
    const due = new Date(task.dueAt!);
    if (isEndOfDay(due)) {
      anytime.push(task);
      continue;
    }
    timed.push({
      kind: 'task',
      id: task.id,
      title: task.title,
      start: due,
      task,
      state: due.getTime() < t ? 'past' : 'upcoming',
    });
  }

  timed.sort((a, b) => a.start.getTime() - b.start.getTime());
  return { timed, anytime };
}

export type StartStepId = 'name' | 'habit' | 'plan' | 'training' | 'watch';

export interface StartStep {
  id: StartStepId;
  label: string;
  hint: string;
  done: boolean;
}

export interface StartInput {
  hasName: boolean;
  hasTask: boolean;
  habitCount: number;
  templateCount: number;
  /**
   * Whether a watch is connected — or `null` when this server cannot connect
   * one at all, in which case the step is left out rather than shown as
   * something the person can never finish.
   */
  watchConnected: boolean | null;
}

/**
 * The first things worth doing in a new account, each ticked off by the data
 * itself rather than by a checkbox: a step is done when the thing exists, so
 * the list can never disagree with the app. Ordered by effort, smallest first,
 * so the first tap is always a quick win.
 */
export function gettingStartedSteps(input: StartInput): StartStep[] {
  const steps: StartStep[] = [
    { id: 'name', label: 'Tell Atlas your name', hint: 'So it greets you properly', done: input.hasName },
    { id: 'habit', label: 'Pick a habit to keep up', hint: 'One tap a day', done: input.habitCount > 0 },
    { id: 'plan', label: 'Put something on today', hint: 'Type it under Your day', done: input.hasTask },
    {
      id: 'training',
      label: 'Save your training days',
      hint: "Then today's workout is one tap",
      done: input.templateCount > 0,
    },
  ];
  if (input.watchConnected !== null) {
    steps.push({
      id: 'watch',
      label: 'Connect your Fitbit',
      hint: 'Sleep and steps, right on Today',
      done: input.watchConnected,
    });
  }
  return steps;
}
