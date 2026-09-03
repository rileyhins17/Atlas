'use client';

import { useQuery } from '@tanstack/react-query';
import { StatsApi } from '@/lib/api';
import { qk } from './keys';

export function useStats(days: number) {
  return useQuery({ queryKey: qk.stats(days), queryFn: () => StatsApi.get(days) });
}

/**
 * What the user's better days have in common. Takes no window: the server
 * decides how far back a comparison may look, so the client cannot ask for a
 * period small enough to make a coincidence look like a finding.
 */
export function useMoodPatterns() {
  return useQuery({ queryKey: qk.moodPatterns(), queryFn: () => StatsApi.patterns() });
}
