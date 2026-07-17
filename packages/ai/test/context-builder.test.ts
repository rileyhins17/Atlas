import { describe, expect, it } from 'vitest';
import type { AiContextChunk } from '@atlas/shared';
import { buildContext, estimateTokens } from '../src/context-builder.js';

function chunk(source: string, content: string): AiContextChunk {
  return { source, title: source, content, tokensEstimate: estimateTokens(content) };
}

describe('estimateTokens', () => {
  it('estimates ~4 chars per token, rounding up', () => {
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('abcde')).toBe(2);
    expect(estimateTokens('')).toBe(0);
  });
});

describe('buildContext', () => {
  it('includes all chunks when the budget is large enough', () => {
    const built = buildContext([chunk('tasks', 'a'.repeat(40)), chunk('habits', 'b'.repeat(40))], 1000);
    expect(built.includedSources).toEqual(['tasks', 'habits']);
    expect(built.droppedSources).toEqual([]);
    expect(built.text).toContain('## tasks (tasks)');
    expect(built.text).toContain('## habits (habits)');
  });

  it('drops chunks that would exceed the token budget', () => {
    const small = chunk('tasks', 'a'.repeat(20));
    const huge = chunk('journal', 'x'.repeat(4000));
    const budget = estimateTokens(`## tasks (tasks)\n${'a'.repeat(20)}`) + 5;
    const built = buildContext([small, huge], budget);
    expect(built.includedSources).toEqual(['tasks']);
    expect(built.droppedSources).toEqual(['journal']);
    expect(built.text).not.toContain('journal');
  });

  it('respects the budget: tokensEstimate never exceeds it', () => {
    const chunks = ['a', 'b', 'c', 'd'].map((s) => chunk(s, s.repeat(100)));
    const budget = 40;
    const built = buildContext(chunks, budget);
    expect(built.tokensEstimate).toBeLessThanOrEqual(budget);
    expect(built.includedSources.length + built.droppedSources.length).toBe(chunks.length);
  });

  it('can still include a later smaller chunk after dropping a big one', () => {
    const big = chunk('big', 'x'.repeat(4000));
    const small = chunk('small', 'y'.repeat(20));
    const built = buildContext([big, small], 50);
    expect(built.droppedSources).toEqual(['big']);
    expect(built.includedSources).toEqual(['small']);
  });

  it('returns empty output for no chunks', () => {
    const built = buildContext([], 100);
    expect(built.text).toBe('');
    expect(built.tokensEstimate).toBe(0);
    expect(built.includedSources).toEqual([]);
    expect(built.droppedSources).toEqual([]);
  });
});
