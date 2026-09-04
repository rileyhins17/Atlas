import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Every button must do something.
 *
 * A control that looks pressable and isn't is the single cheapest way to make
 * an app feel unfinished — worse than a missing feature, because the user
 * concludes the thing is broken rather than absent. This reads the source and
 * fails on the shapes that cannot possibly work:
 *
 *   - a `<button>` with no onClick, no type="submit" and no form
 *   - an anchor with no href, or href="#"
 *   - an onClick that is written as a no-op
 *
 * It is deliberately a static check. Clicking every button on every route at
 * runtime would be a better test and a worse idea: half of them write to the
 * database, and a suite that deletes a user's data to prove the delete button
 * works is not a suite anyone will keep running.
 */
const ROOTS = [join(process.cwd(), 'components'), join(process.cwd(), 'app')];

/**
 * Comments and string literals are stripped before scanning. Without it the
 * shared Button's own docstring — "never style a raw <button> directly" — was
 * reported as a dead button, which is exactly the sort of false positive that
 * gets a useful rule deleted.
 */
function code(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

function walk(dir: string): string[] {
  let out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules' || entry.startsWith('.')) continue;
      out = out.concat(walk(full));
    } else if (full.endsWith('.tsx')) {
      out.push(full);
    }
  }
  return out;
}

/** Every `<button ...>` opening tag, with its attributes, across a file. */
function buttonTags(source: string): { tag: string; line: number }[] {
  const out: { tag: string; line: number }[] = [];
  const re = /<button\b[\s\S]*?>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    out.push({ tag: m[0], line: source.slice(0, m.index).split('\n').length });
  }
  return out;
}

function anchorTags(source: string): { tag: string; line: number }[] {
  const out: { tag: string; line: number }[] = [];
  const re = /<a\b[\s\S]*?>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    out.push({ tag: m[0], line: source.slice(0, m.index).split('\n').length });
  }
  return out;
}

/**
 * A button works if it handles a click, submits a form, or is handed a handler
 * by its parent through a spread or an `onClick={props.…}`.
 */
function buttonWorks(tag: string): boolean {
  if (/\bonClick\s*=/.test(tag)) return true;
  if (/\btype\s*=\s*["'{]?\s*submit/.test(tag)) return true;
  if (/\{\.\.\./.test(tag)) return true; // {...rest} carries the handler
  if (/\bonPointerDown\s*=|\bonMouseDown\s*=|\bonKeyDown\s*=/.test(tag)) return true;
  return false;
}

describe('no dead controls', () => {
  it('every button does something', () => {
    const dead: string[] = [];
    for (const root of ROOTS) {
      for (const file of walk(root)) {
        const rel = file.slice(process.cwd().length + 1).replace(/\\/g, '/');
        const source = code(readFileSync(file, 'utf8'));
        for (const { tag, line } of buttonTags(source)) {
          if (!buttonWorks(tag)) {
            dead.push(`${rel}:${line} — ${tag.replace(/\s+/g, ' ').slice(0, 80)}`);
          }
        }
      }
    }
    expect(
      dead,
      'A button with no onClick and no type="submit" cannot do anything when pressed.',
    ).toEqual([]);
  });

  it('every anchor goes somewhere', () => {
    const dead: string[] = [];
    for (const root of ROOTS) {
      for (const file of walk(root)) {
        const rel = file.slice(process.cwd().length + 1).replace(/\\/g, '/');
        const source = code(readFileSync(file, 'utf8'));
        for (const { tag, line } of anchorTags(source)) {
          const hasHref = /\bhref\s*=/.test(tag);
          const isPlaceholder = /href\s*=\s*["']#["']/.test(tag);
          if (!hasHref || isPlaceholder) {
            dead.push(`${rel}:${line} — ${tag.replace(/\s+/g, ' ').slice(0, 80)}`);
          }
        }
      }
    }
    expect(dead, 'An anchor with no href (or href="#") is a link to nowhere.').toEqual([]);
  });

  /** A handler written as a no-op is a dead button wearing a disguise. */
  it('has no handler that deliberately does nothing', () => {
    const dead: string[] = [];
    for (const root of ROOTS) {
      for (const file of walk(root)) {
        const rel = file.slice(process.cwd().length + 1).replace(/\\/g, '/');
        const source = code(readFileSync(file, 'utf8'));
        source.split('\n').forEach((line, i) => {
          if (/onClick\s*=\s*\{\s*\(\s*\)\s*=>\s*(\{\s*\}|undefined|null|void 0)\s*\}/.test(line)) {
            dead.push(`${rel}:${i + 1} — ${line.trim().slice(0, 80)}`);
          }
        });
      }
    }
    expect(dead).toEqual([]);
  });

  /** The detector has to be able to fail, or it proves nothing. */
  it('detects the shapes it claims to', () => {
    // A button named in prose is prose, not a control.
    expect(buttonTags(code('/** never style a raw <button> directly */'))).toEqual([]);
    expect(buttonWorks('<button type="button" className="x">')).toBe(false);
    expect(buttonWorks('<button type="submit">')).toBe(true);
    expect(buttonWorks('<button onClick={go}>')).toBe(true);
    expect(buttonWorks('<button {...rest}>')).toBe(true);
  });
});
