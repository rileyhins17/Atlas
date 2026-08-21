'use client';

import { useQuery } from '@tanstack/react-query';
import { AiQuestionsApi } from '@/lib/api';
import { qk } from './keys';
import { useInvalidatingMutation } from './mutation';

export function useAiQuestions() {
  return useQuery({ queryKey: qk.aiQuestions, queryFn: AiQuestionsApi.list });
}

export function useAnswerQuestion() {
  return useInvalidatingMutation({
    mutationFn: ({ id, answer }: { id: string; answer: string }) =>
      AiQuestionsApi.answer(id, answer),
    invalidates: qk.aiQuestions,
    success: 'Answer saved — Atlas will remember it',
    errorFallback: 'Failed to save answer',
  });
}

export function useDismissQuestion() {
  return useInvalidatingMutation({
    mutationFn: AiQuestionsApi.dismiss,
    invalidates: qk.aiQuestions,
  });
}
