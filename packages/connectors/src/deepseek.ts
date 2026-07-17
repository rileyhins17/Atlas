import { z } from 'zod';
import type { Connector, ConnectorContext } from './connector.js';
import { parseChatCompletion, type ChatMessage, type ChatOptions, type ChatResult } from './chat.js';

export const DeepSeekCredentialSchema = z.object({
  apiKey: z.string().min(1),
});

const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';
const DEFAULT_MODEL = 'deepseek-chat';

/**
 * Direct DeepSeek connector — calls api.deepseek.com. Atlas's AI provider for
 * chat, using the standard OpenAI-compatible chat/completions shape.
 *
 * DeepSeek has no embeddings API (`POST /embeddings` 404s), which is why Atlas
 * embeds locally instead — see LocalEmbedder in @atlas/ai.
 *
 * Configure a concrete model id (e.g. "deepseek-v4-flash"), not an alias like
 * "deepseek-chat": the API resolves aliases server-side and echoes the resolved
 * id back, and that's the id the cost guard prices against.
 *
 * NOTE: `chat()` actually spends money. All production callers must go
 * through the cost guard in @atlas/ai, never call this directly.
 */
export class DeepSeekConnector implements Connector {
  readonly id = 'deepseek';
  readonly label = 'DeepSeek (direct)';
  readonly credentialSchema = DeepSeekCredentialSchema;
  readonly capabilities = ['ai.chat'] as const;

  private async apiKey(ctx: ConnectorContext): Promise<string> {
    const secret = await ctx.getSecret();
    const parsed = DeepSeekCredentialSchema.safeParse(secret);
    if (!parsed.success) {
      throw new Error('DeepSeek credential missing or invalid. Add an API key in Settings.');
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

    const res = await fetch(DEEPSEEK_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
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
      throw new Error(`DeepSeek error ${res.status}: ${text.slice(0, 500)}`);
    }

    return parseChatCompletion(await res.json(), model);
  }
}
