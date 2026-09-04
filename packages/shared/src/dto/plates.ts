import type { WeightUnit } from './fitness-util.js';
import { gramsToUnit, unitToGrams } from './fitness-util.js';

/**
 * What to actually put on the bar.
 *
 * Everyone doing this arithmetic in their head between sets gets it wrong
 * eventually, and getting it wrong means a set logged at a weight you did not
 * lift — which quietly poisons every record and trend built on it. It is the
 * one piece of maths a lifter does under fatigue, so it is the one worth doing
 * for them.
 *
 * Pure, so it is tested rather than eyeballed at a squat rack.
 */

/** Pairs available in a normal gym, heaviest first. Per SIDE is what matters. */
export const PLATES_KG = [25, 20, 15, 10, 5, 2.5, 1.25];
export const PLATES_LB = [45, 35, 25, 10, 5, 2.5];

/** An Olympic bar. 20kg and 45lb are the same bar described two ways. */
export const BAR_KG = 20;
export const BAR_LB = 45;

export function defaultPlates(unit: WeightUnit): number[] {
  return unit === 'kg' ? PLATES_KG : PLATES_LB;
}

export function defaultBar(unit: WeightUnit): number {
  return unit === 'kg' ? BAR_KG : BAR_LB;
}

export interface PlateLoad {
  /** Plates for ONE side, heaviest first — which is how they go on. */
  perSide: number[];
  /** What the bar plus these plates actually weighs, in the given unit. */
  achievable: number;
  /** Target minus achievable. Non-zero when the gym cannot make the number. */
  shortfallBy: number;
  /** True when the target is below the empty bar. */
  belowBar: boolean;
}

/**
 * The plates for one side of a loaded bar, greedily heaviest-first.
 *
 * Greedy is correct for real plate sets, where every plate divides the ones
 * above it, and it is also what a person does at the rack. It reports what it
 * could NOT make rather than rounding silently: told to load 102.5kg with no
 * 1.25s, the honest answer is "100, you are 2.5 short", not a number that never
 * existed.
 */
export function platesFor(
  targetInUnit: number,
  unit: WeightUnit,
  opts: { bar?: number; plates?: number[] } = {},
): PlateLoad {
  const bar = opts.bar ?? defaultBar(unit);
  const plates = (opts.plates ?? defaultPlates(unit)).slice().sort((a, b) => b - a);

  if (targetInUnit < bar) {
    return { perSide: [], achievable: bar, shortfallBy: 0, belowBar: true };
  }

  // Work in hundredths to keep 2.5 + 1.25 from drifting in binary floating
  // point — the same reason weight is stored in grams rather than kilograms.
  const cents = (n: number) => Math.round(n * 100);
  let remainingPerSide = cents(targetInUnit - bar) / 2;
  const perSide: number[] = [];

  for (const plate of plates) {
    const p = cents(plate);
    while (remainingPerSide >= p) {
      perSide.push(plate);
      remainingPerSide -= p;
    }
  }

  const loaded = perSide.reduce((n, p) => n + cents(p), 0) * 2;
  const achievable = (cents(bar) + loaded) / 100;
  return {
    perSide,
    achievable,
    shortfallBy: Math.round((targetInUnit - achievable) * 100) / 100,
    belowBar: false,
  };
}

/** The same, from the grams the app stores. */
export function platesForGrams(
  grams: number,
  unit: WeightUnit,
  opts?: { bar?: number; plates?: number[] },
): PlateLoad {
  return platesFor(gramsToUnit(grams, unit), unit, opts);
}

/** "2 × 20, 1 × 5" — how you would say it out loud, not a list of numbers. */
export function describePlates(perSide: number[], unit: WeightUnit): string {
  if (perSide.length === 0) return 'empty bar';
  const counts = new Map<number, number>();
  for (const p of perSide) counts.set(p, (counts.get(p) ?? 0) + 1);
  return [...counts.entries()].map(([plate, n]) => `${n} × ${plate}${unit}`).join(', ');
}

/** Grams for a bar-plus-plates load, so a calculated weight can be logged. */
export function loadToGrams(achievable: number, unit: WeightUnit): number {
  return unitToGrams(achievable, unit);
}
