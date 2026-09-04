/**
 * Colour maths for the theme system. Pure, no DOM.
 *
 * This exists because the alternative — hand-picking every token for every
 * palette — does not survive contact with accessibility. Atlas has fourteen
 * colour-carrying tokens; ten palettes across light and dark is two hundred and
 * eighty hand-chosen colours, each of which has to clear WCAG AA against
 * whatever it sits on, and axe can only ever check the ONE palette that happens
 * to be active when the scan runs. Nine broken themes would pass a green run.
 *
 * So the colours are SOLVED rather than chosen: a palette is a hue and a
 * character, and every token that carries text is found by searching lightness
 * until it clears its required ratio. Correct by construction, and the test
 * suite re-checks every combination rather than trusting the search.
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

const clamp = (n: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, n));

/** HSL (h 0–360, s/l 0–1) to RGB 0–255. */
export function hslToRgb(h: number, s: number, l: number): Rgb {
  const hue = ((h % 360) + 360) % 360;
  const sat = clamp(s);
  const lig = clamp(l);
  const c = (1 - Math.abs(2 * lig - 1)) * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = lig - c / 2;
  const [r1, g1, b1] =
    hue < 60
      ? [c, x, 0]
      : hue < 120
        ? [x, c, 0]
        : hue < 180
          ? [0, c, x]
          : hue < 240
            ? [0, x, c]
            : hue < 300
              ? [x, 0, c]
              : [c, 0, x];
  return {
    r: Math.round((r1 + m) * 255),
    g: Math.round((g1 + m) * 255),
    b: Math.round((b1 + m) * 255),
  };
}

const hex2 = (n: number) => Math.round(clamp(n, 0, 255)).toString(16).padStart(2, '0');

export function rgbToHex({ r, g, b }: Rgb): string {
  return `#${hex2(r)}${hex2(g)}${hex2(b)}`;
}

export function hslToHex(h: number, s: number, l: number): string {
  return rgbToHex(hslToRgb(h, s, l));
}

export function hexToRgb(hex: string): Rgb {
  const raw = hex.replace('#', '');
  const full =
    raw.length === 3
      ? raw
          .split('')
          .map((c) => c + c)
          .join('')
      : raw;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

/** WCAG relative luminance. */
export function luminance(colour: Rgb | string): number {
  const { r, g, b } = typeof colour === 'string' ? hexToRgb(colour) : colour;
  const channel = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio, 1–21. */
export function contrast(a: Rgb | string, b: Rgb | string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * What `color-mix(in srgb, top P%, bottom)` produces.
 *
 * The app tints brand over surfaces constantly — a 12% wash behind a chip, 22%
 * on hover — and the text on those tints is the pairing that has broken twice
 * already. Emulating the mix is what lets a test check the colour the user
 * actually sees rather than the two colours it was made from.
 */
export function mix(top: Rgb | string, bottom: Rgb | string, percent: number): Rgb {
  const t = typeof top === 'string' ? hexToRgb(top) : top;
  const b = typeof bottom === 'string' ? hexToRgb(bottom) : bottom;
  const p = clamp(percent / 100);
  return {
    r: t.r * p + b.r * (1 - p),
    g: t.g * p + b.g * (1 - p),
    b: t.b * p + b.b * (1 - p),
  };
}

/**
 * The most colourful shade of a hue that still clears `target` against every
 * background it has to sit on.
 *
 * It walks OUTWARD from mid-lightness rather than inward from the extreme, and
 * that direction is the whole point. HSL is at its most saturated at l=0.5 and
 * washes out towards white and black, so starting at the extreme and stopping
 * at the first pass returns the palest shade that scrapes AA — measured 17:1
 * against a dark surface, which is a near-white pretending to be a colour.
 * Starting in the middle and moving out returns the first shade that is legible
 * AND still recognisably the hue.
 *
 * If nothing in the sweep clears the target, the best attempt is returned. The
 * contrast test is what makes that loud instead of silent.
 */
export function solveForContrast(opts: {
  hue: number;
  saturation: number;
  against: (Rgb | string)[];
  target: number;
  /** 'light' lightens towards white, 'dark' darkens towards black. */
  direction: 'light' | 'dark';
}): string {
  const { hue, saturation, against, target, direction } = opts;
  const START = 0.5;
  const LIMIT = direction === 'light' ? 0.99 : 0.02;
  const steps = Math.round(Math.abs(LIMIT - START) / 0.01);

  let best = START;
  let bestRatio = 0;
  for (let step = 0; step <= steps; step++) {
    const l = direction === 'light' ? START + step * 0.01 : START - step * 0.01;
    const candidate = hslToRgb(hue, saturation, l);
    const worst = Math.min(...against.map((bg) => contrast(candidate, bg)));
    if (worst > bestRatio) {
      bestRatio = worst;
      best = l;
    }
    if (worst >= target) return hslToHex(hue, saturation, l);
  }
  return hslToHex(hue, saturation, best);
}
