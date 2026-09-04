import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A database query inside a loop is the defect this codebase keeps shipping.
 *
 * It is invisible locally — a round trip to a database on the same machine is
 * under a millisecond, so a loop of eighty is imperceptible. Against the hosted
 * database it measures 384ms a trip, and the same loop is thirty seconds. Three
 * separate features had it:
 *
 *   - Google Calendar sync: three queries per event, 276 events, measured 305
 *     seconds and killed by the proxy at ~100, so most calendars never synced.
 *   - "Paste a whole split": two queries per movement inside a per-day loop,
 *     ~80 round trips for a five-day program.
 *   - Rolling tasks forward: one timeline insert per task.
 *
 * Each was found by a user noticing, not by a test. So this is the test: it
 * reads the source and fails on the shape. The fix is always the same — read
 * once with `in`, write once with `createMany`, or batch into `$transaction`.
 */
const SRC = join(process.cwd(), 'src');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full);
    return full.endsWith('.ts') ? [full] : [];
  });
}

/**
 * Deliberate exceptions, each with a reason. An empty list would be nicer, but
 * a rule with no way to say "this one is fine" gets deleted the first time it
 * is wrong.
 */
const ALLOWED = new Map<string, string>([
  [
    'modules/finance/plaid-sync.service.ts',
    'Writes are per-transaction against an external cursor; batching them would ' +
      'break the guarantee that the cursor only advances past what was written.',
  ],
  [
    'modules/ai/tool-router.service.ts',
    'Dispatches one model-chosen tool at a time; the calls are different services, not one table.',
  ],
  [
    'modules/ai/proactive.service.ts',
    'One AI generation per user per sweep — the cost is the model call, not the query.',
  ],
]);

/** Line numbers inside a `for`/`while`/`forEach` body, crudely but usefully. */
function queriesInLoops(source: string): string[] {
  const lines = source.split('\n');
  const hits: string[] = [];
  let loopDepth = 0;
  const braceAtLoopStart: number[] = [];
  let depth = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const opens = (line.match(/\{/g) ?? []).length;
    const closes = (line.match(/\}/g) ?? []).length;

    // A loop over CHUNKS is the cure, not the disease: it exists to keep one
    // `IN` list from growing unbounded, and collapsing it would be the bug.
    const isChunkLoop = /\bof\s+chunks?\(/.test(line);
    if (!isChunkLoop && /\b(for|while)\s*\(|\.forEach\(|\.map\(async/.test(line)) {
      loopDepth++;
      braceAtLoopStart.push(depth);
    }

    if (loopDepth > 0 && /await\s+(this\.)?prisma\b/.test(line)) {
      hits.push(`${i + 1}: ${line.trim().slice(0, 90)}`);
    }

    depth += opens - closes;
    while (braceAtLoopStart.length > 0 && depth <= braceAtLoopStart[braceAtLoopStart.length - 1]!) {
      braceAtLoopStart.pop();
      loopDepth--;
    }
  }
  return hits;
}

describe('no database query inside a loop', () => {
  it('holds across every API service', () => {
    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      const rel = file.slice(SRC.length + 1).replace(/\\/g, '/');
      if (ALLOWED.has(rel)) continue;
      const hits = queriesInLoops(readFileSync(file, 'utf8'));
      for (const hit of hits) offenders.push(`${rel}:${hit}`);
    }
    expect(
      offenders,
      'Read once with `in`, write once with `createMany`, or batch into `$transaction`. ' +
        'If it is genuinely per-row, add it to ALLOWED with a reason.',
    ).toEqual([]);
  });

  /** A rule nobody can see failing is a rule nobody trusts. */
  it('detects the shape it is meant to detect', () => {
    const bad = `
      for (const t of things) {
        const row = await this.prisma.client.thing.findFirst({ where: { id: t } });
      }
    `;
    expect(queriesInLoops(bad)).toHaveLength(1);
  });

  /** Chunking is how a large `IN` list is made safe, so it must not be flagged. */
  it('does not fire on a loop over chunks', () => {
    const chunked = `
      for (const chunk of chunks(ids, 1000)) {
        const rows = await this.prisma.client.thing.findMany({ where: { id: { in: chunk } } });
      }
    `;
    expect(queriesInLoops(chunked)).toEqual([]);
  });

  it('does not fire on a query outside a loop', () => {
    const fine = `
      const rows = await this.prisma.client.thing.findMany({ where: { id: { in: ids } } });
      for (const row of rows) { out.push(row.id); }
    `;
    expect(queriesInLoops(fine)).toEqual([]);
  });
});
