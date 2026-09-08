import type { HabitDTO, HabitHistoryDTO } from './dto/habit.js';
import type { TrackerDTO, TrackerEntryDTO, TrackerDirection } from './dto/trackers.js';
import { summariseTracker, describeTracker } from './dto/trackers.js';
import type { ExerciseHistoryDTO, ExerciseSessionDTO, LastPerformanceDTO } from './dto/fitness.js';
import { bestWeightGrams } from './dto/fitness-util.js';
import { bestE1rm, exerciseRecords, setVolumeGrams } from './dto/exercise-records.js';
import { serializeExercise as toExerciseDto, serializeWorkoutSet as toSetDto, type ExerciseRecord } from './fitness-serialization.js';
import { dayKeyInTz } from './time.js';
import { computeHabitStreak } from './habit-streak.js';
import type { TrackerSummaryOverview } from './domain-summaries.js';

export type HabitRecord = Omit<HabitDTO, 'todayCount' | 'doneToday' | 'streak' | 'createdAt'> & { createdAt: Date };
export interface HabitDayTotal { habitId: string; day: string; value: number; }
export type TrackerRecord = Omit<TrackerDTO, 'direction' | 'createdAt' | 'todayValue'> & { direction: string; createdAt: Date };
export type TrackerHistoryRow = { trackerId: string; dayKey: string; value: number };
export type PreviousWorkoutSet = Omit<Parameters<typeof toSetDto>[0], 'exercise'> & { workoutId: string };
export type ExerciseHistoryRow = PreviousWorkoutSet & { workout: { id: string; title: string; startedAt: Date } };

export function serializeHabit(habit: HabitRecord, logs: HabitDayTotal[], todayNow: Date, streakNow: Date, timezone = 'UTC'): HabitDTO {
  const perDay = new Map<string, number>();
  for (const log of logs) {
    const k = log.day;
    perDay.set(k, (perDay.get(k) ?? 0) + log.value);
  }
  const todayCount = perDay.get(dayKeyInTz(todayNow, timezone)) ?? 0;
  return {
    id: habit.id,
    name: habit.name,
    cadence: habit.cadence,
    target: habit.target,
    active: habit.active,
    todayCount,
    doneToday: todayCount >= habit.target,
    streak: computeHabitStreak(perDay, habit.target, streakNow, timezone),
    createdAt: habit.createdAt.toISOString(),
  };
}

export function groupHabitTotals(logs: HabitDayTotal[]): Map<string, HabitDayTotal[]> {
  const byHabit = new Map<string, HabitDayTotal[]>();
  for (const log of logs) {
    const arr = byHabit.get(log.habitId) ?? [];
    arr.push(log);
    byHabit.set(log.habitId, arr);
  }
  return byHabit;
}

export function assembleHabitHistory(habits: { id: string }[], logs: HabitDayTotal[]): HabitHistoryDTO[] {
  const perHabit = new Map<string, Map<string, number>>(habits.map((h) => [h.id, new Map()]));
  for (const log of logs) {
    const dayMap = perHabit.get(log.habitId);
    if (!dayMap) continue; // log for an archived habit
    const k = log.day;
    dayMap.set(k, (dayMap.get(k) ?? 0) + log.value);
  }
  return habits.map((h) => ({
    habitId: h.id,
    days: [...(perHabit.get(h.id) ?? new Map<string, number>())].map(([day, count]) => ({
      day,
      count,
    })),
  }));
}

export function serializeTracker(row: TrackerRecord, todayValue: number | null): TrackerDTO {
  return {
    id: row.id,
    name: row.name,
    emoji: row.emoji,
    direction: row.direction as TrackerDirection,
    lowLabel: row.lowLabel,
    highLabel: row.highLabel,
    active: row.active,
    position: row.position,
    createdAt: row.createdAt.toISOString(),
    todayValue,
  };
}

export function serializeTrackerEntry(row: TrackerEntryDTO): TrackerEntryDTO {
  return {
    id: row.id,
    trackerId: row.trackerId,
    dayKey: row.dayKey,
    value: row.value,
    note: row.note,
  };
}

export function assembleTrackerOverview(trackers: TrackerDTO[], rows: TrackerHistoryRow[]): TrackerSummaryOverview[] {
  const byTracker = new Map<string, { dayKey: string; value: number }[]>();
  for (const r of rows) {
    const list = byTracker.get(r.trackerId) ?? [];
    list.push({ dayKey: r.dayKey, value: r.value });
    byTracker.set(r.trackerId, list);
  }

  return trackers.map((tracker) => {
    const points = (byTracker.get(tracker.id) ?? []).slice().reverse();
    const summary = summariseTracker(points, tracker.direction);
    return { tracker, points, sentence: describeTracker(tracker.name, summary, tracker.direction) };
  });
}

export function assembleExerciseHistory(exercise: ExerciseRecord, rows: ExerciseHistoryRow[], sessionLimit: number): ExerciseHistoryDTO {
  // The exercise is already loaded, so its name and kind are attached here
  // rather than joined onto every row — one movement, one lookup.
  const withExercise = (row: (typeof rows)[number]) =>
    toSetDto({ ...row, exercise: { name: exercise.name, kind: exercise.kind } });

  // Grouped in memory rather than with a query per session — the same N+1
  // that made Google sync take five minutes.
  const byWorkout = new Map<string, { title: string; startedAt: Date; sets: typeof rows }>();
  for (const row of rows) {
    const existing = byWorkout.get(row.workoutId);
    if (existing) existing.sets.push(row);
    else
      byWorkout.set(row.workoutId, {
        title: row.workout.title,
        startedAt: row.workout.startedAt,
        sets: [row],
      });
  }

  const sessions: ExerciseSessionDTO[] = [...byWorkout.entries()]
    .sort((a, b) => b[1].startedAt.getTime() - a[1].startedAt.getTime())
    .slice(0, sessionLimit)
    .map(([workoutId, w]) => {
      // Ascending within a session: the order you did them in is the story.
      const sets = w.sets
        .slice()
        .sort((a, b) => a.completedAt.getTime() - b.completedAt.getTime())
        .map(withExercise);
      return {
        workoutId,
        workoutTitle: w.title,
        performedAt: w.startedAt.toISOString(),
        sets,
        volumeGrams: setVolumeGrams(sets),
        bestE1rmGrams: bestE1rm(sets),
      };
    });

  return {
    exercise: toExerciseDto(exercise),
    sessions,
    // Records span every set read, not only the sessions shown, so a best
    // from further back is not quietly forgotten by the cap above.
    // Session-volume records need real session boundaries; flattening the
    // fetched history invents one giant workout. Use every group, including
    // groups outside the display cap above, so older records remain visible.
    records: exerciseRecords([...byWorkout.values()].map((w) => ({ sets: w.sets.map(withExercise) }))),
  };
}

export function assembleLastPerformance(exerciseId: string, previous: PreviousWorkoutSet[]): LastPerformanceDTO | null {
  if (previous.length === 0) return null;

  const latestWorkoutId = previous[0]!.workoutId;
  const lastSets = previous
    .filter((s) => s.workoutId === latestWorkoutId)
    .sort((a, b) => a.completedAt.getTime() - b.completedAt.getTime());

  return {
    exerciseId,
    performedAt: previous[0]!.completedAt.toISOString(),
    sets: lastSets.map((s) => ({
      weightGrams: s.weightGrams,
      reps: s.reps,
      durationSec: s.durationSec,
      distanceM: s.distanceM,
    })),
    bestWeightGrams: bestWeightGrams(previous),
  };
}
