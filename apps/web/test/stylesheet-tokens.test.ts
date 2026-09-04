import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The stylesheet must not know what colour the app is.
 *
 * With one theme, a hardcoded `rgba(181, 80, 47, 0.12)` was merely a shortcut
 * for the accent. With ten palettes it is a different theme leaking through:
 * measured on the live app, choosing Ocean turned every accent blue except the
 * active sidebar item, which stayed terracotta because that one rule spelled
 * the colour out. Seven rules did.
 *
 * A screenshot only catches this on the palette that was active when it was
 * taken, so the check belongs here, where it reads the source and covers all of
 * them at once.
 */
const CSS = readFileSync(join(process.cwd(), 'app/globals.css'), 'utf8');

/**
 * The token definitions themselves — the only place literal colours belong.
 * Everything from the first rule after them onwards has to go through a var().
 */
const AFTER_TOKENS = CSS.slice(CSS.indexOf(':focus-visible'))
  // Comments are stripped first. Several of them quote the exact colours of a
  // contrast failure that was fixed ("measured 4.45:1, #b5502f on #f5f0e8"),
  // and that record is worth keeping — it is why the rule below it looks the
  // way it does. A scanner that cannot tell a note from a declaration would
  // force those notes to be deleted to stay green.
  .replace(/\/\*[\s\S]*?\*\//g, '');

describe('globals.css', () => {
  /**
   * Greys and pure black/white are fine: shadows, scrims and overlays are not
   * the accent and should not change with it. What must never be spelled out is
   * a HUE.
   */
  it('has no coloured literal outside the token blocks', () => {
    const rgbaLiterals = [...AFTER_TOKENS.matchAll(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/g)];
    const coloured = rgbaLiterals.filter(([, r, g, b]) => {
      const [x, y, z] = [Number(r), Number(g), Number(b)];
      // Neutral means the channels are within a hair of each other.
      return Math.max(x, y, z) - Math.min(x, y, z) > 12;
    });
    expect(coloured.map((m) => m[0])).toEqual([]);
  });

  /**
   * Two things are allowed to be literal, and nothing else:
   *
   *  - the routine-block kinds (sleep / work / meal / winddown / custom), which
   *    encode a CATEGORY the way a chart's series colours do. They have to stay
   *    distinguishable from EACH OTHER, which is a different job from matching
   *    the accent; tying them to the palette would collapse five meanings into
   *    one hue.
   *  - the connector status dot, which means "connected" and is green for the
   *    same reason a traffic light is.
   *
   * Fallbacks inside `var(--token, #hex)` are stripped before scanning: the
   * token always exists, so the literal is unreachable. Legacy noise rather
   * than a second source of truth.
   */
  it('has no hex literal outside the token blocks, beyond the documented few', () => {
    const ALLOWED = new Set([
      '7c6bd6', // canvas-kind-sleep
      '4f8ecc', // canvas-kind-work / school
      'd9a44a', // canvas-kind-meal
      '8a6fb0', // canvas-kind-winddown
      '6f8f7d', // canvas-kind-custom
      '3f9d6b', // gc-dot.on — "connected"
    ]);
    const scanned = AFTER_TOKENS.replace(/var\(\s*--[\w-]+\s*,[^)]*\)/g, 'var(--x)');
    const hexes = [...scanned.matchAll(/#([0-9a-fA-F]{3,8})\b/g)].map((m) => m[1]!.toLowerCase());
    const coloured = hexes.filter((h) => {
      if (ALLOWED.has(h)) return false;
      if (h.length !== 6 && h.length !== 3) return false;
      const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
      const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
      return Math.max(r!, g!, b!) - Math.min(r!, g!, b!) > 12;
    });
    expect(coloured).toEqual([]);
  });

  /**
   * Brand-coloured text on a wash of brand is the pairing that has now failed
   * AA three times here — a chip, the week strip's today marker, and two rules
   * found while adding palettes. `--brand` is tuned to sit on a SURFACE; once a
   * tint of itself is underneath, only `--brand-on-tint` clears 4.5:1.
   */
  it('never puts --brand on a color-mix of --brand', () => {
    const offenders: string[] = [];
    // Each rule body, crudely: enough to see a background and a color together.
    for (const block of AFTER_TOKENS.split('}')) {
      const hasBrandTint = /background[^;]*color-mix\([^;]*var\(--brand\)/.test(block);
      const usesPlainBrand = /(^|[^-])color:\s*var\(--brand\)\s*;/.test(block);
      if (hasBrandTint && usesPlainBrand) {
        offenders.push(block.trim().slice(0, 90));
      }
    }
    expect(offenders).toEqual([]);
  });
});
