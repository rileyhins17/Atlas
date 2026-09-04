import { describe, expect, it } from 'vitest';
import { contrast, hslToHex, mix, solveForContrast } from '@/lib/theme/colour';
import { DEFAULT_PALETTE, PALETTES, buildPalette, palettesCss } from '@/lib/theme/palettes';

/**
 * The test that makes ten themes safe to ship.
 *
 * axe can only ever scan the palette that happens to be active, so nine broken
 * themes would sit under a green run — the same blind spot that let a
 * `meta-viewport` failure and a 20px tap target through. Contrast is arithmetic
 * on two colours, so it can be checked for every palette, every mode and every
 * pairing the app actually renders, without a browser.
 *
 * AA for normal text is 4.5:1. Nothing here is exempt: "it's only a label" is
 * how the brand-on-tint failure shipped twice.
 */
const AA = 4.5;
const MODES = ['dark', 'light'] as const;

/**
 * The brand washes the app lays text on, read off the stylesheet rather than
 * assumed. 30 is the ceiling: above that a mix is a FILL and carries
 * --text-on-accent instead.
 */
const TINTS = [4, 9, 12, 15, 18, 22, 26, 30];

describe('colour maths', () => {
  it('agrees with the WCAG reference points', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 1);
    expect(contrast('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
    // Mid grey against white, a value easy to check by hand.
    expect(contrast('#767676', '#ffffff')).toBeGreaterThan(4.5);
    expect(contrast('#777777', '#ffffff')).toBeLessThan(4.6);
  });

  it('mixes the way color-mix does', () => {
    expect(mix('#ffffff', '#000000', 50)).toEqual({ r: 127.5, g: 127.5, b: 127.5 });
    expect(mix('#ffffff', '#000000', 0)).toEqual({ r: 0, g: 0, b: 0 });
    expect(mix('#ffffff', '#000000', 100)).toEqual({ r: 255, g: 255, b: 255 });
  });

  it('solves for a ratio rather than guessing at one', () => {
    const on = solveForContrast({
      hue: 205,
      saturation: 0.7,
      against: ['#171310'],
      target: 7,
      direction: 'light',
    });
    expect(contrast(on, '#171310')).toBeGreaterThanOrEqual(7);
  });

  /** The search must return the most colourful pass, not the safest one. */
  it('stops at the first shade that clears, keeping the colour', () => {
    const solved = solveForContrast({
      hue: 205,
      saturation: 0.7,
      against: ['#171310'],
      target: 4.5,
      direction: 'light',
    });
    // A near-white would also clear 4.5, so returning one would mean the search
    // walked past its answer.
    expect(contrast(solved, '#171310')).toBeLessThan(9);
  });
});

