import { z } from 'zod';

/**
 * Standard list pagination. Every list endpoint must bound its result set —
 * `limit` is hard-capped so a client can never ask for an unbounded page.
 */
export const PaginationQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
export type PaginationQuery = z.infer<typeof PaginationQuery>;
