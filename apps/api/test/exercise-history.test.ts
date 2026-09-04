import { describe, expect, it, vi } from 'vitest';
import { FitnessService } from '../src/modules/fitness/fitness.service.js';

/**
 * One movement's whole history — the screen a paid tracker is lived in.
 *
 * Atlas had no equivalent: the only way to find last week's squat was to scroll
 * twenty identical session cards. The strength maths this serves has been in
 * packages/shared since fitness shipped without ever reaching a screen.
 */
const EXERCISE = { id: 'ex1', userId: null, name: 'Squat (Barbell)', kind: 'weight_reps', muscle: 'legs', target: 'quads', equipment: 'barbell' };

const row = (
  id: string,
  workoutId: string,
  weightGrams: number | null,
  reps: number | null,
  daysAgo: number,
  warmup = false,
) => {
  const at = new Date(Date.now() - daysAgo * 86_400_000);
  return {
    id,
    workoutId,
    exerciseId: 'ex1',
    userId: 'u1',
    position: 0,
    weightGrams,
    reps,
    durationSec: null,
    distanceM: null,
    warmup,
    completedAt: at,
    workout: { id: workoutId, title: 'Leg day', startedAt: at },
  };
};

function makeService(rows: ReturnType<typeof row>[], exercise: unknown = EXERCISE) {
  const prisma = {
    client: {
      exercise: {
        findFirst: vi.fn(async (_args: { where: Record<string, unknown> }) => exercise),
      },
      workoutSet: {
        findMany: vi.fn(async (_args: { where: Record<string, unknown> }) => rows),
      },
    },
  };
  return {
    service: new FitnessService(prisma as never, { write: vi.fn(async () => {}) } as never),
    prisma,
  };
}

describe('exerciseHistory', () => {
  it('groups sets into the sessions they were done in', async () => {
    const { service } = makeService([
      row('s1', 'w1', 100_000, 5, 0),
      row('s2', 'w1', 105_000, 3, 0),
      row('s3', 'w2', 95_000, 5, 7),
    ]);
    const out = await service.exerciseHistory('u1', 'ex1');
    expect(out.sessions).toHaveLength(2);
    expect(out.sessions[0]!.sets).toHaveLength(2);
  });

  it('puts the newest session first', async () => {
    const { service } = makeService([row('s1', 'w1', 100_000, 5, 0), row('s2', 'w2', 90_000, 5, 30)]);
    const out = await service.exerciseHistory('u1', 'ex1');
    expect(new Date(out.sessions[0]!.performedAt).getTime()).toBeGreaterThan(
      new Date(out.sessions[1]!.performedAt).getTime(),
    );
  });

  /** Within a session, the order you did them in is the story. */
  it('keeps sets in the order they were performed', async () => {
    const { service } = makeService([
      { ...row('s2', 'w1', 105_000, 3, 0), completedAt: new Date(Date.now() + 1000) },
      row('s1', 'w1', 100_000, 5, 0),
    ]);
    const out = await service.exerciseHistory('u1', 'ex1');
    expect(out.sessions[0]!.sets.map((s) => s.id)).toEqual(['s1', 's2']);
  });

  it('computes volume and the best effort per session', async () => {
    const { service } = makeService([row('s1', 'w1', 100_000, 5, 0), row('s2', 'w1', 60_000, 10, 0)]);
    const out = await service.exerciseHistory('u1', 'ex1');
    expect(out.sessions[0]!.volumeGrams).toBe(100_000 * 5 + 60_000 * 10);
    // 60 x 10 estimates higher than 100 x 5, which is the point of estimating.
    expect(out.sessions[0]!.bestE1rmGrams).toBeGreaterThan(100_000);
  });

  it('reports records across every set read', async () => {
    const { service } = makeService([
      row('s1', 'w1', 100_000, 5, 0),
      row('s2', 'w2', 120_000, 1, 30),
      row('s3', 'w3', 500_000, 1, 60, true),
    ]);
    const out = await service.exerciseHistory('u1', 'ex1');
    expect(out.records.heaviestGrams).toBe(120_000);
    // A warm-up is never a record, however heavy the plate.
    expect(out.records.heaviestGrams).not.toBe(500_000);
    expect(out.records.totalSets).toBe(2);
  });

  /** Sets from the session in progress are what you are doing, not the record. */
  it('reads finished workouts only', async () => {
    const { service, prisma } = makeService([row('s1', 'w1', 100_000, 5, 0)]);
    await service.exerciseHistory('u1', 'ex1');
    const where = prisma.client.workoutSet.findMany.mock.calls[0]![0].where as Record<string, unknown>;
    expect(where.workout).toEqual({ endedAt: { not: null } });
    expect(where.userId).toBe('u1');
  });

  /** A borrowed id from another account must match nothing. */
  it('scopes the exercise to the shared catalog or your own', async () => {
    const { service, prisma } = makeService([]);
    await service.exerciseHistory('u1', 'ex1');
    const where = prisma.client.exercise.findFirst.mock.calls[0]![0].where as Record<string, unknown>;
    expect(where.OR).toEqual([{ userId: null }, { userId: 'u1' }]);
  });

  it('404s on a movement that is not yours', async () => {
    const { service } = makeService([], null);
    await expect(service.exerciseHistory('u1', 'nope')).rejects.toThrow(/Unknown exercise/);
  });

  it('has an honest empty answer for something never logged', async () => {
    const { service } = makeService([]);
    const out = await service.exerciseHistory('u1', 'ex1');
    expect(out.sessions).toEqual([]);
    expect(out.records.heaviestGrams).toBeNull();
    expect(out.records.totalSets).toBe(0);
  });
});
