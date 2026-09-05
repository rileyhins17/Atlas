import { describe, expect, it, vi } from 'vitest';
import { runToolLoop } from '../src/orchestrator.js';
import type { ChatResult } from '@atlas/connectors';

const usage = { promptTokens: 1, completionTokens: 1, cachedPromptTokens: 0 };

const reply = (content: string): ChatResult => ({
  content,
  toolCalls: [],
  model: 'test',
  finishReason: 'stop',
  usage,
  raw: null,
});

const callsFor = (specs: { name: string; args?: unknown }[]): ChatResult => ({
  content: '',
  toolCalls: specs.map((s, i) => ({
    id: `c${i}`,
    type: 'function' as const,
    function: { name: s.name, arguments: JSON.stringify(s.args ?? {}) },
  })),
  model: 'test',
  finishReason: 'tool_calls',
  usage,
  raw: null,
});

const TOOLS = [
  { name: 'tasks.create', description: 'create', parameters: { type: 'object', properties: {} } },
];

describe('the tool loop cannot be talked into doing too much', () => {
  /**
   * Iterations were capped and calls per iteration were not, so one turn
   * returning fifty tool calls executed all fifty.
   */
  it('runs at most eight tools from one turn', async () => {
    const executeTool = vi.fn(async () => ({ result: { ok: true } }));
    let turn = 0;
    await runToolLoop({
      messages: [],
      tools: TOOLS,
      chat: async () => {
        turn += 1;
        if (turn === 1) {
          return callsFor(Array.from({ length: 20 }, (_, i) => ({ name: 'tasks.create', args: { i } })));
        }
        return reply('done');
      },
      executeTool,
    });
    expect(executeTool).toHaveBeenCalledTimes(8);
  });

  /** Every tool_call still gets a tool message back, or the protocol breaks. */
  it('answers the calls it refused to run', async () => {
    const seen: { role: string; content?: string }[] = [];
    let turn = 0;
    await runToolLoop({
      messages: [],
      tools: TOOLS,
      chat: async (messages) => {
        turn += 1;
        if (turn === 1) {
          return callsFor(Array.from({ length: 10 }, (_, i) => ({ name: 'tasks.create', args: { i } })));
        }
        seen.push(...messages);
        return reply('done');
      },
      executeTool: async () => ({ result: { ok: true } }),
    });
    const toolMessages = seen.filter((m) => m.role === 'tool');
    expect(toolMessages).toHaveLength(10);
    expect(toolMessages.filter((m) => m.content?.includes('Too many tools'))).toHaveLength(2);
  });
});

describe('the same write is not applied twice', () => {
  it('runs an identical call once, however many times it is asked for', async () => {
    const executeTool = vi.fn(async () => ({ result: { ok: true }, summary: 'Made a task' }));
    let turn = 0;
    const res = await runToolLoop({
      messages: [],
      tools: TOOLS,
      chat: async () => {
        turn += 1;
        if (turn <= 3) return callsFor([{ name: 'tasks.create', args: { title: 'Buy milk' } }]);
        return reply('done');
      },
      executeTool,
    });
    expect(executeTool).toHaveBeenCalledTimes(1);
    expect(res.toolExecutions).toHaveLength(1);
  });

  /** The model does not emit keys in a stable order. */
  it('treats reordered arguments as the same call', async () => {
    const executeTool = vi.fn(async () => ({ result: { ok: true } }));
    let turn = 0;
    await runToolLoop({
      messages: [],
      tools: TOOLS,
      chat: async () => {
        turn += 1;
        if (turn === 1) return callsFor([{ name: 'tasks.create', args: { a: 1, b: 2 } }]);
        if (turn === 2) return callsFor([{ name: 'tasks.create', args: { b: 2, a: 1 } }]);
        return reply('done');
      },
      executeTool,
    });
    expect(executeTool).toHaveBeenCalledTimes(1);
  });

  it('still runs a genuinely different call', async () => {
    const executeTool = vi.fn(async () => ({ result: { ok: true } }));
    let turn = 0;
    await runToolLoop({
      messages: [],
      tools: TOOLS,
      chat: async () => {
        turn += 1;
        if (turn === 1) return callsFor([{ name: 'tasks.create', args: { title: 'Milk' } }]);
        if (turn === 2) return callsFor([{ name: 'tasks.create', args: { title: 'Bread' } }]);
        return reply('done');
      },
      executeTool,
    });
    expect(executeTool).toHaveBeenCalledTimes(2);
  });

  /** A transient failure must stay retryable. */
  it('lets a failed call be tried again', async () => {
    const executeTool = vi
      .fn()
      .mockRejectedValueOnce(new Error('network blip'))
      .mockResolvedValue({ result: { ok: true } });
    let turn = 0;
    await runToolLoop({
      messages: [],
      tools: TOOLS,
      chat: async () => {
        turn += 1;
        if (turn <= 2) return callsFor([{ name: 'tasks.create', args: { title: 'Milk' } }]);
        return reply('done');
      },
      executeTool,
    });
    expect(executeTool).toHaveBeenCalledTimes(2);
  });
});

describe('a provider failure does not lose what was already done', () => {
  /**
   * The writes have already happened. Throwing out of the loop threw the record
   * of them away too, so "What Atlas changed" never rendered and the undo for a
   * real database write was unreachable.
   */
  it('returns the executions it managed, and says so', async () => {
    let turn = 0;
    const res = await runToolLoop({
      messages: [],
      tools: TOOLS,
      chat: async () => {
        turn += 1;
        if (turn === 1) return callsFor([{ name: 'tasks.create', args: { title: 'Milk' } }]);
        throw new Error('DeepSeek error 503');
      },
      executeTool: async () => ({ result: { ok: true }, summary: 'Created "Milk"' }),
    });

    expect(res.toolExecutions).toHaveLength(1);
    expect(res.toolExecutions[0]!.summary).toBe('Created "Milk"');
    expect(res.content).toContain('already made');
    expect(res.content).toContain('503');
  });

  /**
   * A failure before anything ran is the whole answer, and it has to reach the
   * boundary. Swallowing it turns a 424 "Atlas AI needs an API key" into a 200
   * with an apology in it — which disarms the local capture fallback, so a
   * brand-new account's very first capture writes nothing at all. That is the
   * most expensive bug this project has shipped, and this is what stops it
   * coming back through the tool loop.
   */
  it('rethrows when nothing had been applied, so typed errors survive', async () => {
    await expect(
      runToolLoop({
        messages: [],
        tools: TOOLS,
        chat: async () => {
          throw new Error('Atlas AI needs an API key');
        },
        executeTool: async () => ({ result: {} }),
      }),
    ).rejects.toThrow(/needs an API key/);
  });
});
