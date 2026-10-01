import { describe, expect, it, vi } from 'vitest';
import { FitnessService } from '../src/modules/fitness/fitness.service.js';
import { EXERCISE_CATALOG } from '../src/modules/fitness/exercise-catalog.js';

/** A catalog edit has to reach databases that already hold the row, not only fresh ones. */
function makeService(existing: Record<string, unknown>[]) {
  const update = vi.fn(async ({ data }: { data: unknown }) => data);
  const createMany = vi.fn(async ({ data }: { data: unknown[] }) => ({ count: data.length }));
  const findMany = vi.fn(async () => existing);
  const prisma = {
    client: {
      exercise: { findMany, createMany, update },
      $transaction: vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
    },
  };
  const service = new FitnessService(prisma as never, { write: vi.fn(async () => {}) } as never);
  return { service, prisma, findMany, createMany, update };
}

/** The whole catalog as the database would hold it after a clean seed. */
const seeded = () => EXERCISE_CATALOG.map((e, i) => ({ id: `ex${i}`, ...e }));

describe('seedCatalog', () => {
  it('corrects a shared row whose kind and filing have drifted from the catalog', async () => {
    const rows = seeded();
    const i = rows.findIndex((r) => r.name === 'Row (Machine)');
    // How it was seeded before: the rowing ergometer, under cardio.
    rows[i] = {
      ...rows[i]!,
      muscle: 'cardio',
      target: 'cardio',
      equipment: 'cardio_machine',
      kind: 'distance',
    };
    const { service, update, createMany } = makeService(rows);

    const result = await service.seedCatalog();

    expect(result).toEqual({ added: 0, corrected: 1 });
    expect(createMany).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith({
      where: { id: `ex${i}` },
      data: { muscle: 'back', target: 'lats', equipment: 'machine', kind: 'weight_reps' },
    });
  });

  it('does nothing at all when every row already matches', async () => {
    const { service, update, createMany, prisma } = makeService(seeded());

    expect(await service.seedCatalog()).toEqual({ added: 0, corrected: 0 });
    expect(update).not.toHaveBeenCalled();
    expect(createMany).not.toHaveBeenCalled();
    expect(prisma.client.$transaction).not.toHaveBeenCalled();
  });

  it('inserts a movement the database has never seen, and leaves the rest alone', async () => {
    const rows = seeded().filter((r) => r.name !== 'Rowing Machine (Erg)');
    const { service, createMany, update } = makeService(rows);

    expect(await service.seedCatalog()).toEqual({ added: 1, corrected: 0 });
    expect(createMany).toHaveBeenCalledTimes(1);
    const { data } = createMany.mock.calls[0]![0] as { data: { name: string; userId: null }[] };
    expect(data.map((d) => d.name)).toEqual(['Rowing Machine (Erg)']);
    expect(data[0]!.userId).toBeNull();
    expect(update).not.toHaveBeenCalled();
  });

  it('only ever reads shared rows, so a user’s own exercise is never rewritten', async () => {
    const { service, findMany } = makeService(seeded());
    await service.seedCatalog();
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: null } }));
  });
});
