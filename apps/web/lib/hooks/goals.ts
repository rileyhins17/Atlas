'use client';

import { useQuery } from '@tanstack/react-query';
import { GoalsApi } from '@/lib/api';
import { qk } from './keys';
import { useInvalidatingMutation } from './mutation';

export function useGoals() {
  return useQuery({ queryKey: qk.goals, queryFn: GoalsApi.list });
}

export function useCreateGoal() {
  return useInvalidatingMutation({
    mutationFn: GoalsApi.create,
    invalidates: qk.goals,
    success: 'Goal added',
    errorFallback: 'Failed to add goal',
  });
}

export function useUpdateGoal() {
  return useInvalidatingMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Record<string, unknown> }) =>
      GoalsApi.update(id, patch),
    invalidates: qk.goals,
    errorFallback: 'Failed to update goal',
  });
}

export function useDeleteGoal() {
  return useInvalidatingMutation({
    mutationFn: GoalsApi.remove,
    invalidates: qk.goals,
    errorFallback: 'Failed to delete goal',
  });
}
