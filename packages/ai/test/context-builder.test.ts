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

  it('trims an oversized chunk rather than dropping it whole', () => {
    // A domain that no longer fits still keeps a voice: the AI must never
    // silently reason about a life with an entire domain missing.
    const small = chunk('tasks', 'a'.repeat(20));
    const huge = chunk('journal', 'x'.repeat(4000));
    const built = buildContext([small, huge], 200);
    expect(built.includedSources).toEqual(['tasks', 'journal']);
    expect(built.trimmedSources).toEqual(['journal']);
    expect(built.text).toContain('## journal (journal)');
    expect(built.text).toContain('(trimmed)');
    expect(built.tokensEstimate).toBeLessThanOrEqual(200);
  });

  it('drops a chunk only when there is no room even for its floor', () => {
    const filler = chunk('tasks', 'a'.repeat(4000));
    const late = chunk('journal', 'x'.repeat(400));
    const built = buildContext([filler, late], 120);
    expect(built.droppedSources).toContain('journal');
  });

  it('skips domains that have nothing to report', () => {
    const built = buildContext(
      [chunk('tasks', 'No tasks yet.'), chunk('habits', 'Gym: 3 day streak')],
      1000,
    );
    expect(built.includedSources).toEqual(['habits']);
    expect(built.droppedSources).toEqual(['tasks']);
    expect(built.text).not.toContain('No tasks yet');
  });

  it('respects the budget: tokensEstimate never exceeds it', () => {
    const chunks = ['a', 'b', 'c', 'd'].map((s) => chunk(s, s.repeat(100)));
    const budget = 40;
    const built = buildContext(chunks, budget);
    expect(built.tokensEstimate).toBeLessThanOrEqual(budget);
    expect(built.includedSources.length + built.droppedSources.length).toBe(chunks.length);
  });

  it('never exceeds the budget even when everything is oversized', () => {
    const big = chunk('big', 'x'.repeat(4000));
    const small = chunk('small', 'y'.repeat(4000));
    const built = buildContext([big, small], 200);
    expect(built.tokensEstimate).toBeLessThanOrEqual(200);
    expect(built.includedSources).toContain('big');
  });

  it('returns empty output for no chunks', () => {
    const built = buildContext([], 100);
    expect(built.text).toBe('');
    expect(built.tokensEstimate).toBe(0);
    expect(built.includedSources).toEqual([]);
    expect(built.droppedSources).toEqual([]);
    expect(built.trimmedSources).toEqual([]);
  });
});
