/** A single proposal exactly as it arrived from the model — every field optional. */
export interface RawProposal {
  taskId?: string;
  startAt?: string;
  endAt?: string;
  why?: string;
}

export interface ParsedPlanReply {
  proposals: RawProposal[];
  note: string | null;
}

/**
 * Walk `text` from `open` (the index of a `{`) and return the index just past
 * its matching `}`, or -1 if the object never closes. String-aware so a brace
 * inside a "why" sentence can't end the object early.
 */
function objectEnd(text: string, open: number): number {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = open; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  return -1;
}

/**
 * Recover whatever complete proposal objects a truncated reply managed to emit.
 *
 * This is not paranoia: `deepseek-v4-flash` is a reasoning model, and its
 * `reasoning_content` is billed against the SAME completion budget as the
 * answer, so a long deliberation can cut the JSON off mid-object. Salvaging
 * gives the user the three slots the model did finish instead of nothing.
 */
function salvageProposals(content: string): RawProposal[] {
  const out: RawProposal[] = [];
  let i = content.indexOf('{');
  while (i !== -1) {
    const end = objectEnd(content, i);
    // The FIRST unclosed object is the truncated envelope itself, so step past
    // it and keep looking — the closed proposals are nested inside it.
    if (end === -1) {
      i = content.indexOf('{', i + 1);
      continue;
    }
    const slice = content.slice(i, end);
    if (slice.includes('"taskId"')) {
      try {
        out.push(JSON.parse(slice) as RawProposal);
      } catch {
        // A malformed object is skipped, not fatal — the next one may be fine.
      }
    }
    i = content.indexOf('{', end);
  }
  return out;
}

/**
 * Pull the plan out of a model reply.
 *
 * Models wrap JSON in prose or code fences often enough that a bare
 * `JSON.parse` fails in normal operation, so this takes the outermost braces
 * first. If that fails — most often because the reply was truncated — it falls
 * back to salvaging the individual proposal objects. Returns null only when
 * there is nothing usable at all.
 */
export function parsePlanReply(content: string): ParsedPlanReply | null {
  const start = content.indexOf('{');
  const end = content.lastIndexOf('}');
  if (start === -1) return null;

  if (end > start) {
    try {
      const raw = JSON.parse(content.slice(start, end + 1)) as {
        proposals?: unknown;
        note?: unknown;
      };
      return {
        proposals: Array.isArray(raw.proposals) ? (raw.proposals as RawProposal[]) : [],
        note: typeof raw.note === 'string' ? raw.note : null,
      };
    } catch {
      // Fall through to salvage.
    }
  }

  const salvaged = salvageProposals(content);
  if (salvaged.length === 0) return null;
  return { proposals: salvaged, note: null };
}
