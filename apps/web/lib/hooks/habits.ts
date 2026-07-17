'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { HabitsApi } from '@/lib/api';
import { qk } from './keys';

export function useHabits() {
  return useQuery({ queryKey: qk.habits, queryFn: HabitsApi.list });
}

export function useCreateHabit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: HabitsApi.create,
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.habits }),
  });
}

export function useLogHabit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: HabitsApi.log,
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.habits }),
  });
}

export function useDeleteHabit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: HabitsApi.remove,
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.habits }),
  });
}
