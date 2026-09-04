import { describe, expect, it, vi } from 'vitest';
import { WorkoutTemplatesService } from '../src/modules/fitness/workout-templates.service.js';

/**
 * "Paste a whole split" must not be a per-exercise round trip.
 *
 * `applyProposal` looked every unmatched movement up and created it one at a
 * time, inside a per-day loop. A five-day split of eight movements is ~80
 * sequential queries, and a warm round trip to the hosted database measures
 * 384ms — about thirty seconds of spinner for the single action that turns a
 * program someone pasted into the thing Atlas is for.
 *
 * It is the same class as the Google sync defect (305s → 6.8s): correct code,
 * fine against a local database, ruinous against one across the continent.
 *
 * The second failure hides inside the first. The exercises were created before
 * the template that uses them, outside any transaction, so a failure between
 * the two left custom movements orphaned in the user's catalog permanently —
 * and that catalog is unpaginated and fed to the model, so the orphans cost
 * tokens on every later AI call.
 */
function makeService(opts: { existing?: string[] } = {}) {
  const known = new Set(opts.existing ?? []);
  const counts = { findMany: 0, findFirst: 0, create: 0, createMany: 0, tx: 0 };

  const exercise = {
    // Two shapes reach this: the bulk name lookup applyProposal makes, and the
    // id validation resolveExerciseIds makes before writing a template.
    findMany: vi.fn(async ({ where }: { where: { name?: { in?: string[] }; id?: { in?: string[] } } }) => {
      if (where.id?.in) return where.id.in.map((id) => ({ id, name: id }));
      counts.findMany++;
      const asked = where.name?.in ?? [];
      return asked.filter((n) => known.has(n)).map((n) => ({ id: `ex-${n}`, name: n }));
    }),
    findFirst: vi.fn(async () => {
      counts.findFirst++;
      return null;
    }),
    create: vi.fn(async ({ data }: { data: { name: string } }) => {
      counts.create++;
      return { id: `new-${data.name}`, name: data.name };
    }),
    createMany: vi.fn(async ({ data }: { data: { name: string }[] }) => {
      counts.createMany++;
      for (const d of data) known.add(d.name);
      return { count: data.length };
    }),
  };
  const workoutTemplate = {
    findFirst: vi.fn(async () => null),
    findMany: vi.fn(async () => []),
    count: vi.fn(async () => 0),
    create: vi.fn(async ({ data }: { data: { name: string } }) => ({
      id: `tpl-${data.name}`,
      name: data.name,
      exercises: [],
      createdAt: new Date(),
    })),
    update: vi.fn(async () => ({
      id: 'tpl',
      name: 'x',
      exercises: [],
      createdAt: new Date(),
    })),
  };
  const client = {
    exercise,
    workoutTemplate,
    templateExercise: { deleteMany: vi.fn(async () => ({ count: 0 })), createMany: vi.fn(async () => ({ count: 0 })) },
  };
  const prisma = {
    client: {
      ...client,
      $transaction: vi.fn(async (arg: unknown) => {
        counts.tx++;
        return typeof arg === 'function' ? (arg as (t: unknown) => Promise<unknown>)(client) : arg;
      }),
    },
  };
  const service = new WorkoutTemplatesService(prisma as never, {} as never, {} as never);
  return { service, counts, exercise };
}

/** Five days, eight movements each, none of them in the catalog. */
const BIG_SPLIT = Array.from({ length: 5 }, (_, d) => ({
  name: `Day ${d + 1}`,
  exercises: Array.from({ length: 8 }, (_, i) => ({ exerciseId: null, name: `move ${d}-${i}` })),
}));

describe('applyProposal', () => {
  it('looks movements up in bulk, not one at a time', async () => {
    const { service, counts } = makeService();
    await service.applyProposal('u1', BIG_SPLIT);
    // 40 movements must not mean 40 lookups.
    expect(counts.findFirst, 'per-exercise findFirst is the N+1').toBeLessThanOrEqual(5);
    expect(counts.findMany).toBeGreaterThan(0);
  });

  it('creates them in bulk too', async () => {
    const { service, counts } = makeService();
    await service.applyProposal('u1', BIG_SPLIT);
    expect(counts.create, 'per-exercise create is the other half').toBeLessThanOrEqual(5);
    expect(counts.createMany).toBeGreaterThan(0);
  });

  /** Two days naming the same new movement must not create it twice. */
  it('creates a movement named by two days only once', async () => {
    const { service, exercise } = makeService();
    await service.applyProposal('u1', [
      { name: 'Push', exercises: [{ exerciseId: null, name: 'incline db press' }] },
      { name: 'Upper', exercises: [{ exerciseId: null, name: 'incline db press' }] },
    ]);
    const written = exercise.createMany.mock.calls.flatMap(
      (c) => (c[0] as { data: { name: string }[] }).data,
    );
    expect(written.filter((d) => d.name === 'Incline Db Press')).toHaveLength(1);
  });

  it('still reuses a movement already in the catalog', async () => {
    const { service, exercise } = makeService({ existing: ['Bench Press (Barbell)'] });
    await service.applyProposal('u1', [
      { name: 'Push', exercises: [{ exerciseId: null, name: 'Bench Press (Barbell)' }] },
    ]);
    const written = exercise.createMany.mock.calls.flatMap(
      (c) => (c[0] as { data: { name: string }[] }).data,
    );
    expect(written).toHaveLength(0);
  });
});
