import { z } from 'zod';

// Answer to one of Atlas's questions (the self-curation loop).
export const AnswerQuestionInput = z.object({
  answer: z.string().min(1).max(5_000),
});
export type AnswerQuestionInput = z.infer<typeof AnswerQuestionInput>;

// --- Phase 2: the AI brain ---

// Client-side chat transcript round-trip. Only user/assistant turns travel
// over the wire; tool-call bookkeeping stays server-side.
export const ChatMessageDTO = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string(),
});
export type ChatMessageDTO = z.infer<typeof ChatMessageDTO>;

export const ChatInput = z.object({
  message: z.string().min(1).max(8_000),
  history: z.array(ChatMessageDTO).max(20).default([]),
});
export type ChatInput = z.infer<typeof ChatInput>;

export const ToolExecutionDTO = z.object({
  name: z.string(),
  arguments: z.string(),
  result: z.string(),
  ok: z.boolean(),
});
export type ToolExecutionDTO = z.infer<typeof ToolExecutionDTO>;

export const ChatResponseDTO = z.object({
  content: z.string(),
  toolExecutions: z.array(ToolExecutionDTO),
});
export type ChatResponseDTO = z.infer<typeof ChatResponseDTO>;

export const BrainDumpInput = z.object({
  text: z.string().min(1).max(8_000),
});
export type BrainDumpInput = z.infer<typeof BrainDumpInput>;

export const ConnectOpenRouterInput = z.object({
  apiKey: z.string().min(10).max(300),
});
export type ConnectOpenRouterInput = z.infer<typeof ConnectOpenRouterInput>;

export const InsightDTO = z.object({
  id: z.string(),
  kind: z.string(),
  title: z.string(),
  body: z.string(),
  createdAt: z.string(),
});
export type InsightDTO = z.infer<typeof InsightDTO>;
