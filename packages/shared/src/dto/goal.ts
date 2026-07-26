import { z } from 'zod';

/**
 * Goals — the "why" above tasks.
 *
 * Split into short and long term because they are read differently: a short-term
 * goal is something you are actively working toward and should see progress on
 * weekly; a long-term one is direction, and checking it weekly would only make
 * you feel bad. The horizon is the user's own judgement, not inferred from
 * targetDate — a goal with no date still has a horizon, and "in 18 months" can
 * be short-term if it is a step rather than a destination.
 */
export const GoalHorizon = z.enum(['short', 'long']);
export type GoalHorizon = z.infer<typeof GoalHorizon>;

export const GoalStatus = z.enum(['active', 'achieved', 'paused', 'dropped']);
export type GoalStatus = z.infer<typeof GoalStatus>;

export const CreateGoalInput = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2_000).optional(),
  horizon: GoalHorizon.default('short'),
  targetDate: z.coerce.date().optional(),
});
export type CreateGoalInput = z.infer<typeof CreateGoalInput>;

export const UpdateGoalInput = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2_000).nullable().optional(),
  horizon: GoalHorizon.optional(),
  targetDate: z.coerce.date().nullable().optional(),
  status: GoalStatus.optional(),
  position: z.number().int().min(0).max(1_000).optional(),
});
export type UpdateGoalInput = z.infer<typeof UpdateGoalInput>;

export const GoalDTO = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  horizon: GoalHorizon,
  status: GoalStatus,
  targetDate: z.string().nullable(),
  position: z.number().int(),
  /** Linked tasks, which is what turns a goal from a wish into progress. */
  taskCount: z.number().int(),
  doneTaskCount: z.number().int(),
  createdAt: z.string(),
});
export type GoalDTO = z.infer<typeof GoalDTO>;

/** How far along a goal is, 0–1, or null when nothing is linked to it yet. */
export function goalProgress(goal: Pick<GoalDTO, 'taskCount' | 'doneTaskCount'>): number | null {
  if (goal.taskCount === 0) return null;
  return goal.doneTaskCount / goal.taskCount;
}

/** "3 of 8 done" / "nothing linked yet" — the honest one-liner under a goal. */
export function describeGoalProgress(
  goal: Pick<GoalDTO, 'taskCount' | 'doneTaskCount'>,
): string {
  if (goal.taskCount === 0) return 'nothing linked yet';
  return `${goal.doneTaskCount} of ${goal.taskCount} done`;
}
