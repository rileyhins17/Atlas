'use client';

import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { ChatMessageDTO } from '@atlas/shared';
import { AiApi, errorMessage } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';
import { qk } from './keys';
import { useCaptureFallback } from './capture-fallback';
import { useInvalidatingMutation } from './mutation';

/**
 * Chat and brain-dump run tools that can write into any domain (tasks,
 * journal, notes, calendar, questions) and always burn tokens, so after one
 * completes every user-scoped query is refetched on next render.
 */
function invalidateUserData(qc: QueryClient): void {
  void qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'auth' });
}

export function useAiStatus() {
  return useQuery({ queryKey: qk.aiStatus, queryFn: AiApi.status });
}

export function useConnectDeepSeek() {
  return useInvalidatingMutation({
    mutationFn: AiApi.connectDeepSeek,
    invalidates: qk.aiStatus,
    success: 'DeepSeek connected',
    errorFallback: 'Failed to save key',
  });
}

export function useChat() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ message, history }: { message: string; history: ChatMessageDTO[] }) =>
      AiApi.chat(message, history),
    onSuccess: () => invalidateUserData(qc),
  });
}

/**
 * Capture, and what happens when there is no AI to route it through.
 *
 * The cold-start fallback lives HERE, in the hook, rather than in a callback
 * passed to `mutate()`. Those callbacks are fire-and-forget: TanStack only runs
 * them while the observer that issued the call still has listeners, so anything
 * that unmounts loses them. The command bar closes itself on the same tick it
 * captures, and the dock's own handler was measured never firing at all — a new
 * account typing "gym at 6" got the raw 424 ("Atlas AI needs an API key") and
 * NOTHING written, which is precisely the day-one failure the fallback exists
 * to prevent. A hook-level onError always runs, and both capture surfaces get
 * the same behaviour without either of them having to remember.
 *
 * It owns the error toast too (`ownErrorToast`), because the global handler in
 * providers.tsx would otherwise announce the 424 the fallback just recovered
 * from — two toasts, and the wrong one on top.
 */
export function useBrainDump() {
  const qc = useQueryClient();
  const fileLocally = useCaptureFallback();
  const { toast } = useToast();
  return useMutation({
    mutationFn: AiApi.brainDump,
    meta: { ownErrorToast: true },
    onSuccess: () => invalidateUserData(qc),
    onError: async (err, text) => {
      const said = await fileLocally(text, err).catch(() => null);
      if (said) toast(said, 'success');
      else toast(errorMessage(err, 'Atlas could not file that'), 'error');
    },
  });
}

export function useInsights() {
  return useQuery({ queryKey: qk.insights, queryFn: AiApi.insights });
}

/**
 * Ask for a weekly review now.
 *
 * The proactive engine writes one on a schedule, but until this existed there
 * was no way to REQUEST one — a new account, or one with proactive turned off,
 * saw an empty Progress page with nothing to press.
 */
export function useGenerateWeeklyReview() {
  return useInvalidatingMutation({
    mutationFn: AiApi.weeklyReview,
    invalidates: qk.insights,
    errorFallback: 'Could not write your review',
  });
}

export function useGenerateDailyBrief() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: AiApi.dailyBrief,
    onSuccess: () => invalidateUserData(qc),
  });
}
