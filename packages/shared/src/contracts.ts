// Framework-agnostic contracts that define how a life-domain module plugs into
// the AI brain. The NestJS base class that modules extend lives in the API
// (apps/api/src/core), but the *shapes* live here so the AI package and the web
// app can reason about them without depending on Nest.

import { z } from 'zod';

/**
 * A compact, token-budgeted view of a module's current state, produced by a
 * module's `aiContext()` and fed to the context builder. Keep `content` short —
 * summaries, not raw dumps.
 */
export interface AiContextChunk {
  /** Module/source id, e.g. "tasks". */
  source: string;
  /** Short human/AI-readable heading. */
  title: string;
  /** The summary text. Should already be trimmed to a small size. */
  content: string;
  /** Rough token estimate so the builder can respect a budget. */
  tokensEstimate: number;
}

/**
 * Wire description of a tool the AI may call. The JSON Schema in `parameters`
 * is what gets sent to the model; the actual handler is registered server-side
 * in the module and is intentionally not part of this shape.
 */
export interface AiToolSpec {
  /** Unique, snake_or_dot.case name, e.g. "tasks.create". */
  name: string;
  description: string;
  /** JSON Schema (draft-07-ish) object describing the arguments. */
  parameters: Record<string, unknown>;
}

/** A single timeline event as exposed to clients / the AI. */
export const TimelineEventDTO = z.object({
  id: z.string(),
  type: z.string(),
  source: z.string(),
  title: z.string(),
  summary: z.string().nullable(),
  refType: z.string().nullable(),
  refId: z.string().nullable(),
  occurredAt: z.string(),
});
export type TimelineEventDTO = z.infer<typeof TimelineEventDTO>;

/** A question the AI is asking the user (the self-curation loop). */
export const AiQuestionDTO = z.object({
  id: z.string(),
  question: z.string(),
  rationale: z.string().nullable(),
  relatesTo: z.string().nullable(),
  status: z.enum(['OPEN', 'ANSWERED', 'DISMISSED']),
  createdAt: z.string(),
});
export type AiQuestionDTO = z.infer<typeof AiQuestionDTO>;
