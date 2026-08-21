'use client';

import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { ChatMessageDTO } from '@atlas/shared';
import { AiApi } from '@/lib/api';
import { qk } from './keys';
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

export function useBrainDump() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: AiApi.brainDump,
    onSuccess: () => invalidateUserData(qc),
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
