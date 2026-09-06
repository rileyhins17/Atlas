import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A className with no CSS rule does not render as nothing. It renders as the
 * element's DEFAULT — which is how a nag once ended up as the largest text on
 * Today, and how the onboarding's explanatory paragraphs sat at default size
 * next to a 26px heading for months.
 *
 * This is the Phase 6 check that had never been run. It found fifteen; five
 * were elements whose only class had no rule at all.
 *
 * Two things are deliberately allowed:
 *
 *   - A MARKER on an element that something else already styles. `.fit-active`
 *     sits on a `<Card>`, which carries `.card`. The class exists so the DOM
 *     says which card it is.
 *   - A HOOK a test asserts against. `.wr-list` exists so an e2e assertion can
 *     scope to a container that can only hold saved data.
 *
 * Both are listed by name with a reason, so a genuinely unstyled element cannot
 * hide among them.
 */
// vitest runs with the package root as cwd. `import.meta.url` arrives with
// Vite's /@fs/ prefix here, which is not a filesystem path.
const WEB = process.cwd();

/** Each entry says why the class needs no paint of its own. */
const ALLOWED: Record<string, string> = {
  'fit-active': 'marker on a <Card>; .card does the styling',
  'fit-start': 'marker on a <Card>',
  'fit-picker': 'marker on a <Card>',
  'day-builder': 'marker on a <Card>',
  'fit-pitch': 'wrapper <section>; .fit-pitch-list styles its only child',
  'wr-list': 'e2e hook — scopes an assertion to saved rows only',
};

function tsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...tsxFiles(full));
    else if (entry.endsWith('.tsx')) out.push(full);
  }
  return out;
}

function definedClasses(css: string): Set<string> {
  // Comments first: a class NAMED in prose is not a class that is styled, and
  // this repo writes long comments full of class names.
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  return new Set([...withoutComments.matchAll(/\.([a-zA-Z][\w-]*)/g)].map((m) => m[1]!));
}

function usedClasses(source: string): string[] {
  const withoutComments = source
    .replace(/\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  const names: string[] = [];
  for (const m of withoutComments.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
    // Template holes leave their literal neighbours behind; drop the hole.
    const raw = (m[1] ?? m[2] ?? '').replace(/\$\{[^}]*\}/g, ' ');
    for (const name of raw.split(/\s+/)) {
      // A fragment like `w-` is the stub of `w-${weight}`, not a class.
      if (/^[a-zA-Z][\w-]*$/.test(name) && !name.endsWith('-')) names.push(name);
    }
  }
  return names;
}

describe('every className has a CSS rule', () => {
  it('finds none rendering as a browser default', () => {
    const defined = definedClasses(readFileSync(join(WEB, 'app/globals.css'), 'utf8'));
    const missing = new Map<string, string>();

    for (const file of tsxFiles(join(WEB, 'components')).concat(tsxFiles(join(WEB, 'app')))) {
      for (const name of usedClasses(readFileSync(file, 'utf8'))) {
        if (defined.has(name) || name in ALLOWED) continue;
        if (!missing.has(name)) missing.set(name, file.slice(WEB.length).replace(/\\/g, '/'));
      }
    }

    expect(
      [...missing].map(([name, file]) => `${name}  (${file})`),
      'These classNames have no rule in globals.css, so they render as the ' +
        "element's default. Add a rule, or add the name to ALLOWED with the " +
        'reason it needs no paint of its own.',
    ).toEqual([]);
  });

  it('detects a class that has no rule', () => {
    const defined = definedClasses('.real { color: red; }');
    expect(defined.has('real')).toBe(true);
    expect(defined.has('imaginary')).toBe(false);
  });

  /** The comment-stripping matters: this file alone names a dozen classes. */
  it('does not count a class merely mentioned in a comment as styled', () => {
    const defined = definedClasses('/* .mentioned is discussed here */ .actual { color: red; }');
    expect(defined.has('actual')).toBe(true);
    expect(defined.has('mentioned')).toBe(false);
  });

  it('ignores the stub left behind by a template hole', () => {
    expect(usedClasses('<div className={`w-${weight} card`} />')).toEqual(['card']);
  });

  it('keeps a reason with every exception', () => {
    for (const [name, reason] of Object.entries(ALLOWED)) {
      expect(reason.length, name).toBeGreaterThan(15);
    }
  });
});
