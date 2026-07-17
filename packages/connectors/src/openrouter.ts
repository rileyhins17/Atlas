import { z } from 'zod';
import type { Connector, ConnectorContext } from './connector.js';
import {
  parseChatCompletion,
  type ChatMessage,
  type ChatOptions,
  type ChatResult,
  type EmbedOptions,
  type EmbedResult,
} from './chat.js';

export const OpenRouterCredentialSchema = z.object({
  apiKey: z.string().min(1),
});

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_EMBEDDINGS_URL = 'https://openrouter.ai/api/v1/embeddings';
const DEFAULT_MODEL = 'deepseek/deepseek-chat';
const DEFAULT_EMBED_MODEL = 'openai/text-embedding-3-small';
const DEFAULT_EMBED_DIMENSIONS = 768;

/**
 * OpenRouter connector. Doubles as an AI provider: besides the standard
 * Connector methods it exposes `chat()`/`embed()` used by the AI orchestrator.
 * OpenRouter is the only provider Atlas currently uses for embeddings (DeepSeek
 * direct has no embeddings API) — connect it even if chat goes via DeepSeek
 * direct, if you want semantic memory backfill to work.
 *
 * NOTE: `chat()`/`embed()` actually spend money. All production callers must
 * go through the cost guard in @atlas/ai, never call these directly.
 */
export class OpenRouterConnector implements Connector {
  readonly id = 'openrouter';
  readonly label = 'OpenRouter (DeepSeek)';
  readonly credentialSchema = OpenRouterCredentialSchema;
  readonly capabilities = ['ai.chat', 'ai.embed'] as const;

  private async apiKey(ctx: ConnectorContext): Promise<string> {
    const secret = await ctx.getSecret();
    const parsed = OpenRouterCredentialSchema.safeParse(secret);
    if (!parsed.success) {
      throw new Error('OpenRouter credential missing or invalid. Add an API key in Settings.');
    }
    return parsed.data.apiKey;
  }

  async verify(ctx: ConnectorContext): Promise<boolean> {
    try {
      await this.apiKey(ctx);
      return true;
    } catch {
      return false;
    }
  }

  async chat(
    ctx: ConnectorContext,
    messages: ChatMessage[],
    opts: ChatOptions = {},
  ): Promise<ChatResult> {
    const apiKey = await this.apiKey(ctx);
    const model = opts.model ?? DEFAULT_MODEL;

    const res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        // Optional attribution headers OpenRouter recommends.
        'X-Title': 'Atlas Life OS',
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: opts.temperature ?? 0.4,
        max_tokens: opts.maxTokens,
        tools: opts.tools,
      }),
      signal: opts.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`OpenRouter error ${res.status}: ${text.slice(0, 500)}`);
    }

    return parseChatCompletion(await res.json(), model);
  }

  /**
   * Embed text for semantic retrieval (see MemoryService + the pgvector column).
   * Requests `dimensions` explicitly so output matches the fixed-width `vector`
   * column — do not change one without the other.
   */
  async embed(
    ctx: ConnectorContext,
    input: string[],
    opts: EmbedOptions = {},
  ): Promise<EmbedResult> {
    const apiKey = await this.apiKey(ctx);
    const model = opts.model ?? DEFAULT_EMBED_MODEL;
    const dimensions = opts.dimensions ?? DEFAULT_EMBED_DIMENSIONS;

    const res = await fetch(OPENROUTER_EMBEDDINGS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'X-Title': 'Atlas Life OS',
      },
      body: JSON.stringify({ model, input, dimensions }),
      signal: opts.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`OpenRouter embeddings error ${res.status}: ${text.slice(0, 500)}`);
    }

    const data = (await res.json()) as {
      data?: { embedding: number[] }[];
      usage?: { prompt_tokens?: number };
      model?: string;
    };

    return {
      embeddings: (data.data ?? []).map((d) => d.embedding),
      usage: { promptTokens: data.usage?.prompt_tokens ?? 0 },
      model: data.model ?? model,
    };
  }
}
