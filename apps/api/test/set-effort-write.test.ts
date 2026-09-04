import { describe, expect, it, vi } from 'vitest';
import { FitnessService } from '../src/modules/fitness/fitness.service.js';

/**
 * `warmup` and `setType` must never disagree.
 *
 * `warmup` stays a real column because volume, records and every existing
 * screen already read it; rewriting all of that to derive from a string would
 * be risk with no payoff. So there are two representations of one fact, which
 * is exactly the shape that drifts — unless there is precisely one writer.
 * `logSet` is that writer, and these pin it.
 */
function makeService() {
  const created: Record<string, unknown>[] = [];
  const workout = {
    id: 'w1',
    userId: 'u1',
    title: 'Workout',
    notes: null,
    templateId: null,
    startedAt: new Date(),
    endedAt: null,
    sets: [],
  };
  const prisma = {
    client: {
      workout: {
        findFirst: vi.fn(async () => workout),
      },
      exercise: {
        findFirst: vi.fn(async () => ({ id: 'ex1', name: 'Squat', kind: 'weight_reps' })),
      },
      workoutSet: {
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          created.push(data);
          return data;
        }),
      },
    },
  };
  const service = new FitnessService(prisma as never, { write: vi.fn(async () => {}) } as never);
  return { service, created };
}

const base = { exerciseId: 'ex1', reps: 5, weightGrams: 100_000, warmup: false };

describe('logSet — set type and effort', () => {
  it('records the kind of set that was asked for', async () => {
    const { service, created } = makeService();
    await service.logSet('u1', 'w1', { ...base, setType: 'drop' });
    expect(created[0]).toMatchObject({ setType: 'drop', warmup: false });
  });

  /** A drop set is work. Only a warm-up is excluded from volume and records. */
  it('keeps warmup false for every kind that counts as work', async () => {
    for (const setType of ['normal', 'drop', 'failure', 'amrap'] as const) {
      const { service, created } = makeService();
      await service.logSet('u1', 'w1', { ...base, setType });
      expect(created[0]!.warmup, setType).toBe(false);
    }
  });

  it('sets both when the kind is a warm-up', async () => {
    const { service, created } = makeService();
    await service.logSet('u1', 'w1', { ...base, setType: 'warmup' });
    expect(created[0]).toMatchObject({ setType: 'warmup', warmup: true });
  });

  /**
   * `setType` is the more specific statement, so it wins — including when a
   * caller sends a boolean that contradicts it. The row can never hold both.
   */
  it('lets the explicit kind override a contradictory boolean', async () => {
    const { service, created } = makeService();
    await service.logSet('u1', 'w1', { ...base, warmup: true, setType: 'normal' });
    expect(created[0]).toMatchObject({ setType: 'normal', warmup: false });
  });

  /** An older client that only knows `warmup` still writes a consistent row. */
  it('derives the kind from the boolean when none is given', async () => {
    const { service, created } = makeService();
    await service.logSet('u1', 'w1', { ...base, warmup: true });
    expect(created[0]).toMatchObject({ setType: 'warmup', warmup: true });
  });

  it('stores effort in tenths, and null when it was not recorded', async () => {
    const { service, created } = makeService();
    await service.logSet('u1', 'w1', { ...base, rpe: 75 });
    expect(created[0]!.rpe).toBe(75);

    const fresh = makeService();
    await fresh.service.logSet('u1', 'w1', base);
    // Not recorded is not the same as easy.
    expect(fresh.created[0]!.rpe).toBeNull();
  });
});
