// Provider-agnostic chat shapes shared by every LLM connector. Kept
// OpenAI-compatible since that's the lowest common denominator every provider
// Atlas might target speaks — today that's DeepSeek direct.

/** A tool call the model wants executed, OpenAI-compatible shape. */
export interface ChatToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  tool_call_id?: string;
  /** Set on an assistant message that requested tool calls. */
  tool_calls?: ChatToolCall[];
}

export interface ChatUsage {
  promptTokens: number;
  completionTokens: number;
  /**
   * Subset of promptTokens the provider served from its prefix cache
   * (DeepSeek's `prompt_cache_hit_tokens`). Billed far cheaper — pass it to the
   * cost guard so spend isn't overstated. 0 when the provider doesn't report it.
   */
  cachedPromptTokens: number;
}

export interface ChatResult {
  content: string;
  /** Present when the model wants to call one or more tools instead of (or alongside) replying. */
  toolCalls?: ChatToolCall[];
  usage: ChatUsage;
  model: string;
  raw: unknown;
}

export interface ChatOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  /** JSON-Schema tool specs to expose to the model (OpenAI-compatible shape). */
  tools?: unknown[];
  signal?: AbortSignal;
}

export interface EmbedResult {
  embeddings: number[][];
  usage: { promptTokens: number };
  model: string;
}

export interface EmbedOptions {
  model?: string;
  /** Truncate output to this many dimensions (OpenAI v3 embedding models support this). */
  dimensions?: number;
  signal?: AbortSignal;
}

/** Shared response parsing for OpenAI-compatible chat/completions APIs. */
export function parseChatCompletion(data: unknown, fallbackModel: string): ChatResult {
  const parsed = data as {
    choices?: { message?: { content?: string | null; tool_calls?: ChatToolCall[] } }[];
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      // DeepSeek reports cache hits at the top level; OpenAI-style APIs nest
      // them under prompt_tokens_details.cached_tokens. Accept either.
      prompt_cache_hit_tokens?: number;
      prompt_tokens_details?: { cached_tokens?: number };
    };
    model?: string;
  };
  const message = parsed.choices?.[0]?.message;
  const usage = parsed.usage;
  return {
    content: message?.content ?? '',
    toolCalls: message?.tool_calls,
    usage: {
      promptTokens: usage?.prompt_tokens ?? 0,
      completionTokens: usage?.completion_tokens ?? 0,
      cachedPromptTokens:
        usage?.prompt_cache_hit_tokens ?? usage?.prompt_tokens_details?.cached_tokens ?? 0,
    },
    model: parsed.model ?? fallbackModel,
    raw: data,
  };
}
