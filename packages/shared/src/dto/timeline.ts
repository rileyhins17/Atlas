import { z } from 'zod';
import { TimelineEventDTO } from '../contracts.js';

/**
 * Read-side query for the unified timeline (the event shape itself —
 * `TimelineEventDTO` — lives in contracts.ts). `source` narrows to one
 * producing domain ("tasks", "habits", "journal", "notes", "calendar", "ai");
 * omitted = everything. Bounded by the shared pagination cap.
 */
export const TimelineQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  source: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[a-z0-9-]+$/)
    .optional(),
});
export type TimelineQuery = z.infer<typeof TimelineQuery>;

/** Page envelope so the client can paginate without guessing. */
export const TimelinePageDTO = z.object({
  events: z.array(TimelineEventDTO),
  /** True when another page exists past this offset. */
  hasMore: z.boolean(),
});
export type TimelinePageDTO = z.infer<typeof TimelinePageDTO>;
