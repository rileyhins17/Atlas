'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { TimelineApi } from '@/lib/api';
import { qk } from './keys';

const PAGE_SIZE = 50;

/**
 * The unified life log, newest first, as an infinite list. Each page carries
 * `hasMore` so the "load more" affordance knows when to stop.
 */
export function useTimeline(source?: string) {
  return useInfiniteQuery({
    queryKey: qk.timeline(source),
    queryFn: ({ pageParam }) => TimelineApi.list({ limit: PAGE_SIZE, offset: pageParam, source }),
    initialPageParam: 0,
    getNextPageParam: (last, pages) =>
      last.hasMore ? pages.length * PAGE_SIZE : undefined,
  });
}
