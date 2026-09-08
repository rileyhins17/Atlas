export { parseChatCompletion, type ChatToolCall, type ChatMessage, type ChatUsage, type ChatResult, type EmbedResult } from '@atlas/shared';

// Cancellation belongs to the HTTP client boundary, not the shared parser.
export interface ChatOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  /** JSON-Schema tool specs to expose to the model (OpenAI-compatible shape). */
  tools?: unknown[];
  signal?: AbortSignal;
}

export interface EmbedOptions {
  model?: string;
  /** Truncate output to this many dimensions (OpenAI v3 embedding models support this). */
  dimensions?: number;
  signal?: AbortSignal;
}
