'use client';

import { useQuery } from '@tanstack/react-query';
import { StatsApi } from '@/lib/api';
import { qk } from './keys';

export function useStats(days: number) {
  return useQuery({ queryKey: qk.stats(days), queryFn: () => StatsApi.get(days) });
}
