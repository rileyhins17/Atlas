import type { GoalDTO } from './goal.js';
import type { HabitDTO } from './habit.js';

/**
 * The weekly review, as decisions rather than prose.
 *
 * The review Atlas writes is a paragraph you read once. Reading changes
 * nothing — a ritual only sticks if it ends with you having *done* something,
 * and the something has to be small enough to do in the two minutes you
 * actually have.
 *
 * So these are computed, not written by the model: each one is a fact about
 * the data with an obvious action attached. The AI's prose stays alongside as
 * commentary, which is what it is good at; the decisions stay deterministic,
 * which is what makes them trustworthy enough to put a button on.
 */

export type WeeklyDecision =
  /** Open work whose due date has passed — roll it forward or admit it is not happening. */
  | { kind: 'slipped'; count: number }
  /** An active goal with no tasks attached; its progress bar cannot ever move. */
  | { kind: 'goal-unbroken'; goalId: string; title: string }
  /** A habit that has not been kept in a fortnight. Keeping it on the list is a lie. */
  | { kind: 'habit-stalled'; habitId: string; name: string; days: number };

export interface WeeklyDecisionInput {
  slippedCount: number;
  goals: GoalDTO[];
  habits: HabitDTO[];
  /** Days since each habit was last logged, keyed by habit id. */
  daysSinceHabit: Map<string, number>;
}

/**
 * A habit you have not touched in two weeks is not a habit you are building.
 * Shorter than this and the prompt fires at anyone who took a week off.
 */
const HABIT_STALE_DAYS = 14;

/** Three is a review; ten is a chore that gets skipped. */
const MAX_DECISIONS = 3;

export function weeklyDecisions(input: WeeklyDecisionInput): WeeklyDecision[] {
  const out: WeeklyDecision[] = [];

  // Ordered by how much it costs to leave undone. Work that has already
  // slipped is the only one that gets worse on its own.
  if (input.slippedCount > 0) out.push({ kind: 'slipped', count: input.slippedCount });

  for (const habit of input.habits) {
    if (!habit.active) continue;
    const since = input.daysSinceHabit.get(habit.id);
    if (since === undefined || since < HABIT_STALE_DAYS) continue;
    out.push({ kind: 'habit-stalled', habitId: habit.id, name: habit.name, days: since });
  }

  for (const goal of input.goals) {
    // Long-term goals are direction, not a weekly to-do — asking every week why
    // "financial independence" has no tasks on it is how a review earns being
    // ignored. Short-term goals are the ones that should be moving.
    if (goal.status !== 'active' || goal.horizon !== 'short' || goal.taskCount > 0) continue;
    out.push({ kind: 'goal-unbroken', goalId: goal.id, title: goal.title });
  }

  return out.slice(0, MAX_DECISIONS);
}

/** The sentence on the row. Kept here so the phrasing is tested, not inlined. */
export function describeDecision(d: WeeklyDecision): string {
  switch (d.kind) {
    case 'slipped':
      return d.count === 1
        ? '1 thing slipped past its date.'
        : `${d.count} things slipped past their dates.`;
    case 'habit-stalled':
      return `“${d.name}” has not been kept in ${d.days} days.`;
    case 'goal-unbroken':
      return `“${d.title}” has no work attached to it yet.`;
  }
}
