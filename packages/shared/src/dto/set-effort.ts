/**
 * How hard a set was, and what kind of set it was.
 *
 * A tracker that records only weight and reps knows what you moved and nothing
 * about what it cost. Two sets of 100kg x 5 are not the same session if one was
 * comfortable and the other was everything you had, and the difference is the
 * whole signal a programme is steered by. Every paid tracker records it; Atlas
 * recorded a single `warmup` boolean.
 */

/**
 * Rate of Perceived Exertion, 6 to 10 in half-point steps.
 *
 * Stored as TENTHS — 75 is RPE 7.5 — because a float column for a value that
 * only ever lands on a half is an invitation to 7.499999 and a display bug.
 * The same reasoning as weight being stored in integer grams.
 */
export const RPE_MIN_TENTHS = 60;
export const RPE_MAX_TENTHS = 100;
export const RPE_STEP_TENTHS = 5;

/** Every value the picker offers, hardest first — the common answers are high. */
export const RPE_CHOICES: number[] = Array.from(
  { length: (RPE_MAX_TENTHS - RPE_MIN_TENTHS) / RPE_STEP_TENTHS + 1 },
  (_, i) => RPE_MAX_TENTHS - i * RPE_STEP_TENTHS,
);

export function isValidRpe(tenths: number): boolean {
  return (
    Number.isInteger(tenths) &&
    tenths >= RPE_MIN_TENTHS &&
    tenths <= RPE_MAX_TENTHS &&
    (tenths - RPE_MIN_TENTHS) % RPE_STEP_TENTHS === 0
  );
}

/** "7.5" or "8" — never "8.0", which reads as more precision than exists. */
export function formatRpe(tenths: number): string {
  const value = tenths / 10;
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/**
 * Reps in reserve — the same number said the other way round.
 *
 * RPE 8 means two reps left. Half the training world thinks in one and half in
 * the other, and converting is subtraction, so there is no reason to make
 * anyone do it in their head. Above RPE 10 there is nothing in reserve.
 */
export function rpeToRir(tenths: number): number {
  return Math.max(0, (RPE_MAX_TENTHS - tenths) / 10);
}

/** "RPE 8 · 2 left" — the label under a logged set. */
export function describeEffort(tenths: number): string {
  const rir = rpeToRir(tenths);
  if (rir === 0) return `RPE ${formatRpe(tenths)} · all out`;
  return `RPE ${formatRpe(tenths)} · ${rir === 1 ? '1 left' : `${rir} left`}`;
}

/**
 * What kind of set this was.
 *
 * `warmup` stays a real column because volume, records and every existing
 * screen already read it, and rewriting that to derive from a string is risk
 * with no payoff. This is the richer field alongside it, and the service keeps
 * the two in step at write time so there is exactly one writer and no drift.
 */
export const SET_TYPES = ['normal', 'warmup', 'drop', 'failure', 'amrap'] as const;
export type SetType = (typeof SET_TYPES)[number];

export const SET_TYPE_LABELS: Record<SetType, string> = {
  normal: 'Working',
  warmup: 'Warm-up',
  drop: 'Drop set',
  failure: 'To failure',
  amrap: 'AMRAP',
};

/** The single letter shown in the set list, where there is room for one. */
export const SET_TYPE_MARKS: Record<SetType, string> = {
  normal: '',
  warmup: 'W',
  drop: 'D',
  failure: 'F',
  amrap: 'A',
};

/**
 * Does this kind of set count towards volume and records?
 *
 * Warm-ups never do. Everything else does, including drop sets and sets taken
 * to failure — they are work, and a tracker that discounted them would
 * under-report the hardest part of a session.
 */
export function countsAsWork(type: SetType): boolean {
  return type !== 'warmup';
}

export function isSetType(value: string): value is SetType {
  return (SET_TYPES as readonly string[]).includes(value);
}
