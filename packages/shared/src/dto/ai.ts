import { z } from 'zod';

// Answer to one of Atlas's questions (the self-curation loop).
export const AnswerQuestionInput = z.object({
  answer: z.string().min(1).max(5_000),
});
export type AnswerQuestionInput = z.infer<typeof AnswerQuestionInput>;
