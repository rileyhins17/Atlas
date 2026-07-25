import { z } from 'zod';

/**
 * One recurring block of the user's typical week. Times are minutes from local
 * midnight; `startMin > endMin` means the block wraps past midnight (sleep).
 * `days` is a 7-bit mask, bit 0 = Monday … bit 6 = Sunday.
 */
// 'off' is not a block you DO — it clears the weekly pattern for a window, so a
// vacation day or a swapped shift stops reading as Work.
export const RoutineKind = z.enum([
  'sleep',
  'work',
  'school',
  'meal',
  'exercise',
  'winddown',
  'off',
  'custom',
]);
export type RoutineKind = z.infer<typeof RoutineKind>;

const minuteOfDay = z.number().int().min(0).max(1439);

/** A local calendar date, YYYY-MM-DD — never a timestamp (see the schema note). */
const localDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');

export const RoutineBlockInput = z.object({
  label: z.string().min(1).max(100),
  kind: RoutineKind.default('custom'),
  // Weekly mask. Ignored when `onDate` is set, but still required so a block is
  // never ambiguous about when it applies.
  days: z.number().int().min(1).max(127),
  /** Set to pin this block to ONE date (shift work, a one-off, a day off). */
  onDate: localDate.nullish(),
  startMin: minuteOfDay,
  endMin: minuteOfDay,
});
export type RoutineBlockInput = z.infer<typeof RoutineBlockInput>;

/** Onboarding writes the whole schedule at once — bounded so it stays a schedule, not a dump. */
export const ReplaceRoutineInput = z.object({
  blocks: z.array(RoutineBlockInput).max(40),
});
export type ReplaceRoutineInput = z.infer<typeof ReplaceRoutineInput>;

export const UpdateRoutineBlockInput = RoutineBlockInput.partial();
export type UpdateRoutineBlockInput = z.infer<typeof UpdateRoutineBlockInput>;

export const RoutineBlockDTO = RoutineBlockInput.extend({
  id: z.string(),
  onDate: z.string().nullable(),
});
export type RoutineBlockDTO = z.infer<typeof RoutineBlockDTO>;
