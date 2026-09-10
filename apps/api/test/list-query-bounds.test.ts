import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Every collection read needs a finite upper bound. A user-controlled list,
 * an AI-created list, or a table that quietly grows for years must not become
 * a process-sized response just because somebody forgot one Prisma option.
 *
 * This is intentionally a small source guard rather than a runtime mock: the
 * risk is the missing option itself, and a mock cannot prove that production's
 * query still has it. The brace scan is string/comment-aware enough for the
 * query shapes in this codebase and keeps the failure at the write that caused
 * it.
 */
const SRC = join(process.cwd(), 'src');

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const file = join(dir, entry);
    if (statSync(file).isDirectory()) out.push(...sourceFiles(file));
    else if (entry.endsWith('.ts')) out.push(file);
  }
  return out;
}

function matchingBrace(source: string, start: number): number {
  let depth = 0;
  let quote: "'" | '"' | '`' | null = null;
  let lineComment = false;
  let blockComment = false;
  let escaped = false;

  for (let i = start; i < source.length; i += 1) {
    const char = source[i]!;
    const next = source[i + 1];

    if (lineComment) {
      if (char === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (char === '*' && next === '/') {
        blockComment = false;
        i += 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === '/' && next === '/') {
      lineComment = true;
      i += 1;
      continue;
    }
    if (char === '/' && next === '*') {
      blockComment = true;
      i += 1;
      continue;
    }
    if (char === "'" || char === '"' || char === '`') {
      quote = char;
      continue;
    }
    if (char === '{') depth += 1;
    else if (char === '}' && --depth === 0) return i;
  }
  return -1;
}

function missingTake(source: string): number[] {
  const lines: number[] = [];
  const call = /\.findMany\s*\(/g;
  let match: RegExpExecArray | null;

  while ((match = call.exec(source))) {
    let start = match.index + match[0].length;
    while (/\s/.test(source[start] ?? '')) start += 1;
    const line = source.slice(0, match.index).split('\n').length;
    if (source[start] !== '{') {
      lines.push(line);
      continue;
    }
    const end = matchingBrace(source, start);
    if (end < 0) {
      lines.push(line);
      continue;
    }
    const body = source.slice(start, end + 1)
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    if (!/\btake\s*(?::|[,}])/.test(body)) lines.push(line);
    call.lastIndex = end + 1;
  }
  return lines;
}

describe('bounded Prisma collection reads', () => {
  it('bounds every findMany call in the API source', () => {
    const problems: string[] = [];
    for (const file of sourceFiles(SRC)) {
      const relativeFile = relative(SRC, file).replace(/\\/g, '/');
      for (const line of missingTake(readFileSync(file, 'utf8'))) {
        problems.push(`${relativeFile}:${line}`);
      }
    }
    expect(
      problems,
      'Every Prisma findMany must include a finite `take`. Paginate it, derive the ' +
        'bound from an already-bounded input, or add an explicit bounded helper.',
    ).toEqual([]);
  });

  it('detects an unbounded literal query', () => {
    expect(missingTake('const rows = await db.thing.findMany({ where: { userId } });')).toEqual([1]);
  });

  it('accepts a bounded query with nested fields and comments', () => {
    const source = [
      'const rows = await db.thing.findMany({',
      '  // take is a bound, not a page-size suggestion',
      '  include: { child: { select: { id: true } } },',
      '  take: Math.min(limit, 100),',
      '});',
    ].join('\n');
    expect(missingTake(source)).toEqual([]);
  });
});
