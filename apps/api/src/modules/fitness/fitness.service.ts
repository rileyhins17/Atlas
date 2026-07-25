import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  CreateExerciseInput,
  ExerciseDTO,
  ExerciseKind,
  FinishWorkoutInput,
  LastPerformanceDTO,
  LogSetInput,
  MuscleGroup,
  StartWorkoutInput,
  WorkoutDTO,
  WorkoutSetDTO,
} from '@atlas/shared';
import {
  bestWeightGrams,
  // Pure training maths lives in @atlas/shared so the logger UI and the API
  // compute volume, records and set labels from ONE implementation.
  countWorkingSets,
  describeSet,
  gramsToKg,
  groupSetsByExercise,
  workoutVolumeGrams,
} from '@atlas/shared';
import type { Exercise, Prisma } from '@atlas/db';
import { PrismaService } from '../../core/prisma.service.js';
import { TimelineService } from '../../core/timeline.service.js';
import { EXERCISE_CATALOG } from './exercise-catalog.js';


/** A workout row with its sets and each set's exercise, as every read needs. */
type WorkoutWithSets = Prisma.WorkoutGetPayload<{
  include: { sets: { include: { exercise: true } } };
}>;

const MAX_PAGE = 100;

function toExerciseDto(e: Exercise): ExerciseDTO {
  return {
    id: e.id,
    name: e.name,
    muscle: e.muscle as MuscleGroup,
    kind: e.kind as ExerciseKind,
    custom: e.userId !== null,
  };
}

function toWorkoutDto(w: WorkoutWithSets): WorkoutDTO {
  const sets: WorkoutSetDTO[] = w.sets.map((s) => ({
    id: s.id,
    exerciseId: s.exerciseId,
    exerciseName: s.exercise.name,
    kind: s.exercise.kind as ExerciseKind,
    position: s.position,
    weightGrams: s.weightGrams,
    reps: s.reps,
    durationSec: s.durationSec,
    distanceM: s.distanceM,
    warmup: s.warmup,
    completedAt: s.completedAt.toISOString(),
  }));
  return {
    id: w.id,
    title: w.title,
    notes: w.notes,
    startedAt: w.startedAt.toISOString(),
    endedAt: w.endedAt?.toISOString() ?? null,
    sets,
    volumeGrams: workoutVolumeGrams(sets),
    workingSets: countWorkingSets(sets),
  };
}

const WITH_SETS = {
  sets: { include: { exercise: true }, orderBy: { position: 'asc' } },
} satisfies Prisma.WorkoutInclude;

/**
 * Strength training as a first-class life domain.
 *
 * The session model is the one every good training app converges on: ONE open
 * workout at a time (`endedAt === null`), sets appended as they happen, and the
 * previous performance always available so you know what you are trying to
 * beat. Nothing is pre-planned — a workout is a record of what you did, not a
 * template you have to fill in first.
 */
