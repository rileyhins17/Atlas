import type { ExerciseKind, WorkoutSetDTO } from './fitness.js';

/**
 * Pure training maths — no DB, no Nest. Kept separate so the rules that decide
 * what "counts" are unit-testable, because they are exactly the rules a lifter
 * will notice being wrong.
 */

/** A row shaped like a logged set; narrow enough for both Prisma rows and DTOs. */
export interface SetLike {
  weightGrams?: number | null;
  reps?: number | null;
  warmup?: boolean;
}

/**
 * Session volume = Σ(weight × reps) over WORKING sets, in grams.
 *
 * Warm-ups are excluded deliberately: counting them lets you inflate a session
 * by adding empty-bar sets, which makes the number useless as a progress
 * signal. Sets without both a weight and reps (a plank, a run) contribute zero
 * rather than being guessed at.
 */
export function workoutVolumeGrams(sets: SetLike[]): number {
  let total = 0;
  for (const s of sets) {
    if (s.warmup) continue;
    if (s.weightGrams == null || s.reps == null) continue;
    total += s.weightGrams * s.reps;
  }
  return total;
}

/** Working sets — what a lifter means by "3 sets", warm-ups excluded. */
export function countWorkingSets(sets: SetLike[]): number {
  return sets.filter((s) => !s.warmup).length;
}

/**
 * Heaviest working set in a list, in grams, or null when nothing qualifies.
 * Requires reps ≥ 1: a weight logged with zero reps was never actually lifted.
 */
export function bestWeightGrams(sets: SetLike[]): number | null {
  let best: number | null = null;
  for (const s of sets) {
    if (s.warmup) continue;
    if (s.weightGrams == null || (s.reps ?? 0) < 1) continue;
    if (best === null || s.weightGrams > best) best = s.weightGrams;
  }
  return best;
}

/**
 * Did this set beat every previous working set on the movement?
 *
 * Strictly greater, so repeating your best is not announced as a new record —
 * an app that calls everything a PR trains you to ignore the word.
 */
export function isPersonalRecord(set: SetLike, previousBestGrams: number | null): boolean {
  if (set.warmup) return false;
  if (set.weightGrams == null || (set.reps ?? 0) < 1) return false;
  if (previousBestGrams === null) return true;
  return set.weightGrams > previousBestGrams;
}

/** Grams → kg, rounded to one decimal (the granularity of real plates). */
export function gramsToKg(grams: number): number {
  return Math.round(grams / 100) / 10;
}

/** kg → integer grams. The single conversion point on the way in. */
export function kgToGrams(kg: number): number {
  return Math.round(kg * 1000);
}

/** Exactly one pound, by international definition. Not an approximation. */
const GRAMS_PER_LB = 453.59237;

/** Grams → lb, rounded to one decimal. */
export function gramsToLb(grams: number): number {
  return Math.round((grams / GRAMS_PER_LB) * 10) / 10;
}

/** lb → integer grams. The single conversion point on the way in. */
export function lbToGrams(lb: number): number {
  return Math.round(lb * GRAMS_PER_LB);
}

/**
 * Display unit. Storage is always integer grams, so this only ever affects what
 * is rendered and what the entry field means — switching it never rewrites a
 * logged set, and a session logged in lb reads correctly in kg and back.
 */
export type WeightUnit = 'lb' | 'kg';

/** Grams → the user's unit, as a number. */
export function gramsToUnit(grams: number, unit: WeightUnit): number {
  return unit === 'kg' ? gramsToKg(grams) : gramsToLb(grams);
}

/** The user's unit → integer grams. */
export function unitToGrams(value: number, unit: WeightUnit): number {
  return unit === 'kg' ? kgToGrams(value) : lbToGrams(value);
}

/** "185 lb" / "80 kg", with the trailing ".0" dropped. */
export function formatWeight(grams: number, unit: WeightUnit): string {
  const n = gramsToUnit(grams, unit);
  return `${Number.isInteger(n) ? n : n.toFixed(1)} ${unit}`;
}

