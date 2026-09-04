import type { WorkoutSetDTO } from './fitness.js';
import { estimatedOneRepMax } from './fitness-util.js';

/**
 * What you have ever done with one movement.
 *
 * The pieces of this — `estimatedOneRepMax`, `bestEffort`, `strengthSeries` —
 * have been in this package since fitness shipped, and nothing ever put them on
 * a screen. Tapping "Squat" and seeing your heaviest set, your best estimated
 * one-rep max and the shape of the last six months is the screen a paid tracker
 * is actually used in, and Atlas had no equivalent: the only way to see what
 * you lifted last week was to scroll a wall of identical session cards.
 *
 * Warm-ups never count towards a record. Working up to a top set means the
 * lighter ones are not attempts at anything, and a tracker that congratulated
 * you for them would be a tracker you stopped believing.
 */
export interface ExerciseRecords {
  heaviestGrams: number | null;
  heaviestReps: number | null;
  bestE1rmGrams: number | null;
  bestSessionVolumeGrams: number | null;
  mostReps: number | null;
  totalSets: number;
}

type Set = Pick<WorkoutSetDTO, 'weightGrams' | 'reps' | 'warmup'>;

/** Working-set volume: weight times reps, warm-ups excluded. */
export function setVolumeGrams(sets: Set[]): number {
  let total = 0;
  for (const s of sets) {
    if (s.warmup || s.weightGrams === null || s.reps === null) continue;
    total += s.weightGrams * s.reps;
  }
  return total;
}

/** The best estimated one-rep max among a session's working sets. */
export function bestE1rm(sets: Set[]): number | null {
  let best: number | null = null;
  for (const s of sets) {
    if (s.warmup || s.weightGrams === null || s.reps === null) continue;
    const e1rm = estimatedOneRepMax(s.weightGrams, s.reps);
    if (e1rm !== null && (best === null || e1rm > best)) best = e1rm;
  }
  return best;
}

/**
 * Records across every session of a movement.
 *
 * Four different records because they answer four different questions, and a
 * single "personal best" would hide three of them. The heaviest set is what you
 * brag about; the best estimated 1RM is what actually tracks strength, because
 * 100kg for 5 beats 105kg for 1; session volume is what tracks work done; and
 * most reps is the only one of the four that means anything for chin-ups.
 */
export function exerciseRecords(sessions: { sets: Set[] }[]): ExerciseRecords {
  const records: ExerciseRecords = {
    heaviestGrams: null,
    heaviestReps: null,
    bestE1rmGrams: null,
    bestSessionVolumeGrams: null,
    mostReps: null,
    totalSets: 0,
  };

  for (const session of sessions) {
    const volume = setVolumeGrams(session.sets);
    if (volume > 0 && (records.bestSessionVolumeGrams === null || volume > records.bestSessionVolumeGrams)) {
      records.bestSessionVolumeGrams = volume;
    }

    for (const s of session.sets) {
      if (s.warmup) continue;
      records.totalSets += 1;

      if (s.reps !== null && (records.mostReps === null || s.reps > records.mostReps)) {
        records.mostReps = s.reps;
      }
      if (s.weightGrams === null || s.reps === null) continue;

      // Ties break towards MORE reps: the same bar for eight is the better set
      // than the same bar for five, and calling them equal loses the progress.
      if (
        records.heaviestGrams === null ||
        s.weightGrams > records.heaviestGrams ||
        (s.weightGrams === records.heaviestGrams && s.reps > (records.heaviestReps ?? 0))
      ) {
        records.heaviestGrams = s.weightGrams;
        records.heaviestReps = s.reps;
      }

      const e1rm = estimatedOneRepMax(s.weightGrams, s.reps);
      if (e1rm !== null && (records.bestE1rmGrams === null || e1rm > records.bestE1rmGrams)) {
        records.bestE1rmGrams = e1rm;
      }
    }
  }

  return records;
}

/** Which records a single set would break, given what came before it. */
export interface BrokenRecords {
  heaviest: boolean;
  e1rm: boolean;
  reps: boolean;
}

/**
 * Does this set beat what came before?
 *
 * Checked against the records BEFORE the set, so the answer is "this was a
 * record when you did it" rather than "this is the record now" — which is what
 * makes a badge mid-session true. A set can break more than one at once, and
 * saying so is the difference between a tracker that notices and one that
 * congratulates you for existing.
 */
export function recordsBrokenBy(set: Set, before: ExerciseRecords): BrokenRecords {
  if (set.warmup) return { heaviest: false, e1rm: false, reps: false };

  const heaviest =
    set.weightGrams !== null &&
    set.reps !== null &&
    (before.heaviestGrams === null ||
      set.weightGrams > before.heaviestGrams ||
      (set.weightGrams === before.heaviestGrams && set.reps > (before.heaviestReps ?? 0)));

  const e1rmNow =
    set.weightGrams !== null && set.reps !== null
      ? estimatedOneRepMax(set.weightGrams, set.reps)
      : null;
  const e1rm = e1rmNow !== null && (before.bestE1rmGrams === null || e1rmNow > before.bestE1rmGrams);

  // Only a record for movements carrying no weight. On a barbell "most reps"
  // is a record you set by going lighter, which is not a record.
  const reps =
    set.weightGrams === null &&
    set.reps !== null &&
    (before.mostReps === null || set.reps > before.mostReps);

  return { heaviest, e1rm, reps };
}

/** The strongest claim a set earns, or null. Used for the badge's wording. */
export function describeRecord(broken: BrokenRecords): string | null {
  if (broken.heaviest) return 'Heaviest ever';
  if (broken.e1rm) return 'Best estimated 1RM';
  if (broken.reps) return 'Most reps';
  return null;
}
