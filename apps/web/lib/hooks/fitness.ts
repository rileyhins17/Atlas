'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { WorkoutDTO } from '@atlas/shared';
import { FitnessApi } from '@/lib/api';
import { qk } from './keys';

/**
 * Every mutation returns the whole updated workout, so the active-session cache
 * is SET from the response rather than invalidated-and-refetched. Logging a set
 * mid-workout has to feel instant, and a refetch round-trip between "tap" and
 * "the set appears" is exactly the lag that makes a gym app annoying to use.
 */
function useWorkoutMutation<TArgs>(
  fn: (args: TArgs) => Promise<WorkoutDTO | null>,
  meta: { success?: string; errorFallback: string },
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    meta,
    onSuccess: (workout) => {
      // A finished (or discarded) session is no longer THE ACTIVE ONE. Writing
      // the finished workout back into this slot would leave the logger on
      // screen forever, since the panel renders whenever the slot is truthy.
      const stillOpen = workout !== null && workout.endedAt === null;
      qc.setQueryData(qk.activeWorkout, stillOpen ? workout : null);

      if (!stillOpen) {
        // It has joined history, and its sets are now "last time" for those
        // movements — both caches are stale.
        void qc.invalidateQueries({ queryKey: qk.workouts });
        void qc.invalidateQueries({ queryKey: ['fitness', 'last'] });
        void qc.invalidateQueries({ queryKey: ['timeline'] });
      }
    },
  });
}

export function useExercises() {
  return useQuery({
    queryKey: qk.exercises,
    queryFn: FitnessApi.exercises,
    // The catalog is seeded server-side and barely changes.
    staleTime: 10 * 60_000,
  });
}

export function useCreateExercise() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: FitnessApi.createExercise,
    meta: { success: 'Exercise added', errorFallback: 'Failed to add exercise' },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.exercises }),
  });
}

export function useActiveWorkout() {
  return useQuery({ queryKey: qk.activeWorkout, queryFn: FitnessApi.active });
}

export function useWorkoutHistory() {
  return useQuery({ queryKey: qk.workouts, queryFn: () => FitnessApi.history() });
}

/** What you did last time on a movement — the target for today's sets. */
export function useLastPerformance(exerciseId: string | null) {
  return useQuery({
    queryKey: qk.lastPerformance(exerciseId ?? 'none'),
    queryFn: () => FitnessApi.lastPerformance(exerciseId!),
    enabled: exerciseId !== null,
  });
}

export function useStartWorkout() {
  return useWorkoutMutation(FitnessApi.start, {
    success: 'Workout started',
    errorFallback: 'Failed to start workout',
  });
}

export function useLogSet(workoutId: string | undefined) {
  return useWorkoutMutation(
    (input: Parameters<typeof FitnessApi.logSet>[1]) => FitnessApi.logSet(workoutId!, input),
    { errorFallback: 'Failed to log set' },
  );
}

export function useDeleteSet(workoutId: string | undefined) {
  return useWorkoutMutation((setId: string) => FitnessApi.deleteSet(workoutId!, setId), {
    errorFallback: 'Failed to remove set',
  });
}

export function useFinishWorkout(workoutId: string | undefined) {
  return useWorkoutMutation(
    (input: { notes?: string }) => FitnessApi.finish(workoutId!, input),
    { success: 'Workout saved', errorFallback: 'Failed to finish workout' },
  );
}

/** The user's saved days — "Push", "Pull", "Legs". */
export function useWorkoutTemplates() {
  return useQuery({ queryKey: qk.workoutTemplates, queryFn: FitnessApi.templates });
}

export function useCreateTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: FitnessApi.createTemplate,
    meta: { success: 'Workout day saved', errorFallback: 'Failed to save workout day' },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.workoutTemplates }),
  });
}

export function useUpdateTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: { name?: string; exerciseIds?: string[] } }) =>
      FitnessApi.updateTemplate(id, patch),
    meta: { success: 'Workout day updated', errorFallback: 'Failed to update workout day' },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.workoutTemplates }),
  });
}

export function useDeleteTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: FitnessApi.removeTemplate,
    meta: { success: 'Workout day removed', errorFallback: 'Failed to remove workout day' },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.workoutTemplates }),
  });
}

/** Read a written split into proposals. Deliberately no `meta.success` — the
 *  result is a proposal to review, not a change worth announcing. */
export function usePlanSplit() {
  return useMutation({
    mutationFn: FitnessApi.planSplit,
    meta: { errorFallback: 'Could not read that split' },
  });
}

export function useApplySplit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: FitnessApi.applySplit,
    meta: { success: 'Your workout days are set up', errorFallback: 'Failed to save your split' },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.workoutTemplates });
      void qc.invalidateQueries({ queryKey: qk.exercises });
    },
  });
}
