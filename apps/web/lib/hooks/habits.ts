'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { HabitDTO } from '@atlas/shared';
import { HabitsApi } from '@/lib/api';
import { qk } from './keys';

export function useHabits() {
  return useQuery({ queryKey: qk.habits, queryFn: HabitsApi.list });
}

export function useCreateHabit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: HabitsApi.create,
    meta: { success: 'Habit added', errorFallback: 'Failed to add habit' },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.habits }),
  });
}

/** Optimistic: the row checks off (and the streak bumps) instantly, rolling back on failure. */
export function useLogHabit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: HabitsApi.log,
    meta: { errorFallback: 'Failed to check in' },
    onMutate: async (id: string) => {
      await qc.cancelQueries({ queryKey: qk.habits });
      const previous = qc.getQueryData<HabitDTO[]>(qk.habits);
      qc.setQueryData<HabitDTO[]>(qk.habits, (habits) =>
        habits?.map((h) =>
          h.id === id
            ? {
                ...h,
                doneToday: true,
                todayCount: h.todayCount + 1,
                // First check-in of the day extends the streak; the server
                // recomputes the real value on settle.
                streak: h.doneToday ? h.streak : h.streak + 1,
              }
            : h,
        ),
      );
      return { previous };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.previous) qc.setQueryData(qk.habits, ctx.previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: qk.habits }),
  });
}

export function useDeleteHabit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: HabitsApi.remove,
    meta: { success: 'Habit archived', errorFallback: 'Failed to archive habit' },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.habits }),
  });
}
