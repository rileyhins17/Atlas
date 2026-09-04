import { contrast, hslToHex, mix, solveForContrast } from './colour';

/**
 * The colour schemes Atlas ships with.
 *
 * A palette is a hue and a temperament, not a list of colours. Every token that
 * carries text is solved against the surfaces it will actually sit on, so a new
 * palette is four numbers rather than twenty-eight hand-checked hex values —
 * and no palette can ship below AA without the contrast test failing.
 *
 * Named for what they look like. A colour scheme is the most personal thing in
 * an app and the fastest way to make someone feel it was not built for them is
 * to sort the options into who is allowed to like them, so the range is wide —
 * warm, cool, loud, quiet, and one with no hue at all — and the labels describe
 * the colour.
 */
export interface PaletteSeed {
  id: string;
  name: string;
  /** One line in the picker, so a choice can be made without trying all ten. */
  hint: string;
  /** 0–360. Ignored entirely when `neutral` is set. */
  hue: number;
  /** How saturated the accent is, 0–1. */
  accent: number;
  /** How much of the hue bleeds into the greys, 0–1. Keep low: 0.02–0.08. */
  tint: number;
  /** No hue at all — pure greys, for anyone who wants the app to be quiet. */
  neutral?: boolean;
}

export const PALETTES: PaletteSeed[] = [
  { id: 'ember', name: 'Ember', hint: 'Warm terracotta on soft charcoal', hue: 14, accent: 0.72, tint: 0.06 },
  { id: 'ocean', name: 'Ocean', hint: 'Deep blue, cool and calm', hue: 205, accent: 0.68, tint: 0.05 },
  { id: 'forest', name: 'Forest', hint: 'Green, earthy and low-key', hue: 152, accent: 0.5, tint: 0.05 },
  { id: 'violet', name: 'Violet', hint: 'Purple, soft and a little moody', hue: 272, accent: 0.6, tint: 0.05 },
  { id: 'rose', name: 'Rose', hint: 'Pink, warm and bright', hue: 340, accent: 0.68, tint: 0.05 },
  { id: 'gold', name: 'Gold', hint: 'Honey and amber', hue: 38, accent: 0.75, tint: 0.06 },
  { id: 'teal', name: 'Teal', hint: 'Blue-green, clean and fresh', hue: 178, accent: 0.6, tint: 0.05 },
  { id: 'plum', name: 'Plum', hint: 'Deep berry, rich and quiet', hue: 315, accent: 0.45, tint: 0.06 },
  { id: 'slate', name: 'Slate', hint: 'Cool blue-grey, almost no colour', hue: 218, accent: 0.28, tint: 0.04 },
  { id: 'mono', name: 'Mono', hint: 'No colour at all. Just contrast.', hue: 0, accent: 0, tint: 0, neutral: true },
];

export const DEFAULT_PALETTE = 'ember';

export type ThemeMode = 'dark' | 'light';

/** Every colour-carrying token a palette defines. */
export interface PaletteTokens {
  '--app-bg': string;
  '--sidebar-bg': string;
  '--surface': string;
  '--surface-raised': string;
  '--surface-inset': string;
  '--border-subtle': string;
  '--text-primary': string;
  '--text-muted': string;
  '--brand': string;
  '--brand-alt': string;
  '--brand-on-tint': string;
  '--accent-strong': string;
  '--focus-ring': string;
  '--link': string;
  '--pill-danger-fg': string;
  '--pill-danger-border': string;
  '--pill-warm-fg': string;
  '--pill-warm-border': string;
}

/**
 * The surface ramp, darkest to lightest in dark mode and the reverse in light.
 *
 * Fixed lightnesses, hue-tinted only slightly. Keeping the ramp identical
 * across palettes is what stops one theme feeling washed out next to another:
 * only the hue changes, never the depth.
 */
const RAMP = {
  dark: { app: 0.075, sidebar: 0.095, surface: 0.125, raised: 0.155, inset: 0.19, border: 0.24 },
  light: { app: 0.925, sidebar: 0.955, surface: 0.98, raised: 1, inset: 0.945, border: 0.885 },
} as const;

/**
 * The brand tints the app actually lays text on.
 *
 * Read off the stylesheet rather than assumed: `color-mix(in srgb, var(--brand)
 * N%, …)` appears at every step from 4% to 30%, and the pairing has failed AA
 * three times here — a chip at 12%, the week strip's today marker at 22%, and a
 * week-grid event at 15%/26% that only surfaced once palettes were generated.
 *
 * 30 is the ceiling for text: above that the mix is a FILL (a selected pill, a
 * progress bar) and carries `--text-on-accent`, not muted or brand text.
 */
const TINTS = [4, 9, 12, 15, 18, 22, 26, 30] as const;

