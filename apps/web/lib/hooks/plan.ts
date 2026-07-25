'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { PlanApi } from '@/lib/api';
import { qk } from './keys';

/**
 * Ask Atlas to propose a plan. This is a mutation rather than a query because
 * it costs a model call — it must happen when the user asks for it, never on
 * render or refocus.
 */
export function usePlanDay() {
  return useMutation({
    mutationFn: PlanApi.planDay,
    meta: { errorFallback: "Couldn't put a plan together" },
  });
}

/**
 * Accepting a proposal creates a real calendar event through the normal path.
 *
 * The block carries `taskId`, which is what lets Atlas learn how long the work
 * actually took: the block says when you started, completing the task says when
 * you stopped. Without the link the two facts are unconnectable and the planner
 * is stuck guessing forever.
 */
export function useAcceptProposal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { taskId: string; title: string; startAt: string; endAt: string }) => {
      const { EventsApi } = await import('@/lib/api');
      return EventsApi.create(p);
    },
    meta: { success: 'Added to your day', errorFallback: 'Failed to add that block' },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.events });
      void qc.invalidateQueries({ queryKey: ['events', 'day'] });
      void qc.invalidateQueries({ queryKey: ['timeline'] });
    },
  });
}
