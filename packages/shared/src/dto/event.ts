import { z } from 'zod';
import { RruleString } from './recurrence.js';

export const CreateEventInput = z
  .object({
    title: z.string().min(1).max(300),
    description: z.string().max(5_000).optional(),
    location: z.string().max(500).optional(),
    startAt: z.coerce.date(),
    endAt: z.coerce.date(),
    allDay: z.boolean().default(false),
    recurrence: RruleString.optional(),
    // Set when this block was reserved for a specific task ("Plan my day").
    // Ownership is checked server-side — a client id is never trusted.
    taskId: z.string().min(1).max(64).optional(),
  })
  .refine((v) => v.endAt >= v.startAt, { message: 'endAt must be after startAt', path: ['endAt'] });
export type CreateEventInput = z.infer<typeof CreateEventInput>;

export const UpdateEventInput = z
  .object({
    title: z.string().min(1).max(300).optional(),
    description: z.string().max(5_000).nullable().optional(),
    location: z.string().max(500).nullable().optional(),
    startAt: z.coerce.date().optional(),
    endAt: z.coerce.date().optional(),
    allDay: z.boolean().optional(),
    recurrence: RruleString.nullable().optional(),
  })
  // Create refines this and update did not, so a PATCH could reverse an event
  // that could never have been created that way. Nothing crashes — the week
  // grid guards against a negative height by clamping the end to midnight —
  // which is worse than a crash: the event silently swallows the rest of the
  // day and squashes every later event that day into a narrow column.
  //
  // Only checkable here when BOTH ends are present. A PATCH carrying one of
  // them has to be judged against the stored value, which is a DTO's blind
  // spot; CalendarService.update closes that half.
  .refine((v) => v.startAt === undefined || v.endAt === undefined || v.endAt >= v.startAt, {
    message: 'endAt must be after startAt',
    path: ['endAt'],
  });
export type UpdateEventInput = z.infer<typeof UpdateEventInput>;

/** Optional window for listing events (Day Canvas fetches one local day). */
export const EventListQuery = z
  .object({
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  })
  .refine(
    (q) =>
      q.from === undefined ||
      q.to === undefined ||
      (q.to.getTime() > q.from.getTime() &&
        q.to.getTime() - q.from.getTime() <= 62 * 86_400_000),
    { message: 'window must be positive and at most 62 days', path: ['to'] },
  );
export type EventListQuery = z.infer<typeof EventListQuery>;

export const EventDTO = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  location: z.string().nullable(),
  startAt: z.string(),
  endAt: z.string(),
  allDay: z.boolean(),
  source: z.string(),
  recurrence: z.string().nullable(),
  /** The task this block was reserved for, if any. */
  taskId: z.string().nullable(),
  // True when this row was expanded from a rule rather than stored as itself.
  // Such rows carry a synthetic id and must not be PATCHed directly.
  isOccurrence: z.boolean().optional(),
  createdAt: z.string(),
});
export type EventDTO = z.infer<typeof EventDTO>;
