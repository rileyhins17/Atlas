import { describe, expect, it, vi } from 'vitest';
import type { ChatResult } from '@atlas/connectors';
import type { AiToolSpec } from '@atlas/shared';
import { runToolLoop } from '../src/orchestrator.js';

const TOOL: AiToolSpec = {
  name: 'tasks.create',
  description: 'Create a task',
  parameters: { type: 'object', properties: { title: { type: 'string' } }, required: ['title'] },
};

function chatResult(overrides: Partial<ChatResult>): ChatResult {
  return {
    content: '',
    usage: { promptTokens: 10, completionTokens: 5, cachedPromptTokens: 2 },
    model: 'test-model',
    raw: {},
    ...overrides,
  };
}

describe('runToolLoop', () => {
  it('returns the final answer directly when the model calls no tools', async () => {
    const chat = vi.fn().mockResolvedValue(chatResult({ content: 'Hello!' }));
    const executeTool = vi.fn();

    const result = await runToolLoop({
      messages: [{ role: 'user', content: 'hi' }],
      tools: [],
      chat,
      executeTool,
    });

    expect(result.content).toBe('Hello!');
    expect(result.toolExecutions).toEqual([]);
    expect(result.usage).toEqual({ promptTokens: 10, completionTokens: 5, cachedPromptTokens: 2 });
    expect(chat).toHaveBeenCalledTimes(1);
    expect(executeTool).not.toHaveBeenCalled();
  });

  it('does not pass a tools payload when no tool specs are given', async () => {
    const chat = vi.fn().mockResolvedValue(chatResult({ content: 'ok' }));
    await runToolLoop({ messages: [{ role: 'user', content: 'hi' }], tools: [], chat, executeTool: vi.fn() });
    expect(chat).toHaveBeenCalledWith(expect.any(Array), undefined);
  });

  it('executes a tool call, feeds the result back, and returns the follow-up answer', async () => {
    const chat = vi
      .fn()
      .mockResolvedValueOnce(
        chatResult({
          toolCalls: [{ id: 'call_1', type: 'function', function: { name: 'tasks__create', arguments: '{"title":"Buy milk"}' } }],
        }),
      )
      .mockResolvedValueOnce(chatResult({ content: 'Added "Buy milk" to your tasks.' }));
    const executeTool = vi.fn().mockResolvedValue({ id: 'task_1', title: 'Buy milk' });

    const result = await runToolLoop({
      messages: [{ role: 'user', content: 'add buy milk to my tasks' }],
      tools: [TOOL],
      chat,
      executeTool,
    });

    expect(executeTool).toHaveBeenCalledWith('tasks.create', { title: 'Buy milk' });
    expect(result.content).toBe('Added "Buy milk" to your tasks.');
    expect(result.toolExecutions).toEqual([
      { name: 'tasks.create', arguments: '{"title":"Buy milk"}', result: JSON.stringify({ id: 'task_1', title: 'Buy milk' }), ok: true },
    ]);
    // usage accumulates across both round-trips, cache hits included
    expect(result.usage).toEqual({ promptTokens: 20, completionTokens: 10, cachedPromptTokens: 4 });
    expect(chat).toHaveBeenCalledTimes(2);
  });

  it('records a failed tool execution without throwing, and reports it back to the model', async () => {
    const chat = vi
      .fn()
      .mockResolvedValueOnce(
        chatResult({
          toolCalls: [{ id: 'call_1', type: 'function', function: { name: 'tasks__create', arguments: '{}' } }],
        }),
      )
      .mockResolvedValueOnce(chatResult({ content: 'Something went wrong creating that task.' }));
    const executeTool = vi.fn().mockRejectedValue(new Error('title is required'));

    const result = await runToolLoop({
      messages: [{ role: 'user', content: 'add a task' }],
      tools: [TOOL],
      chat,
      executeTool,
    });

    expect(result.toolExecutions).toEqual([
      { name: 'tasks.create', arguments: '{}', result: JSON.stringify({ error: 'title is required' }), ok: false },
    ]);
    // the tool's error result gets fed back to the model as a tool message
    const secondCallMessages = chat.mock.calls[1]![0];
    expect(secondCallMessages.at(-1)).toEqual({
      role: 'tool',
      content: JSON.stringify({ error: 'title is required' }),
      tool_call_id: 'call_1',
      name: 'tasks__create',
    });
  });

  it('handles malformed tool-call argument JSON as a failed execution', async () => {
    const chat = vi
      .fn()
      .mockResolvedValueOnce(
        chatResult({
          toolCalls: [{ id: 'call_1', type: 'function', function: { name: 'tasks__create', arguments: '{not json' } }],
        }),
      )
      .mockResolvedValueOnce(chatResult({ content: 'done' }));
    const executeTool = vi.fn();

    const result = await runToolLoop({
      messages: [{ role: 'user', content: 'x' }],
      tools: [TOOL],
      chat,
      executeTool,
    });

    expect(executeTool).not.toHaveBeenCalled();
    expect(result.toolExecutions[0]!.ok).toBe(false);
    expect(JSON.parse(result.toolExecutions[0]!.result)).toEqual({ error: 'Malformed tool arguments JSON' });
  });

  it('stops after maxIterations if the model keeps calling tools', async () => {
    const chat = vi.fn().mockResolvedValue(
      chatResult({
        toolCalls: [{ id: 'call_x', type: 'function', function: { name: 'tasks__create', arguments: '{"title":"x"}' } }],
      }),
    );
    const executeTool = vi.fn().mockResolvedValue({ ok: true });

    const result = await runToolLoop({
      messages: [{ role: 'user', content: 'loop forever' }],
      tools: [TOOL],
      chat,
      executeTool,
      maxIterations: 2,
    });

    expect(chat).toHaveBeenCalledTimes(2);
    expect(result.content).toContain('iteration limit');
    expect(result.toolExecutions).toHaveLength(2);
  });
});
