import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateHabitInput, HabitDTO } from '@atlas/shared';
import { HabitsApi } from '@/lib/api';

export const habitKeys = {
  list: ['habits'] as const,
};

export function useHabits() {
  return useQuery({ queryKey: habitKeys.list, queryFn: HabitsApi.list });
}

export function useCreateHabit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<CreateHabitInput> & { name: string }) => HabitsApi.create(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: habitKeys.list }),
  });
}

export function useCheckInHabit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (habit: HabitDTO) => HabitsApi.log(habit.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: habitKeys.list }),
  });
}

export function useRemoveHabit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (habit: HabitDTO) => HabitsApi.remove(habit.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: habitKeys.list }),
  });
}
