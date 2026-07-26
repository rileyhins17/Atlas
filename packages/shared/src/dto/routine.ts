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

/**
 * The plain shape. Kept separate from the validated schema below because
 * `.refine()` yields a ZodEffects, which has no `.partial()` or `.extend()` —
 * the update and DTO variants have to derive from the object itself.
 */
const routineBlockShape = z.object({
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

/**
 * A block covering no time is always a mistake, and it contributes nothing to
 * the free-time calculation — so it silently reads as the routine editor having
 * dropped the entry.
 */
const coversSomeTime = (b: { startMin: number; endMin: number }) => b.startMin !== b.endMin;
const spanMessage = { message: 'A block must cover some time', path: ['endMin' as const] };

export const RoutineBlockInput = routineBlockShape.refine(coversSomeTime, spanMessage);
export type RoutineBlockInput = z.infer<typeof RoutineBlockInput>;

/** Onboarding writes the whole schedule at once — bounded so it stays a schedule, not a dump. */
export const ReplaceRoutineInput = z.object({
  blocks: z.array(RoutineBlockInput).max(40),
});
export type ReplaceRoutineInput = z.infer<typeof ReplaceRoutineInput>;

// Only checked when a patch supplies BOTH ends; moving one at a time is fine.
export const UpdateRoutineBlockInput = routineBlockShape
  .partial()
  .refine((b) => b.startMin === undefined || b.endMin === undefined || coversSomeTime(b as never), spanMessage);
export type UpdateRoutineBlockInput = z.infer<typeof UpdateRoutineBlockInput>;

export const RoutineBlockDTO = routineBlockShape.extend({
  id: z.string(),
  onDate: z.string().nullable(),
});
export type RoutineBlockDTO = z.infer<typeof RoutineBlockDTO>;