/**
 * The smallest increment worth offering as a one-tap bump: 5 lb is the standard
 * plate pair in an imperial gym, 2.5 kg in a metric one.
 */
export function stepFor(unit: WeightUnit): number {
  return unit === 'kg' ? 2.5 : 5;
}

/** "185 lb × 5", "45s", "5 km" — one set rendered for a summary line or the AI. */
export function describeSet(
  set: WorkoutSetDTO,
  kind: ExerciseKind,
  unit: WeightUnit = 'lb',
): string {
  if (kind === 'duration') return `${set.durationSec ?? 0}s`;
  if (kind === 'distance') {
    const m = set.distanceM ?? 0;
    return m >= 1000 ? `${Math.round(m / 100) / 10} km` : `${m} m`;
  }
  if (kind === 'reps') return `${set.reps ?? 0} reps`;
  if (set.weightGrams == null) return `${set.reps ?? 0} reps`;
  return `${formatWeight(set.weightGrams, unit)} × ${set.reps ?? 0}`;
}

/**
 * Group a workout's sets by exercise, preserving the order they were logged in.
 * The logger renders per-exercise blocks, so this is the shape it needs.
 */
export function groupSetsByExercise(
  sets: WorkoutSetDTO[],
): { exerciseId: string; exerciseName: string; kind: ExerciseKind; sets: WorkoutSetDTO[] }[] {
  const order: string[] = [];
  const byId = new Map<string, { exerciseId: string; exerciseName: string; kind: ExerciseKind; sets: WorkoutSetDTO[] }>();
  for (const s of [...sets].sort((a, b) => a.position - b.position)) {
    let group = byId.get(s.exerciseId);
    if (!group) {
      group = { exerciseId: s.exerciseId, exerciseName: s.exerciseName, kind: s.kind, sets: [] };
      byId.set(s.exerciseId, group);
      order.push(s.exerciseId);
    }
    group.sets.push(s);
  }
  return order.map((id) => byId.get(id)!);
}

/**
 * Estimated one-rep max (Epley): weight × (1 + reps/30).
 *
 * This is the number a strength tracker actually needs. Raw top-set weight
 * lies about progress — 185×5 and 205×1 are nearly the same effort, and
 * comparing them by weight alone says you got stronger when you did not.
 * e1RM puts every set on one scale so a trend line means something.
 *
 * Only meaningful in the low-rep range: past about 12 reps the formula drifts
 * badly (it would claim a 20-rep set is a bigger max than a true single), so
 * high-rep sets return null rather than a confident wrong number.
 */
const E1RM_MAX_REPS = 12;

export function estimatedOneRepMax(weightGrams: number, reps: number): number | null {
  if (weightGrams <= 0 || reps <= 0 || reps > E1RM_MAX_REPS) return null;
  if (reps === 1) return weightGrams;
  return Math.round(weightGrams * (1 + reps / 30));
}

/** The heaviest single-set effort in a list, by e1RM. Warm-ups never count. */
export function bestEffort(
  sets: Pick<WorkoutSetDTO, 'weightGrams' | 'reps' | 'warmup'>[],
): { e1RM: number; weightGrams: number; reps: number } | null {
  let best: { e1RM: number; weightGrams: number; reps: number } | null = null;
  for (const s of sets) {
    if (s.warmup || s.weightGrams == null || s.reps == null) continue;
    const e1RM = estimatedOneRepMax(s.weightGrams, s.reps);
    if (e1RM === null) continue;
    if (!best || e1RM > best.e1RM) best = { e1RM, weightGrams: s.weightGrams, reps: s.reps };
  }
  return best;
}

export interface StrengthPoint {
  /** ISO date of the session. */
  at: string;
  e1RM: number;
  weightGrams: number;
  reps: number;
}

