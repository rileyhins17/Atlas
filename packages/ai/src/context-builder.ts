import type { AiContextChunk } from '@atlas/shared';

/** Cheap token estimate: ~4 chars/token. Good enough for budgeting. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export interface BuiltContext {
  text: string;
  tokensEstimate: number;
  includedSources: string[];
  droppedSources: string[];
}

/**
 * Packs module context chunks into a single prompt block under a token budget.
 * Chunks are taken in the order given (callers should pass most-important first).
 * This is what keeps AI calls cheap: modules summarize, the builder caps size,
 * and nothing dumps the whole database into the prompt.
 */
export function buildContext(chunks: AiContextChunk[], tokenBudget: number): BuiltContext {
  const parts: string[] = [];
  const includedSources: string[] = [];
  const droppedSources: string[] = [];
  let used = 0;

  for (const chunk of chunks) {
    const block = `## ${chunk.title} (${chunk.source})\n${chunk.content}`;
    const cost = estimateTokens(block);
    if (used + cost > tokenBudget) {
      droppedSources.push(chunk.source);
      continue;
    }
    parts.push(block);
    includedSources.push(chunk.source);
    used += cost;
  }

  return {
    text: parts.join('\n\n'),
    tokensEstimate: used,
    includedSources,
    droppedSources,
  };
}
