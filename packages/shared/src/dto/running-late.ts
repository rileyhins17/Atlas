import { z } from 'zod';
import type { EventDTO } from './event.js';

/**
 * "I'm running 30 minutes late" — push the rest of today.
 *
 * When something runs long, every later block is wrong, and fixing them one at
 * a time is enough work that people just don't. This is the single most common
 * real-life planning action.
 *
 * The whole decision is WHAT MUST NOT MOVE, and getting that wrong is worse
 * than not having the feature: silently shifting a meeting other people are
 * attending is real damage, not an inconvenience. Two things stay put:
 *
 *   - anything that did not originate in Atlas (`source !== 'atlas'`). A synced
 *     Google event is a commitment with other people in it, and moving it here
 *     would also drift out of sync with the calendar that owns it.
 *   - all-day entries. "Vacation" shifted by thirty minutes is meaningless.
 *
 * Work hours stay put for free: routine blocks are a different table entirely
 * and this never touches them.
 */

/** Negative is allowed on purpose — it is the undo for a mis-tap. */
export const ShiftScheduleInput = z.object({
  minutes: z
    .number()
    .int()
    .refine((m) => m !== 0, 'A shift of zero minutes would do nothing.')
    .refine((m) => Math.abs(m) <= 240, 'Shifts are limited to four hours in either direction.'),
  /** Instant to shift from; anything starting before it is left alone. */
  from: z.coerce.date().optional(),
});
export type ShiftScheduleInput = z.infer<typeof ShiftScheduleInput>;

export type SkipReason = 'already-started' | 'all-day' | 'not-from-atlas';

export interface ShiftableEvent {
  id: string;
  startAt: Date;
  endAt: Date;
  allDay: boolean;
  source: string;
}

export interface ShiftedEvent {
  id: string;
  startAt: Date;
  endAt: Date;
  /** True when the new start lands on a later local day than the old one. */
  crossesDay: boolean;
}

export interface ShiftPlan {
  moved: ShiftedEvent[];
  skipped: { id: string; reason: SkipReason }[];
}

const MINUTE_MS = 60_000;

/**
 * Work out what a shift would do, without doing it.
 *
 * Pure so the rules can be tested exhaustively and so the UI can describe the
 * outcome before the user commits to it.
 *
 * `dayKey` decides "a later day" in the USER'S timezone; comparing UTC dates
 * would call 7pm-to-8pm a day change for anyone far enough east.
 */
export function planShift(
  events: ShiftableEvent[],
  options: { minutes: number; from: Date; dayKey: (d: Date) => string },
): ShiftPlan {
  const { minutes, from, dayKey } = options;
  const moved: ShiftedEvent[] = [];
  const skipped: { id: string; reason: SkipReason }[] = [];

  for (const event of events) {
    // Already under way: you are IN this one, so its start is history. Moving it
    // would rewrite what already happened.
    if (event.startAt.getTime() < from.getTime()) {
      skipped.push({ id: event.id, reason: 'already-started' });
      continue;
    }
    if (event.allDay) {
      skipped.push({ id: event.id, reason: 'all-day' });
      continue;
    }
    if (event.source !== 'atlas') {
      skipped.push({ id: event.id, reason: 'not-from-atlas' });
      continue;
    }

    const startAt = new Date(event.startAt.getTime() + minutes * MINUTE_MS);
    const endAt = new Date(event.endAt.getTime() + minutes * MINUTE_MS);
    // Duration is preserved by construction: both ends move by the same amount,
    // so an hour stays an hour even across a DST boundary, where adding to the
    // wall clock would not.
    moved.push({ id: event.id, startAt, endAt, crossesDay: dayKey(startAt) !== dayKey(event.startAt) });
  }

  return { moved, skipped };
}

/** Plain-English result, so the toast and the timeline agree on the wording. */
export function describeShift(plan: ShiftPlan, minutes: number): string {
  if (plan.moved.length === 0) return 'Nothing left today to move.';
  const dir = minutes > 0 ? 'later' : 'earlier';
  const mins = Math.abs(minutes);
  const count = plan.moved.length === 1 ? '1 thing' : `${plan.moved.length} things`;
  const held = plan.skipped.filter((s) => s.reason !== 'already-started').length;
  const tail = held > 0 ? `, ${held} left where ${held === 1 ? 'it was' : 'they were'}` : '';
  return `Moved ${count} ${mins} minutes ${dir}${tail}.`;
}

export interface ShiftScheduleResult {
  minutes: number;
  moved: EventDTO[];
  skipped: { id: string; reason: SkipReason }[];
  /** Already written for the toast and the timeline, so both say the same thing. */
  message: string;
}
