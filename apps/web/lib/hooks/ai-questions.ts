'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AiQuestionsApi } from '@/lib/api';
import { qk } from './keys';

export function useAiQuestions() {
  return useQuery({ queryKey: qk.aiQuestions, queryFn: AiQuestionsApi.list });
}

export function useAnswerQuestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, answer }: { id: string; answer: string }) =>
      AiQuestionsApi.answer(id, answer),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.aiQuestions }),
  });
}

export function useDismissQuestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: AiQuestionsApi.dismiss,
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.aiQuestions }),
  });
}
