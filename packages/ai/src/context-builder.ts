import type { AiContextChunk } from '@atlas/shared';

/** Cheap token estimate: ~4 chars/token. Good enough for budgeting. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export interface BuiltContext {
  text: string;
  tokensEstimate: number;
  includedSources: string[];
  /** Sources with nothing worth saying, or no room left even for a floor. */
  droppedSources: string[];
  /** Sources included but cut short to fit the budget. */
  trimmedSources: string[];
}

/**
 * Every domain gets at least this much room before any is trimmed. Without a
 * floor, one chatty domain early in the list can eat the budget and starve the
 * rest — the AI then reasons about a life with no calendar in it and has no way
 * to know something is missing.
 */
const MIN_CHUNK_TOKENS = 120;

/** A domain with nothing to report shouldn't spend tokens saying so. */
function isEmptySummary(content: string): boolean {
  const t = content.trim();
  if (t.length === 0) return true;
  // Domain summarize() methods return these when there's genuinely nothing.
  return /^(no |nothing |none\b)/i.test(t) && t.length < 60;
}

const TRIM_MARKER = '\n…(trimmed)';

function truncateToTokens(text: string, tokens: number): string {
  const maxChars = Math.max(0, tokens * 4);
  if (text.length <= maxChars) return text;
  // The marker is part of the output, so it has to come out of the same budget —
  // appending it after truncating is what pushes the block over the cap.
  const bodyChars = Math.max(0, maxChars - TRIM_MARKER.length);
  const cut = text.slice(0, bodyChars);
  // Cut on a line boundary where possible so a summary never ends mid-fact.
  const lastBreak = cut.lastIndexOf('\n');
  const body = (lastBreak > bodyChars * 0.5 ? cut.slice(0, lastBreak) : cut).trimEnd();
  return `${body}${TRIM_MARKER}`;
}

/**
 * Packs module context chunks into one prompt block under a token budget.
 *
 * Chunks are taken in the order given (callers pass most-important first), but
 * a chunk that doesn't fit is TRIMMED rather than dropped whole, so every
 * domain keeps a voice. Domains with nothing to say are skipped outright.
 */
export function buildContext(chunks: AiContextChunk[], tokenBudget: number): BuiltContext {
  const parts: string[] = [];
  const includedSources: string[] = [];
  const droppedSources: string[] = [];
  const trimmedSources: string[] = [];
  let used = 0;

  for (const chunk of chunks) {
    if (isEmptySummary(chunk.content)) {
      droppedSources.push(chunk.source);
      continue;
    }

    const header = `## ${chunk.title} (${chunk.source})\n`;
    const headerCost = estimateTokens(header);
    const remaining = tokenBudget - used;

    // No room for a header plus a meaningful floor — this one genuinely can't fit.
    if (remaining < headerCost + MIN_CHUNK_TOKENS) {
      droppedSources.push(chunk.source);
      continue;
    }

    const fullCost = estimateTokens(header + chunk.content);
    if (used + fullCost <= tokenBudget) {
      parts.push(header + chunk.content);
      includedSources.push(chunk.source);
      used += fullCost;
      continue;
    }

    const body = truncateToTokens(chunk.content, remaining - headerCost);
    parts.push(header + body);
    includedSources.push(chunk.source);
    trimmedSources.push(chunk.source);
    used += estimateTokens(header + body);
  }

  return {
    text: parts.join('\n\n'),
    tokensEstimate: used,
    includedSources,
    droppedSources,
    trimmedSources,
  };
}