/**
 * One point per session for a single movement, oldest first — the shape a
 * progressive-overload chart needs.
 *
 * Sessions where the movement was only warmed up, or only done for high reps,
 * contribute nothing rather than a fabricated zero that would draw a cliff
 * into the trend.
 */
export function strengthSeries(
  workouts: { startedAt: string; sets: WorkoutSetDTO[] }[],
  exerciseId: string,
): StrengthPoint[] {
  const points: StrengthPoint[] = [];
  for (const w of workouts) {
    const mine = w.sets.filter((s) => s.exerciseId === exerciseId);
    if (mine.length === 0) continue;
    const best = bestEffort(mine);
    if (!best) continue;
    points.push({ at: w.startedAt, e1RM: best.e1RM, weightGrams: best.weightGrams, reps: best.reps });
  }
  return points.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
}

/** Percent change between the first and last point, or null with under two. */
export function strengthTrendPct(points: StrengthPoint[]): number | null {
  if (points.length < 2) return null;
  const first = points[0]!.e1RM;
  const last = points[points.length - 1]!.e1RM;
  if (first <= 0) return null;
  return Math.round(((last - first) / first) * 1000) / 10;
}

export interface WorkoutSummaryStat {
  exerciseId: string;
  name: string;
  sets: number;
  bestWeightGrams: number | null;
  bestReps: number | null;
  /** True when this session's best beat everything before it. */
  isPr: boolean;
}

export interface WorkoutSummaryDTO {
  durationMin: number;
  workingSets: number;
  volumeGrams: number;
  exercises: WorkoutSummaryStat[];
  prCount: number;
  /** Volume change vs the previous session of the same name, as a percent. */
  volumeDeltaPct: number | null;
}

/**
 * Everything worth showing when a session ends.
 *
 * `history` is previous FINISHED workouts, newest first, and is used for two
 * different comparisons: per-exercise personal records (all of history) and
 * the volume delta (the most recent session with the same title, so "Push" is
 * compared against your last Push rather than against yesterday's Legs).
 */
export function summarizeWorkout(
  workout: { title: string; startedAt: string; endedAt: string | null; sets: WorkoutSetDTO[] },
  history: { title: string; startedAt: string; sets: WorkoutSetDTO[] }[] = [],
): WorkoutSummaryDTO {
  const end = workout.endedAt ? new Date(workout.endedAt) : new Date();
  const durationMin = Math.max(
    0,
    Math.round((end.getTime() - new Date(workout.startedAt).getTime()) / 60_000),
  );

  const working = workout.sets.filter((s) => !s.warmup);
  const byExercise = groupSetsByExercise(workout.sets);

  const exercises: WorkoutSummaryStat[] = byExercise.map((g) => {
    const best = bestEffort(g.sets);
    // Everything ever lifted on this movement before today.
    const priorSets = history.flatMap((h) => h.sets.filter((s) => s.exerciseId === g.exerciseId));
    const priorBest = bestEffort(priorSets);
    return {
      exerciseId: g.exerciseId,
      name: g.exerciseName,
      sets: g.sets.filter((s) => !s.warmup).length,
      bestWeightGrams: best?.weightGrams ?? null,
      bestReps: best?.reps ?? null,
      // A first-ever session is not a PR against nothing — that would badge
      // every movement on day one and teach you to ignore the word.
      isPr: Boolean(best && priorBest && best.e1RM > priorBest.e1RM),
    };
  });

  const volumeGrams = workoutVolumeGrams(workout.sets);
  const lastSame = history.find((h) => h.title === workout.title);
  const lastVolume = lastSame ? workoutVolumeGrams(lastSame.sets) : 0;
  const volumeDeltaPct =
    lastSame && lastVolume > 0
      ? Math.round(((volumeGrams - lastVolume) / lastVolume) * 1000) / 10
      : null;

  return {
    durationMin,
    workingSets: working.length,
    volumeGrams,
    exercises,
    prCount: exercises.filter((e) => e.isPr).length,
    volumeDeltaPct,
  };
}
