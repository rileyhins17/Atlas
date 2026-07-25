import { z } from 'zod';
import { TaskPriority, TaskStatus } from '../enums.js';

export const CreateTaskInput = z.object({
  title: z.string().min(1).max(500),
  notes: z.string().max(10_000).optional(),
  priority: TaskPriority.default('MEDIUM'),
  dueAt: z.coerce.date().optional(),
  tags: z.array(z.string()).default([]),
  goalId: z.string().optional(),
  // An RRULE string. Deliberately only length-bounded: a rule we can't parse is
  // stored verbatim rather than rejected, so a sync can never lose one.
  recurrence: z.string().max(500).optional(),
});
export type CreateTaskInput = z.infer<typeof CreateTaskInput>;

export const UpdateTaskInput = z.object({
  title: z.string().min(1).max(500).optional(),
  notes: z.string().max(10_000).nullable().optional(),
  status: TaskStatus.optional(),
  priority: TaskPriority.optional(),
  dueAt: z.coerce.date().nullable().optional(),
  tags: z.array(z.string()).optional(),
  goalId: z.string().nullable().optional(),
  recurrence: z.string().max(500).nullable().optional(),
});
export type UpdateTaskInput = z.infer<typeof UpdateTaskInput>;

/**
 * Deciding, in one go, what to do about work that did not happen.
 *
 * Overdue lists are where task apps go to die: things pile up, the list stops
 * describing anything real, and the user stops reading it. The cure is not a
 * better sort order, it is a small forced decision — move it to today, or admit
 * it is not happening. Batched so the whole backlog costs two taps, and both
 * answers are recorded, because "I keep dropping this" is exactly the signal
 * Atlas should be learning from.
 */
export const RollForwardAction = z.enum(['today', 'drop']);
export type RollForwardAction = z.infer<typeof RollForwardAction>;

export const RollForwardInput = z.object({
  // Bounded: this is a bulk write, so the request can never be unbounded.
  taskIds: z.array(z.string().min(1).max(64)).min(1).max(100),
  action: RollForwardAction,
});
export type RollForwardInput = z.infer<typeof RollForwardInput>;

export const RollForwardResultDTO = z.object({
  action: RollForwardAction,
  /** How many tasks the action actually applied to. */
  count: z.number().int(),
});
export type RollForwardResultDTO = z.infer<typeof RollForwardResultDTO>;

export const TaskDTO = z.object({
  id: z.string(),
  title: z.string(),
  notes: z.string().nullable(),
  status: TaskStatus,
  priority: TaskPriority,
  dueAt: z.string().nullable(), // ISO string over the wire
  completedAt: z.string().nullable(),
  tags: z.array(z.string()),
  goalId: z.string().nullable(),
  recurrence: z.string().nullable(),
  recurrenceParentId: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type TaskDTO = z.infer<typeof TaskDTO>;
