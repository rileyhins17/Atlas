import { z } from 'zod';

export const CreateEventInput = z
  .object({
    title: z.string().min(1).max(300),
    description: z.string().max(5_000).optional(),
    location: z.string().max(500).optional(),
    startAt: z.coerce.date(),
    endAt: z.coerce.date(),
    allDay: z.boolean().default(false),
  })
  .refine((v) => v.endAt >= v.startAt, { message: 'endAt must be after startAt', path: ['endAt'] });
export type CreateEventInput = z.infer<typeof CreateEventInput>;

export const UpdateEventInput = z.object({
  title: z.string().min(1).max(300).optional(),
  description: z.string().max(5_000).nullable().optional(),
  location: z.string().max(500).nullable().optional(),
  startAt: z.coerce.date().optional(),
  endAt: z.coerce.date().optional(),
  allDay: z.boolean().optional(),
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
  createdAt: z.string(),
});
export type EventDTO = z.infer<typeof EventDTO>;
