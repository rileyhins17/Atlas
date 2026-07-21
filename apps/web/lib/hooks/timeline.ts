'use client';

import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
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

/** One local day's actuals for the Day Canvas — [dayStart, dayStart+24h). */
export function useDayActuals(dayStart: Date) {
  const from = dayStart.toISOString();
  const to = new Date(dayStart.getTime() + 86_400_000).toISOString();
  return useQuery({
    queryKey: qk.dayActuals(from),
    queryFn: () => TimelineApi.list({ from, to, limit: 100 }),
  });
}
