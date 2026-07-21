import { z } from 'zod';
import { TimelineEventDTO } from '../contracts.js';

/**
 * Read-side query for the unified timeline (the event shape itself —
 * `TimelineEventDTO` — lives in contracts.ts). `source` narrows to one
 * producing domain ("tasks", "habits", "journal", "notes", "calendar", "ai");
 * omitted = everything. Bounded by the shared pagination cap.
 */
export const TimelineQuery = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(50),
    offset: z.coerce.number().int().min(0).default(0),
    source: z
      .string()
      .min(1)
      .max(50)
      .regex(/^[a-z0-9-]+$/)
      .optional(),
    // Optional occurredAt window — the Day Canvas fetches one local day of
    // actuals. Both-or-neither, and bounded so a range can't be unbounded work.
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  })
  .refine((q) => (q.from === undefined) === (q.to === undefined), {
    message: 'from and to must be provided together',
    path: ['from'],
  })
  .refine(
    (q) =>
      q.from === undefined ||
      q.to === undefined ||
      (q.to.getTime() > q.from.getTime() &&
        q.to.getTime() - q.from.getTime() <= 62 * 86_400_000),
    { message: 'window must be positive and at most 62 days', path: ['to'] },
  );
export type TimelineQuery = z.infer<typeof TimelineQuery>;

/** Page envelope so the client can paginate without guessing. */
export const TimelinePageDTO = z.object({
  events: z.array(TimelineEventDTO),
  /** True when another page exists past this offset. */
  hasMore: z.boolean(),
});
export type TimelinePageDTO = z.infer<typeof TimelinePageDTO>;
