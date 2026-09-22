'use client';

import { useInfiniteQuery, type QueryKey } from '@tanstack/react-query';

/**
 * A newest-first list the server pages by `limit`/`offset`, flattened.
 *
 * Journal and notes used to fetch one page and stop, so everything past the
 * API's default 50 rows could not be reached from the page that owns it. This
 * keeps `data` a plain array for every reader and adds `hasNextPage` /
 * `fetchNextPage` for the one that offers "older".
 *
 * A short page is the end: the endpoints return arrays, not a `hasMore` flag.
 */
export function usePagedList<T>(
  queryKey: QueryKey,
  fetchPage: (page: { limit: number; offset: number }) => Promise<T[]>,
  pageSize = 50,
) {
  return useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) => fetchPage({ limit: pageSize, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (last, pages) =>
      last.length < pageSize ? undefined : pages.length * pageSize,
    select: (data) => data.pages.flat(),
  });
}
