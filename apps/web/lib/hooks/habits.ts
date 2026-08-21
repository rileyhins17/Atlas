'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { HabitDTO, UpdateHabitInput } from '@atlas/shared';
import { HabitsApi } from '@/lib/api';
import { qk } from './keys';
import { useInvalidatingMutation } from './mutation';

export function useHabits() {
  return useQuery({ queryKey: qk.habits, queryFn: HabitsApi.list });
}

/** Day-keyed check-in history for heatmaps / week grids. */
export function useHabitHistory(days: number) {
  return useQuery({ queryKey: qk.habitHistory(days), queryFn: () => HabitsApi.history(days) });
}

export function useCreateHabit() {
  return useInvalidatingMutation({
    mutationFn: HabitsApi.create,
    invalidates: qk.habits,
    success: 'Habit added',
    errorFallback: 'Failed to add habit',
  });
}

export function useUpdateHabit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; patch: UpdateHabitInput }) =>
      HabitsApi.update(args.id, args.patch),
    meta: { success: 'Habit updated', errorFallback: 'Failed to update habit' },
    // Changing `target` re-decides which days count as done, so the heatmap and
    // the week dots have to refetch as well as the list. One call covers both:
    // qk.habitHistory(days) is ['habits','history',days], and invalidation
    // matches on key PREFIX — ['habits'] takes the history with it.
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
  return useInvalidatingMutation({
    mutationFn: HabitsApi.remove,
    invalidates: qk.habits,
    success: 'Habit archived',
    errorFallback: 'Failed to archive habit',
  });
}