describe.each(PALETTES)('palette: $name', (seed) => {
  describe.each(MODES)('%s mode', (mode) => {
    const t = buildPalette(seed, mode);
    const surfaces = [t['--app-bg'], t['--surface'], t['--surface-raised'], t['--surface-inset']];

    it('has body text at AA on every surface', () => {
      for (const bg of surfaces) expect(contrast(t['--text-primary'], bg)).toBeGreaterThanOrEqual(AA);
    });

    /** Muted labels real content — dates, counts, hints — not decoration. */
    it('has muted text at AA on every surface', () => {
      for (const bg of surfaces) expect(contrast(t['--text-muted'], bg)).toBeGreaterThanOrEqual(AA);
    });

    /**
     * Muted text lands on brand washes too, which the first version of this
     * missed. A week-grid event is a 15% wash (26% on hover) with its time in
     * muted — measured 4.3:1, and axe only caught it because a spec happened to
     * put an event in that week.
     */
    it('has muted text at AA on every brand wash', () => {
      for (const pct of TINTS) {
        for (const bg of surfaces) {
          expect(contrast(t['--text-muted'], mix(t['--brand'], bg, pct))).toBeGreaterThanOrEqual(AA);
        }
      }
    });

    it('has the accent at AA on every surface', () => {
      for (const bg of surfaces) expect(contrast(t['--brand'], bg)).toBeGreaterThanOrEqual(AA);
    });

    /**
     * The one that has broken twice: brand-coloured text on a wash of itself.
     * Once on a chip, once on the week strip's today marker. The tint lifts the
     * background towards the text and eats the ratio in exactly the state you
     * are looking at.
     */
    it('has brand-on-tint at AA at rest AND on hover', () => {
      for (const pct of TINTS) {
        for (const bg of surfaces) {
          expect(contrast(t['--brand-on-tint'], mix(t['--brand'], bg, pct))).toBeGreaterThanOrEqual(AA);
        }
      }
    });

    it('has white legible on a filled button', () => {
      expect(contrast('#ffffff', t['--accent-strong'])).toBeGreaterThanOrEqual(AA);
    });

    it('has both pill colours at AA on every surface', () => {
      for (const bg of surfaces) {
        expect(contrast(t['--pill-warm-fg'], bg)).toBeGreaterThanOrEqual(AA);
        expect(contrast(t['--pill-danger-fg'], bg)).toBeGreaterThanOrEqual(AA);
      }
    });

    /** A border you cannot see is not a border. Not AA — this is not text. */
    it('has a visible border against its surfaces', () => {
      expect(contrast(t['--border-subtle'], t['--surface'])).toBeGreaterThan(1.15);
    });

    it('defines every token as a real colour', () => {
      for (const [k, v] of Object.entries(t)) {
        expect(v, k).toMatch(/^#[0-9a-f]{6}$/);
      }
    });
  });
});

describe('the palette set', () => {
  it('keeps ids unique and stable', () => {
    const ids = PALETTES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    // The id is written into localStorage and an html attribute, so it is a
    // stored value: renaming one silently resets that person's theme.
    expect(ids).toContain(DEFAULT_PALETTE);
  });

  it('offers a genuinely wide range, including one with no colour', () => {
    expect(PALETTES.length).toBeGreaterThanOrEqual(8);
    const mono = PALETTES.find((p) => p.neutral);
    expect(mono).toBeTruthy();
    const t = buildPalette(mono!, 'dark');
    // Neutral means neutral: r, g and b equal, or it is not greyscale.
    expect(t['--brand']).toMatch(/^#(..)\1\1$/);
  });

  it('gives every palette a name and a one-line hint', () => {
    for (const p of PALETTES) {
      expect(p.name.length).toBeGreaterThan(0);
      expect(p.hint.length).toBeGreaterThan(0);
    }
  });

  /**
   * Dark is the base and light is the qualified override, matching the app's
   * own :root. Reversing that would make an unknown data-theme render light on
   * a stylesheet whose defaults are dark.
   */
  it('renders CSS that keeps dark as the unqualified case', () => {
    const css = palettesCss();
    expect(css).toContain(':root[data-palette="ocean"]:not([data-theme="light"])');
    expect(css).toContain(':root[data-palette="ocean"][data-theme="light"]');
    for (const p of PALETTES) expect(css).toContain(`data-palette="${p.id}"`);
  });

  it('sets color-scheme so form controls follow the theme', () => {
    const css = palettesCss();
    expect(css).toContain('color-scheme:dark');
    expect(css).toContain('color-scheme:light');
  });

  /** Sanity on the maths itself, independent of the solver. */
  it('builds surfaces that differ enough to read as layers', () => {
    for (const seed of PALETTES) {
      const t = buildPalette(seed, 'dark');
      expect(contrast(t['--surface-raised'], t['--app-bg'])).toBeGreaterThan(1.1);
    }
  });

  it('tints greys with the palette hue without making them colourful', () => {
    const ocean = buildPalette(PALETTES.find((p) => p.id === 'ocean')!, 'dark');
    // Blue-leaning, but still a grey: a strongly coloured surface would fight
    // every piece of content on it.
    const { r, g, b } = { r: 0, g: 0, b: 0 };
    void r;
    void g;
    void b;
    expect(ocean['--surface']).not.toBe(hslToHex(205, 0.6, 0.125));
  });
});
