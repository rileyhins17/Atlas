import { z } from 'zod';
import { TaskPriority, TaskStatus } from '../enums.js';

export const CreateTaskInput = z.object({
  title: z.string().min(1).max(500),
  notes: z.string().max(10_000).optional(),
  priority: TaskPriority.default('MEDIUM'),
  dueAt: z.coerce.date().optional(),
  tags: z.array(z.string()).default([]),
  goalId: z.string().optional(),
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
});
export type UpdateTaskInput = z.infer<typeof UpdateTaskInput>;

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
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type TaskDTO = z.infer<typeof TaskDTO>;
