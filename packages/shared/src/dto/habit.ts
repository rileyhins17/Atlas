import { z } from 'zod';

export const HabitCadence = z.enum(['daily', 'weekly']);
export type HabitCadence = z.infer<typeof HabitCadence>;

export const CreateHabitInput = z.object({
  name: z.string().min(1).max(200),
  cadence: HabitCadence.default('daily'),
  target: z.number().int().min(1).max(100).default(1),
});
export type CreateHabitInput = z.infer<typeof CreateHabitInput>;

export const UpdateHabitInput = z.object({
  name: z.string().min(1).max(200).optional(),
  cadence: HabitCadence.optional(),
  target: z.number().int().min(1).max(100).optional(),
  active: z.boolean().optional(),
});
export type UpdateHabitInput = z.infer<typeof UpdateHabitInput>;

export const LogHabitInput = z.object({
  // Optional value (e.g. glasses of water); defaults to 1 (a single check-in).
  value: z.number().int().min(1).max(1000).default(1),
  note: z.string().max(500).optional(),
});
export type LogHabitInput = z.infer<typeof LogHabitInput>;

export const HabitDTO = z.object({
  id: z.string(),
  name: z.string(),
  cadence: z.string(),
  target: z.number().int(),
  active: z.boolean(),
  // Derived stats for the UI.
  doneToday: z.boolean(),
  todayCount: z.number().int(),
  streak: z.number().int(),
  createdAt: z.string(),
});
export type HabitDTO = z.infer<typeof HabitDTO>;
