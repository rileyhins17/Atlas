'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { GoalsApi } from '@/lib/api';
import { qk } from './keys';

export function useGoals() {
  return useQuery({ queryKey: qk.goals, queryFn: GoalsApi.list });
}

export function useCreateGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: GoalsApi.create,
    meta: { success: 'Goal added', errorFallback: 'Failed to add goal' },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.goals }),
  });
}

export function useUpdateGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Record<string, unknown> }) =>
      GoalsApi.update(id, patch),
    meta: { errorFallback: 'Failed to update goal' },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.goals }),
  });
}

export function useDeleteGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: GoalsApi.remove,
    meta: { errorFallback: 'Failed to delete goal' },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.goals }),
  });
}
