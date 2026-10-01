import {
  clockToSeconds,
  kmToMeters,
  unitToGrams,
  type ExerciseKind,
  type LogSetInput,
  type SetMeasure,
  type WeightUnit,
} from '@atlas/shared';

/** The entry row's text boxes, exactly as typed. */
export interface EntryText {
  weight: string;
  reps: string;
  minutes: string;
  seconds: string;
  km: string;
}

export type SetMeasurements = Pick<LogSetInput, 'weightGrams' | 'reps' | 'durationSec' | 'distanceM'>;

type Read = { state: 'empty' } | { state: 'bad' } | { state: 'ok'; patch: SetMeasurements };

const EMPTY: Read = { state: 'empty' };
const BAD: Read = { state: 'bad' };
const blank = (s: string) => s.trim() === '';

function readWeight(text: string, unit: WeightUnit, zeroCounts: boolean): Read {
  if (blank(text)) return EMPTY;
  const n = Number(text);
  if (!Number.isFinite(n) || n < 0) return BAD;
  // Zero is a real load on a lift, and "none" on anything that only allows an added weight.
  if (n === 0 && !zeroCounts) return EMPTY;
  return { state: 'ok', patch: { weightGrams: unitToGrams(n, unit) } };
}

function readReps(text: string): Read {
  if (blank(text)) return EMPTY;
  const n = Number(text);
  return Number.isInteger(n) && n >= 1 ? { state: 'ok', patch: { reps: n } } : BAD;
}

function readTime(minutes: string, seconds: string): Read {
  if (blank(minutes) && blank(seconds)) return EMPTY;
  const m = blank(minutes) ? 0 : Number(minutes);
  const s = blank(seconds) ? 0 : Number(seconds);
  if (!Number.isInteger(m) || !Number.isInteger(s) || m < 0 || s < 0) return BAD;
  const total = clockToSeconds(m, s);
  return total === 0 ? EMPTY : { state: 'ok', patch: { durationSec: total } };
}

function readDistance(km: string): Read {
  if (blank(km)) return EMPTY;
  const n = Number(km);
  if (!Number.isFinite(n) || n < 0) return BAD;
  const metres = kmToMeters(n);
  return metres === 0 ? EMPTY : { state: 'ok', patch: { distanceM: metres } };
}

/**
 * What the entry row will submit, and whether it may. Only the measures on screen count.
 * The form's native validation is off, so this is the one rule: a weight and reps lift needs
 * both; anything else needs at least one thing done, since a weight alone is not a set.
 */
export function resolveSetEntry(
  kind: ExerciseKind,
  shown: readonly SetMeasure[],
  text: EntryText,
  unit: WeightUnit,
): { valid: boolean; measurements: SetMeasurements } {
  const strict = kind === 'weight_reps';
  const reads = new Map<SetMeasure, Read>();
  for (const measure of shown) {
    reads.set(
      measure,
      measure === 'weight'
        ? readWeight(text.weight, unit, strict)
        : measure === 'reps'
          ? readReps(text.reps)
          : measure === 'time'
            ? readTime(text.minutes, text.seconds)
            : readDistance(text.km),
    );
  }

  const measurements: SetMeasurements = {};
  let bad = false;
  for (const read of reads.values()) {
    if (read.state === 'bad') bad = true;
    if (read.state === 'ok') Object.assign(measurements, read.patch);
  }

  const done = (m: SetMeasure) => reads.get(m)?.state === 'ok';
  const enough = strict
    ? done('weight') && done('reps')
    : done('reps') || done('time') || done('distance');

  return { valid: !bad && enough, measurements };
}
