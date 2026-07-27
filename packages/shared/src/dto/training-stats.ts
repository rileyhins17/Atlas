import type { WorkoutSetDTO } from './fitness.js';
import { bestEffort, workoutVolumeGrams } from './fitness-util.js';

/**
 * Training progress, in the terms a lifter actually asks about:
 * am I training enough, am I training everything, and is anything going up?
 *
 * Pure. Takes workouts the client already has cached plus a muscle lookup, so
 * there is no second source of truth about what you lifted.
 */

export interface TrainingWorkout {
  id: string;
  title: string;
  startedAt: string;
  endedAt: string | null;
  sets: WorkoutSetDTO[];
}

export interface WeekBucket {
  /** Monday of the week, as YYYY-MM-DD. */
  weekOf: string;
  sessions: number;
  workingSets: number;
  volumeGrams: number;
}

/** Monday-based week key, matching the rest of Atlas. */
function weekKey(iso: string): string {
  const d = new Date(iso);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Volume and session count per week, oldest first, with empty weeks included.
 *
 * The gaps matter: a chart that silently skips the weeks you did not train
 * makes a broken streak look like continuous progress.
 */
export function weeklyVolume(workouts: TrainingWorkout[], weeks = 8): WeekBucket[] {
  const done = workouts.filter((w) => w.endedAt !== null);
  const byWeek = new Map<string, WeekBucket>();
  for (const w of done) {
    const key = weekKey(w.startedAt);
    const b = byWeek.get(key) ?? { weekOf: key, sessions: 0, workingSets: 0, volumeGrams: 0 };
    b.sessions += 1;
    b.workingSets += w.sets.filter((s) => !s.warmup).length;
    b.volumeGrams += workoutVolumeGrams(w.sets);
    byWeek.set(key, b);
  }

  // Walk back `weeks` Mondays from this one so empty weeks are real zeroes.
  const out: WeekBucket[] = [];
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  cursor.setDate(cursor.getDate() - ((cursor.getDay() + 6) % 7));
  for (let i = weeks - 1; i >= 0; i--) {
    const d = new Date(cursor);
    d.setDate(d.getDate() - i * 7);
    const key = weekKey(d.toISOString());
    out.push(byWeek.get(key) ?? { weekOf: key, sessions: 0, workingSets: 0, volumeGrams: 0 });
  }
  return out;
}

export interface MuscleLoad {
  muscle: string;
  sets: number;
}

/**
 * Working sets per muscle group over a window — the "am I skipping legs"
 * question. Counted in SETS, not volume: volume is dominated by whichever
 * movement happens to be heaviest and would say you trained legs hard because
 * you deadlifted once.
 */
export function muscleLoad(
  workouts: TrainingWorkout[],
  muscleOf: (exerciseId: string) => string | undefined,
  sinceDays = 7,
): MuscleLoad[] {
  const cutoff = Date.now() - sinceDays * 86_400_000;
  const counts = new Map<string, number>();
  for (const w of workouts) {
    if (w.endedAt === null) continue;
    if (new Date(w.startedAt).getTime() < cutoff) continue;
    for (const s of w.sets) {
      if (s.warmup) continue;
      const m = muscleOf(s.exerciseId) ?? 'other';
      counts.set(m, (counts.get(m) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([muscle, sets]) => ({ muscle, sets }))
    .sort((a, b) => b.sets - a.sets);
}

export interface ExerciseProgress {
  exerciseId: string;
  name: string;
  sessions: number;
  /** Best estimated 1RM ever recorded. */
  bestE1RM: number;
  /** Most recent session's best effort. */
  latestE1RM: number;
  latestWeightGrams: number;
  latestReps: number;
  /** Percent change from the first recorded session to the latest. */
  changePct: number | null;
  /** True when the most recent session set a new all-time best. */
  atBest: boolean;
}

/**
 * Every movement you have trained at least once, with its trend — the table
 * behind "is anything actually going up".
 *
 * Sorted by how recently you trained it, because the movement you did today is
 * the one you want to see.
 */
export function exerciseProgress(workouts: TrainingWorkout[]): ExerciseProgress[] {
  const done = [...workouts]
    .filter((w) => w.endedAt !== null)
    .sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime());

  const acc = new Map<
    string,
    { name: string; efforts: { at: number; e1RM: number; w: number; reps: number }[] }
  >();

  for (const w of done) {
    const byExercise = new Map<string, WorkoutSetDTO[]>();
    for (const s of w.sets) {
      const list = byExercise.get(s.exerciseId) ?? [];
      list.push(s);
      byExercise.set(s.exerciseId, list);
    }
    for (const [id, sets] of byExercise) {
      const best = bestEffort(sets);
      if (!best) continue;
      const hit = acc.get(id) ?? { name: sets[0]!.exerciseName, efforts: [] };
      hit.efforts.push({
        at: new Date(w.startedAt).getTime(),
        e1RM: best.e1RM,
        w: best.weightGrams,
        reps: best.reps,
      });
      acc.set(id, hit);
    }
  }

  const out: ExerciseProgress[] = [];
  for (const [exerciseId, { name, efforts }] of acc) {
    if (efforts.length === 0) continue;
    const first = efforts[0]!;
    const latest = efforts[efforts.length - 1]!;
    const bestE1RM = efforts.reduce((m, e) => Math.max(m, e.e1RM), 0);
    out.push({
      exerciseId,
      name,
      sessions: efforts.length,
      bestE1RM,
      latestE1RM: latest.e1RM,
      latestWeightGrams: latest.w,
      latestReps: latest.reps,
      changePct:
        efforts.length < 2 || first.e1RM <= 0
          ? null
          : Math.round(((latest.e1RM - first.e1RM) / first.e1RM) * 1000) / 10,
      atBest: latest.e1RM >= bestE1RM,
    });
  }

  return out.sort((a, b) => b.sessions - a.sessions);
}

/** Headline numbers for the training progress view. */
export function trainingTotals(workouts: TrainingWorkout[]): {
  sessions: number;
  volumeGrams: number;
  workingSets: number;
  avgMinutes: number | null;
} {
  const done = workouts.filter((w) => w.endedAt !== null);
  const durations = done
    .map((w) => (new Date(w.endedAt!).getTime() - new Date(w.startedAt).getTime()) / 60_000)
    // A session left open for a day is a forgotten Finish, not a 26-hour
    // workout; excluding it keeps the average honest.
    .filter((m) => m > 0 && m < 240);
  return {
    sessions: done.length,
    volumeGrams: done.reduce((t, w) => t + workoutVolumeGrams(w.sets), 0),
    workingSets: done.reduce((t, w) => t + w.sets.filter((s) => !s.warmup).length, 0),
    avgMinutes:
      durations.length === 0
        ? null
        : Math.round(durations.reduce((a, b) => a + b, 0) / durations.length),
  };
}
