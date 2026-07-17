import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ChatMessageDTO } from '@atlas/shared';
import { AiApi } from '@/lib/api';

export const aiKeys = {
  status: ['ai', 'status'] as const,
  insights: ['ai', 'insights'] as const,
};

export function useAiStatus() {
  return useQuery({ queryKey: aiKeys.status, queryFn: AiApi.status, retry: false });
}

export function useConnectDeepSeek() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (apiKey: string) => AiApi.connectDeepSeek(apiKey),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: aiKeys.status }),
  });
}

export function useChat() {
  return useMutation({
    mutationFn: ({ message, history }: { message: string; history: ChatMessageDTO[] }) =>
      AiApi.chat(message, history),
  });
}

export function useBrainDump() {
  return useMutation({
    mutationFn: (text: string) => AiApi.brainDump(text),
  });
}

export function useInsights() {
  return useQuery({ queryKey: aiKeys.insights, queryFn: AiApi.insights });
}

export function useGenerateDailyBrief() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: AiApi.dailyBrief,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: aiKeys.insights }),
  });
}
