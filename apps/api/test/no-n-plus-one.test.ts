import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A standing guard against the bug class this project keeps paying for.
 *
 * `await this.prisma…` inside a loop body is one network round trip per
 * iteration. It has cost real time here more than once: a Google sync that took
 * 305 seconds and now takes 6.8, and a Plaid sync that issued a DELETE for
 * every removed transaction in a page. Neither was slow code — both were the
 * right query, asked one row at a time.
 *
 * It reads the source rather than the behaviour, so it cannot prove absence of
 * an N+1. What it does is make a new one loud at the moment it is written, and
 * that is worth more than a perfect check nobody runs.
 *
 * Deliberate batching is allowed by name. A loop over CHUNKS is the fix for
 * this problem, not an instance of it, and a per-item remote call that must
 * happen one at a time cannot be batched no matter how it is written — so the
 * allow-list carries a reason for each entry rather than a line number, which
 * would rot on the next edit.
 */
const SRC = new URL('../src', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

/** Each entry says WHY the loop is correct, not merely that it was here first. */
const ALLOWED = [
  {
    file: 'calendar/google-sync.service.ts',
    because: 'loops over CHUNKS of ids — this is the batching, not an N+1',
  },
  {
    file: 'finance/plaid-sync.service.ts',
    because: 'one Plaid remote call per item; the network call cannot be batched',
  },
  {
    file: 'fitness/workout-templates.service.ts',
    because: 'one nested write per DAY, bounded by MAX_TEMPLATES, each its own transaction',
  },
];

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (entry.endsWith('.ts')) out.push(full);
  }
  return out;
}

/**
 * Awaited Prisma calls that sit inside a `for`/`while` body.
 *
 * Tracked by indentation, which is crude and is why the check is advisory: this
 * codebase is Prettier-formatted, so indentation is reliable enough to catch
 * the shape, and a false positive costs one line in the list above.
 */
function offenders(source: string): number[] {
  const lines = source.split('\n');
  const found: number[] = [];
  let loopIndent: number | null = null;

  for (const [i, line] of lines.entries()) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('*')) continue;
    const indent = line.length - line.trimStart().length;

    if (loopIndent !== null && indent <= loopIndent && trimmed.startsWith('}')) {
      loopIndent = null;
    }
    if (/\b(for|while)\s*\(/.test(trimmed)) {
      loopIndent = indent;
      continue;
    }
    if (loopIndent !== null && /await\s+this\.prisma\b/.test(trimmed)) {
      found.push(i + 1);
    }
  }
  return found;
}

describe('no awaited Prisma call inside a loop', () => {
  it('finds none outside the documented exceptions', () => {
    const problems: string[] = [];

    for (const file of sourceFiles(SRC)) {
      const relative = file.slice(SRC.length + 1).replace(/\\/g, '/').replace(/^modules\//, '');
      if (ALLOWED.some((a) => relative === a.file)) continue;
      for (const line of offenders(readFileSync(file, 'utf8'))) {
        problems.push(`${relative}:${line}`);
      }
    }

    expect(
      problems,
      'A Prisma call awaited inside a loop is one round trip per iteration. ' +
        'Batch it — `findMany({ where: { id: { in: ids } } })`, `createMany`, or a ' +
        'single `deleteMany` — or add it to ALLOWED in this file with the reason ' +
        'it cannot be batched.',
    ).toEqual([]);
  });

  /** The guard is worthless if it cannot see the thing it guards against. */
  it('detects the shape it exists to catch', () => {
    const bad = [
      'async function sync(ids: string[]) {',
      '  for (const id of ids) {',
      '    await this.prisma.client.transaction.deleteMany({ where: { id } });',
      '  }',
      '}',
    ].join('\n');
    expect(offenders(bad)).toEqual([3]);
  });

  it('does not flag a batched call that merely follows a loop', () => {
    const good = [
      'async function sync(ids: string[]) {',
      '  const wanted = [];',
      '  for (const id of ids) {',
      '    wanted.push(id);',
      '  }',
      '  await this.prisma.client.transaction.deleteMany({ where: { id: { in: wanted } } });',
      '}',
    ].join('\n');
    expect(offenders(good)).toEqual([]);
  });

  it('keeps a reason with every exception', () => {
    for (const entry of ALLOWED) {
      expect(entry.because.length, entry.file).toBeGreaterThan(20);
    }
  });
});
