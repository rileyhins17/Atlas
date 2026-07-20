import { z } from 'zod';

/**
 * One recurring block of the user's typical week. Times are minutes from local
 * midnight; `startMin > endMin` means the block wraps past midnight (sleep).
 * `days` is a 7-bit mask, bit 0 = Monday … bit 6 = Sunday.
 */
export const RoutineKind = z.enum(['sleep', 'work', 'school', 'meal', 'exercise', 'winddown', 'custom']);
export type RoutineKind = z.infer<typeof RoutineKind>;

const minuteOfDay = z.number().int().min(0).max(1439);

export const RoutineBlockInput = z.object({
  label: z.string().min(1).max(100),
  kind: RoutineKind.default('custom'),
  days: z.number().int().min(1).max(127),
  startMin: minuteOfDay,
  endMin: minuteOfDay,
});
export type RoutineBlockInput = z.infer<typeof RoutineBlockInput>;

/** Onboarding writes the whole schedule at once — bounded so it stays a schedule, not a dump. */
export const ReplaceRoutineInput = z.object({
  blocks: z.array(RoutineBlockInput).max(40),
});
export type ReplaceRoutineInput = z.infer<typeof ReplaceRoutineInput>;

export const RoutineBlockDTO = RoutineBlockInput.extend({
  id: z.string(),
});
export type RoutineBlockDTO = z.infer<typeof RoutineBlockDTO>;