/** Build every token for one palette in one mode, solving for contrast. */
export function buildPalette(seed: PaletteSeed, mode: ThemeMode): PaletteTokens {
  const hue = seed.neutral ? 0 : seed.hue;
  const tint = seed.neutral ? 0 : seed.tint;
  const accent = seed.accent;
  const ramp = RAMP[mode];

  const grey = (l: number) => hslToHex(hue, tint, l);
  const appBg = grey(ramp.app);
  const sidebarBg = grey(ramp.sidebar);
  const surface = grey(ramp.surface);
  const raised = grey(ramp.raised);
  const inset = grey(ramp.inset);

  // Text is near-white on dark and near-black on light, carrying a whisper of
  // the hue so it never looks pasted on from another theme.
  const textPrimary = mode === 'dark' ? hslToHex(hue, tint * 1.5, 0.94) : hslToHex(hue, tint * 2, 0.13);
  const plain = [appBg, sidebarBg, surface, raised, inset];

  // The accent, as icons/active state/links: text-grade against every surface.
  // Solved first, because everything tinted is a mix of THIS.
  const brand = solveForContrast({
    hue,
    saturation: accent,
    against: plain,
    target: 4.5,
    direction: mode === 'dark' ? 'light' : 'dark',
  });

  // Every backdrop a piece of text can land on: the plain surfaces, and each of
  // them washed with brand at every percentage the stylesheet actually uses.
  // app-bg is in there because a brand chip sits on the page background as
  // readily as on a card — leaving it out is how the first attempt landed at
  // 4.44:1 there.
  const tintedBackdrops = TINTS.flatMap((pct) => plain.map((bg) => mix(brand, bg, pct)));

  // Muted has to clear 4.5:1 on every surface it is used on: it labels real
  // content, not decoration.
  //
  // Including the TINTED backdrops is not belt-and-braces. A week-grid event is
  // a 15% brand wash (26% on hover) with its time in muted text, and solving
  // muted against plain surfaces alone put that at 4.3:1 — caught by axe only
  // because a spec happened to create an event that week.
  const textMuted = solveForContrast({
    hue,
    saturation: tint * 2,
    against: [...plain, ...tintedBackdrops],
    target: 4.5,
    direction: mode === 'dark' ? 'light' : 'dark',
  });

  // The same accent, sitting on a WASH of itself. Solved separately because
  // --brand does not survive that: the tint lifts the background towards the
  // text and eats the ratio in exactly the state you are looking at it.
  const brandOnTint = solveForContrast({
    hue,
    saturation: accent,
    against: tintedBackdrops,
    target: 4.5,
    direction: mode === 'dark' ? 'light' : 'dark',
  });

  // A filled button: white text on the accent, so it is solved the other way.
  const accentStrong = solveForContrast({
    hue,
    saturation: Math.max(accent, 0.35),
    against: ['#ffffff'],
    target: 4.5,
    direction: 'dark',
  });

  const pillWarm = solveForContrast({
    hue: seed.neutral ? 0 : 38,
    saturation: seed.neutral ? 0 : 0.7,
    against: [appBg, sidebarBg, surface, raised, inset],
    target: 4.5,
    direction: mode === 'dark' ? 'light' : 'dark',
  });
  const pillDanger = solveForContrast({
    hue: seed.neutral ? 0 : 8,
    saturation: seed.neutral ? 0 : 0.7,
    against: [appBg, sidebarBg, surface, raised, inset],
    target: 4.5,
    direction: mode === 'dark' ? 'light' : 'dark',
  });

  return {
    '--app-bg': appBg,
    '--sidebar-bg': sidebarBg,
    '--surface': surface,
    '--surface-raised': raised,
    '--surface-inset': inset,
    '--border-subtle': grey(ramp.border),
    '--text-primary': textPrimary,
    '--text-muted': textMuted,
    '--brand': brand,
    '--brand-alt': brand,
    '--brand-on-tint': brandOnTint,
    '--accent-strong': accentStrong,
    '--focus-ring': brand,
    '--link': brand,
    '--pill-danger-fg': pillDanger,
    '--pill-danger-border': rgbHex(mix(pillDanger, surface, mode === 'dark' ? 26 : 22)),
    '--pill-warm-fg': pillWarm,
    '--pill-warm-border': rgbHex(mix(pillWarm, surface, mode === 'dark' ? 26 : 22)),
  };
}

function rgbHex(c: { r: number; g: number; b: number }): string {
  const h = (n: number) => Math.round(n).toString(16).padStart(2, '0');
  return `#${h(c.r)}${h(c.g)}${h(c.b)}`;
}

/**
 * The swatch shown in the picker — three dots that read as the theme at a
 * glance, so nobody has to apply all ten to find out what they look like.
 */
export function paletteSwatch(seed: PaletteSeed, mode: ThemeMode): [string, string, string] {
  const t = buildPalette(seed, mode);
  return [t['--app-bg'], t['--surface-inset'], t['--brand']];
}

/** Every palette as CSS, keyed on `data-palette` and `data-theme`. */
export function palettesCss(): string {
  const blocks: string[] = [];
  for (const seed of PALETTES) {
    for (const mode of ['dark', 'light'] as const) {
      const tokens = buildPalette(seed, mode);
      const body = Object.entries(tokens)
        .map(([k, v]) => `${k}:${v}`)
        .join(';');
      // Dark is the base for a palette, matching the app's own :root; light is
      // the qualified override, so an unknown data-theme renders dark exactly
      // as it did before palettes existed.
      const selector =
        mode === 'dark'
          ? `:root[data-palette="${seed.id}"]:not([data-theme="light"])`
          : `:root[data-palette="${seed.id}"][data-theme="light"]`;
      blocks.push(`${selector}{color-scheme:${mode};${body}}`);
    }
  }
  return blocks.join('\n');
}

/** Reported by the contrast test, and useful when adding a palette. */
export function worstContrast(seed: PaletteSeed, mode: ThemeMode): number {
  const t = buildPalette(seed, mode);
  const surfaces = [t['--app-bg'], t['--surface'], t['--surface-raised'], t['--surface-inset']];
  const ratios = [
    ...surfaces.map((bg) => contrast(t['--text-primary'], bg)),
    ...surfaces.map((bg) => contrast(t['--text-muted'], bg)),
    ...surfaces.map((bg) => contrast(t['--brand'], bg)),
    ...TINTS.flatMap((pct) =>
      surfaces.map((bg) => contrast(t['--brand-on-tint'], mix(t['--brand'], bg, pct))),
    ),
    contrast('#ffffff', t['--accent-strong']),
  ];
  return Math.min(...ratios);
}
