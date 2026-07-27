import { z } from 'zod';

/** Which domain a hit came from — decides its icon and where it links. */
export const SearchDomain = z.enum(['task', 'event', 'goal', 'note', 'journal']);
export type SearchDomain = z.infer<typeof SearchDomain>;

export const SearchQuery = z.object({
  // Bounded, not floored: the service returns nothing under two characters
  // (a single letter matches most of the database and the result is noise),
  // but that is a ranking decision rather than a validation error — a one-char
  // query is a legitimate request for "nothing yet", not a 400.
  q: z.string().min(1).max(200),
});
export type SearchQuery = z.infer<typeof SearchQuery>;

export const SearchHitDTO = z.object({
  id: z.string(),
  domain: SearchDomain,
  title: z.string(),
  subtitle: z.string(),
  href: z.string(),
});
export type SearchHitDTO = z.infer<typeof SearchHitDTO>;

export const SearchResultDTO = z.object({
  query: z.string(),
  hits: z.array(SearchHitDTO),
});
export type SearchResultDTO = z.infer<typeof SearchResultDTO>;
