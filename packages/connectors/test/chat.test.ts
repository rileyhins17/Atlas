import { describe, expect, it } from 'vitest';
import { parseChatCompletion } from '../src/chat.js';

describe('parseChatCompletion', () => {
  it('extracts content, model and usage from a normal completion', () => {
    const res = parseChatCompletion(
      {
        choices: [{ message: { content: 'hello' } }],
        usage: { prompt_tokens: 10, completion_tokens: 4 },
        model: 'deepseek-v4-flash',
      },
      'fallback-model',
    );
    expect(res.content).toBe('hello');
    expect(res.model).toBe('deepseek-v4-flash');
    expect(res.usage).toEqual({ promptTokens: 10, completionTokens: 4, cachedPromptTokens: 0 });
    expect(res.toolCalls).toBeUndefined();
  });

  it("reads DeepSeek's top-level prompt_cache_hit_tokens", () => {
    const res = parseChatCompletion(
      { choices: [{ message: { content: 'x' } }], usage: { prompt_tokens: 100, completion_tokens: 1, prompt_cache_hit_tokens: 64 } },
      'm',
    );
    expect(res.usage.cachedPromptTokens).toBe(64);
  });

  it('reads OpenAI-style nested prompt_tokens_details.cached_tokens', () => {
    const res = parseChatCompletion(
      { choices: [{ message: { content: 'x' } }], usage: { prompt_tokens: 100, completion_tokens: 1, prompt_tokens_details: { cached_tokens: 32 } } },
      'm',
    );
    expect(res.usage.cachedPromptTokens).toBe(32);
  });

  it('surfaces tool calls', () => {
    const toolCalls = [{ id: 'c1', type: 'function' as const, function: { name: 'tasks__create', arguments: '{}' } }];
    const res = parseChatCompletion({ choices: [{ message: { content: null, tool_calls: toolCalls } }] }, 'm');
    expect(res.toolCalls).toEqual(toolCalls);
    // a tool-call-only response has null content; callers expect a string
    expect(res.content).toBe('');
  });

  it('falls back to the requested model id when the response omits one', () => {
    const res = parseChatCompletion({ choices: [{ message: { content: 'x' } }] }, 'requested-model');
    expect(res.model).toBe('requested-model');
  });

  it('defaults usage to zeros when the provider omits it', () => {
    const res = parseChatCompletion({ choices: [{ message: { content: 'x' } }] }, 'm');
    expect(res.usage).toEqual({ promptTokens: 0, completionTokens: 0, cachedPromptTokens: 0 });
  });
});
