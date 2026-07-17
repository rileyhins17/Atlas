import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AiQuestionDTO } from '@atlas/shared';
import { AiQuestionsApi } from '@/lib/api';

export const aiQuestionKeys = {
  list: ['ai', 'questions'] as const,
};

export function useAiQuestions() {
  return useQuery({ queryKey: aiQuestionKeys.list, queryFn: AiQuestionsApi.list });
}

export function useAnswerAiQuestion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ question, answer }: { question: AiQuestionDTO; answer: string }) =>
      AiQuestionsApi.answer(question.id, answer),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: aiQuestionKeys.list }),
  });
}

export function useDismissAiQuestion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (question: AiQuestionDTO) => AiQuestionsApi.dismiss(question.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: aiQuestionKeys.list }),
  });
}
