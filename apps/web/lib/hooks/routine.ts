'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { RoutineBlockInput } from '@atlas/shared';
import { RoutineApi } from '@/lib/api';
import { qk } from './keys';

export function useRoutine() {
  return useQuery({ queryKey: qk.routine, queryFn: RoutineApi.list });
}

export function useReplaceRoutine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (blocks: RoutineBlockInput[]) => RoutineApi.replace(blocks),
    onSuccess: (data) => qc.setQueryData(qk.routine, data),
  });
}
