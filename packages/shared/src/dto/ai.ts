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

/**
 * How to reverse one thing Atlas did.
 *
 * Expressed as a call against Atlas's own REST API, and built ENTIRELY on the
 * server from the row that was actually written — the model never supplies a
 * path or a body. The client replays it with its own session, so an undo can
 * only ever reach data that session could already reach.
 */
export const AiUndoStepDTO = z.object({
  /** "Created task \"Buy milk\"" — what is being undone, in plain words. */
  label: z.string(),
  method: z.enum(['POST', 'PATCH', 'DELETE']),
  /** Server-generated, e.g. "/tasks/abc123". */
  path: z.string(),
  body: z.record(z.unknown()).nullable(),
});
export type AiUndoStepDTO = z.infer<typeof AiUndoStepDTO>;

export const ToolExecutionDTO = z.object({
  name: z.string(),
  arguments: z.string(),
  result: z.string(),
  ok: z.boolean(),
  /** Plain-language summary of the change, e.g. "Moved Standup to 4:00 PM". */
  summary: z.string().nullable().default(null),
  /** Null when the action is not reversible (a read, or a log entry). */
  undo: AiUndoStepDTO.nullable().default(null),
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

// Saving an AI provider's API key. Embeddings run locally and need no key, so
// this is only the chat provider (DeepSeek).
export const ConnectProviderInput = z.object({
  apiKey: z.string().min(10).max(300),
});
export type ConnectProviderInput = z.infer<typeof ConnectProviderInput>;

export const InsightDTO = z.object({
  id: z.string(),
  kind: z.string(),
  title: z.string(),
  body: z.string(),
  createdAt: z.string(),
});
export type InsightDTO = z.infer<typeof InsightDTO>;

/**
 * "Plan my day" — the model PROPOSES; nothing is written until the user accepts.
 * That separation is the whole safety story: a wrong suggestion costs a glance,
 * never a corrupted calendar.
 */
export const PlanDayInput = z.object({
  /** The windows the client computed from the routine, in ISO. */
  gaps: z
    .array(
      z.object({
        startAt: z.coerce.date(),
        endAt: z.coerce.date(),
      }),
    )
    .min(1)
    .max(12),
});
export type PlanDayInput = z.infer<typeof PlanDayInput>;

export const PlanProposalDTO = z.object({
  /** The task this slot is for. Always an EXISTING task id — never invented. */
  taskId: z.string(),
  title: z.string(),
  startAt: z.string(),
  endAt: z.string(),
  /** One short sentence: why here. Shown under the proposal. */
  why: z.string(),
});
export type PlanProposalDTO = z.infer<typeof PlanProposalDTO>;

export const PlanDayDTO = z.object({
  proposals: z.array(PlanProposalDTO),
  /** Set when the model declined to plan — e.g. nothing to schedule. */
  note: z.string().nullable(),
});
export type PlanDayDTO = z.infer<typeof PlanDayDTO>;
