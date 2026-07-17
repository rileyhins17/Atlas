import { describe, expect, it } from 'vitest';
import type { AiToolSpec } from '@atlas/shared';
import { fromWireToolName, toOpenAiTools, toWireToolName } from '../src/tools.js';

describe('tool name wire-safety', () => {
  it('replaces dots with double underscores for the wire (DeepSeek rejects dots)', () => {
    expect(toWireToolName('tasks.create')).toBe('tasks__create');
  });

  it('round-trips back to the dotted form', () => {
    expect(fromWireToolName(toWireToolName('ai.ask_question'))).toBe('ai.ask_question');
  });
});

describe('toOpenAiTools', () => {
  it('maps each spec to an OpenAI-compatible function tool with a wire-safe name', () => {
    const specs: AiToolSpec[] = [
      {
        name: 'tasks.create',
        description: 'Create a task',
        parameters: { type: 'object', properties: { title: { type: 'string' } }, required: ['title'] },
      },
    ];
    expect(toOpenAiTools(specs)).toEqual([
      {
        type: 'function',
        function: {
          name: 'tasks__create',
          description: 'Create a task',
          parameters: specs[0]!.parameters,
        },
      },
    ]);
  });

  it('returns an empty array for no specs', () => {
    expect(toOpenAiTools([])).toEqual([]);
  });
});
