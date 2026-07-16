import { z } from 'zod';
import type { Connector, ConnectorContext } from './connector.js';

export const OpenRouterCredentialSchema = z.object({
  apiKey: z.string().min(1),
});

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  tool_call_id?: string;
}

export interface ChatUsage {
  promptTokens: number;
  completionTokens: number;
}

export interface ChatResult {
  content: string;
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

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = 'deepseek/deepseek-chat';

/**
 * OpenRouter connector. Doubles as Atlas's AI provider: besides the standard
 * Connector methods it exposes `chat()` used by the AI orchestrator.
 *
 * NOTE: `chat()` actually spends money. All production callers must go through
 * the cost guard in @atlas/ai, never call this directly.
 */
export class OpenRouterConnector implements Connector {
  readonly id = 'openrouter';
  readonly label = 'OpenRouter (DeepSeek)';
  readonly credentialSchema = OpenRouterCredentialSchema;
  readonly capabilities = ['ai.chat'] as const;

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

    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
      model?: string;
    };

    return {
      content: data.choices?.[0]?.message?.content ?? '',
      usage: {
        promptTokens: data.usage?.prompt_tokens ?? 0,
        completionTokens: data.usage?.completion_tokens ?? 0,
      },
      model: data.model ?? model,
      raw: data,
    };
  }
}
