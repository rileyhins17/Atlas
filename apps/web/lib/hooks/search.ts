/** Cross-domain search hooks. */
'use client';

import { useQuery } from '@tanstack/react-query';
import { SearchApi } from '@/lib/api';

/**
 * Search everything the user owns.
 *
 * Disabled under two characters: a single letter matches most of the database,
 * and firing a query per keystroke from the first one is a request storm for a
 * result nobody wants.
 */
export function useSearch(query: string) {
  const q = query.trim();
  return useQuery({
    queryKey: ['search', q],
    queryFn: () => SearchApi.run(q),
    enabled: q.length >= 2,
    // Results go stale the moment anything is edited, and the query is cheap.
    staleTime: 0,
  });
}