@Injectable()
export class FitnessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly timeline: TimelineService,
  ) {}

  // ── Exercises ─────────────────────────────────────────────────────────────

  /**
   * Seed the shared catalog once, inserting only names that aren't there yet.
   *
   * `skipDuplicates` CANNOT do this job: the guard would be `@@unique([userId,
   * name])`, and Postgres treats NULLs as distinct, so two catalog rows with
   * `userId = null` and the same name never collide. Relying on it duplicated
   * the whole catalog on every boot (verified: 64 rows for 32 exercises). The
   * name check has to be explicit.
   */
  async seedCatalog(): Promise<number> {
    const existing = await this.prisma.client.exercise.findMany({
      where: { userId: null },
      select: { name: true },
    });
    const have = new Set(existing.map((e) => e.name));
    const missing = EXERCISE_CATALOG.filter((e) => !have.has(e.name));
    if (missing.length === 0) return 0;

    const result = await this.prisma.client.exercise.createMany({
      data: missing.map((e) => ({ ...e, userId: null })),
      skipDuplicates: true,
    });
    return result.count;
  }

  /** The shared catalog plus this user's own additions, alphabetical. */
  async listExercises(userId: string): Promise<ExerciseDTO[]> {
    const rows = await this.prisma.client.exercise.findMany({
      where: { OR: [{ userId: null }, { userId }] },
      orderBy: { name: 'asc' },
    });
    return rows.map(toExerciseDto);
  }

  async createExercise(userId: string, input: CreateExerciseInput): Promise<ExerciseDTO> {
    const existing = await this.prisma.client.exercise.findFirst({
      where: { name: input.name, OR: [{ userId: null }, { userId }] },
    });
    // Adding a movement that already exists should hand back the existing one
    // rather than 409 — from the user's side they asked for it to be there.
    if (existing) return toExerciseDto(existing);

    const created = await this.prisma.client.exercise.create({
      data: { userId, name: input.name, muscle: input.muscle, kind: input.kind },
    });
    return toExerciseDto(created);
  }

  // ── Workouts ──────────────────────────────────────────────────────────────

  /** The open session, or null. This is what "resume workout" reads. */
  async active(userId: string): Promise<WorkoutDTO | null> {
    const w = await this.prisma.client.workout.findFirst({
      where: { userId, endedAt: null },
      orderBy: { startedAt: 'desc' },
      include: WITH_SETS,
    });
    return w ? toWorkoutDto(w) : null;
  }

  /**
   * Start a session, or return the one already open. Two "Start workout" taps
   * must not strand the first session's sets in an invisible second workout.
   */
  async start(userId: string, input: StartWorkoutInput): Promise<WorkoutDTO> {
    const open = await this.active(userId);
    if (open) return open;

    const created = await this.prisma.client.workout.create({
      data: { userId, title: input.title?.trim() || 'Workout' },
      include: WITH_SETS,
    });
    await this.timeline.write({
      userId,
      type: 'workout.started',
      source: 'fitness',
      title: `Started: ${created.title}`,
      refType: 'workout',
      refId: created.id,
    });
    return toWorkoutDto(created);
  }

  private async ownedWorkout(userId: string, id: string): Promise<WorkoutWithSets> {
    const w = await this.prisma.client.workout.findFirst({
      where: { id, userId },
      include: WITH_SETS,
    });
    if (!w) throw new NotFoundException('Workout not found');
    return w;
  }

  /** Append a set to the open workout. */
  async logSet(userId: string, workoutId: string, input: LogSetInput): Promise<WorkoutDTO> {
    const workout = await this.ownedWorkout(userId, workoutId);
    if (workout.endedAt) throw new BadRequestException('That workout is already finished');

    const exercise = await this.prisma.client.exercise.findFirst({
      where: { id: input.exerciseId, OR: [{ userId: null }, { userId }] },
    });
    if (!exercise) throw new NotFoundException('Exercise not found');

    // Sets of the same exercise share its position, so the logger's per-exercise
    // blocks stay in the order the exercises were started.
    const samePosition = workout.sets.find((s) => s.exerciseId === input.exerciseId)?.position;
    const position =
      samePosition ?? workout.sets.reduce((max, s) => Math.max(max, s.position + 1), 0);

    await this.prisma.client.workoutSet.create({
      data: {
        userId,
        workoutId,
        exerciseId: input.exerciseId,
        position,
        weightGrams: input.weightGrams,
        reps: input.reps,
        durationSec: input.durationSec,
        distanceM: input.distanceM,
        warmup: input.warmup,
      },
    });
    return toWorkoutDto(await this.ownedWorkout(userId, workoutId));
  }

  async deleteSet(userId: string, workoutId: string, setId: string): Promise<WorkoutDTO> {
    await this.ownedWorkout(userId, workoutId);
    // userId in the filter is what stops one account deleting another's set.
    const deleted = await this.prisma.client.workoutSet.deleteMany({
      where: { id: setId, workoutId, userId },
    });
    if (deleted.count === 0) throw new NotFoundException('Set not found');
    return toWorkoutDto(await this.ownedWorkout(userId, workoutId));
  }

  /**
   * Close the session. An empty workout is deleted rather than kept: a session
   * you started and logged nothing into is a misfire, and leaving it in history
   * makes the history lie about how often you trained.
   */
  async finish(
    userId: string,
    workoutId: string,
    input: FinishWorkoutInput,
  ): Promise<WorkoutDTO | null> {
    const workout = await this.ownedWorkout(userId, workoutId);
    if (workout.endedAt) return toWorkoutDto(workout);

    if (workout.sets.length === 0) {
      await this.prisma.client.workout.delete({ where: { id: workoutId } });
      return null;
    }

    const finished = await this.prisma.client.workout.update({
      where: { id: workoutId },
      data: { endedAt: new Date(), notes: input.notes },
      include: WITH_SETS,
    });
    const dto = toWorkoutDto(finished);
    const minutes = Math.max(
      1,
      Math.round((finished.endedAt!.getTime() - finished.startedAt.getTime()) / 60_000),
    );
    await this.timeline.write({
      userId,
      type: 'workout.completed',
      source: 'fitness',
      title: `${finished.title} — ${dto.workingSets} sets, ${gramsToKg(dto.volumeGrams)} kg volume`,
      refType: 'workout',
      refId: finished.id,
      occurredAt: finished.endedAt!,
      payload: { minutes, volumeGrams: dto.volumeGrams, workingSets: dto.workingSets },
    });
    return dto;
  }

  /** Finished workouts, newest first. */
  async history(
    userId: string,
    page: { limit: number; offset: number },
  ): Promise<WorkoutDTO[]> {
    const rows = await this.prisma.client.workout.findMany({
      where: { userId, endedAt: { not: null } },
      orderBy: { startedAt: 'desc' },
      take: Math.min(page.limit, MAX_PAGE),
      skip: page.offset,
      include: WITH_SETS,
    });
    return rows.map(toWorkoutDto);
  }

  /**
   * What you did last time on a movement, plus your all-time best. The logger
   * shows this beside the input so every set has a target.
   */
  async lastPerformance(
    userId: string,
    exerciseId: string,
  ): Promise<LastPerformanceDTO | null> {
    const previous = await this.prisma.client.workoutSet.findMany({
      // Only FINISHED workouts count: sets from the session in progress are what
      // you're doing now, not what you're trying to beat.
      where: { userId, exerciseId, workout: { endedAt: { not: null } } },
      orderBy: { completedAt: 'desc' },
      take: 200,
    });
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

  /** Compact summary used by the AI context builder. */
  async summarize(userId: string): Promise<string> {
    const [open, recent] = await Promise.all([
      this.active(userId),
      this.history(userId, { limit: 3, offset: 0 }),
    ]);
    if (!open && recent.length === 0) return 'No workouts logged.';

    const lines: string[] = [];
    if (open) {
      lines.push(`In progress: ${open.title} (${open.workingSets} sets so far).`);
    }
    for (const w of recent) {
      const when = w.startedAt.slice(0, 10);
      const top = groupSetsByExercise(w.sets)
        .slice(0, 3)
        .map((g) => {
          const best = g.sets.filter((s) => !s.warmup).at(-1);
          return best ? `${g.exerciseName} ${describeSet(best, g.kind)}` : g.exerciseName;
        })
        .join(', ');
      lines.push(`- ${when}: ${w.title} — ${gramsToKg(w.volumeGrams)} kg volume${top ? ` (${top})` : ''}`);
    }
    return lines.join('\n');
  }
}
