import { describe, expect, it, vi } from 'vitest';
import { WorkoutTemplatesService } from '../src/modules/fitness/workout-templates.service.js';

/**
 * `supersetGroups` arrives index-aligned with `exerciseIds`, and the service
 * dedupes the list before writing it. Dedupe changes the length, so the two
 * have to be zipped BEFORE it happens — doing it the other way round slides
 * every grouping one place left the first time someone lists an exercise
 * twice, which is silent and looks like the feature simply not working.
 */
function makeService() {
  const created: { exerciseId: string; supersetGroup: number | null; position: number }[] = [];
  const prisma = {
    client: {
      workoutTemplate: {
        count: vi.fn(async () => 0),
        findFirst: vi.fn(async () => null),
        create: vi.fn(async ({ data }: { data: { exercises: { create: typeof created } } }) => {
          created.push(...data.exercises.create);
          return {
            id: 't1',
            name: 'Push',
            position: 0,
            createdAt: new Date(),
            exercises: data.exercises.create.map((e) => ({
              exerciseId: e.exerciseId,
              position: e.position,
              supersetGroup: e.supersetGroup,
              exercise: { name: e.exerciseId, muscle: 'chest', kind: 'weight_reps' },
            })),
          };
        }),
      },
      exercise: {
        findMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) =>
          where.id.in.map((id) => ({ id })),
        ),
      },
    },
  };
  const service = new WorkoutTemplatesService(prisma as never, {} as never, {} as never);
  return { service, created };
}

const save = async (exerciseIds: string[], supersetGroups?: (number | null)[]) => {
  const { service, created } = makeService();
  await service.create('u1', { name: 'Push', exerciseIds, ...(supersetGroups ? { supersetGroups } : {}) });
  return created;
};

describe('workout day supersets', () => {
  it('stores the grouping it was given', async () => {
    const rows = await save(['bench', 'row', 'squat'], [0, 0, null]);
    expect(rows.map((r) => [r.exerciseId, r.supersetGroup])).toEqual([
      ['bench', 0],
      ['row', 0],
      ['squat', null],
    ]);
  });

  /** The regression this file exists for. */
  it('keeps each group with its own exercise when a duplicate is dropped', async () => {
    const rows = await save(['bench', 'bench', 'curl', 'pushdown'], [null, null, 1, 1]);
    expect(rows.map((r) => [r.exerciseId, r.supersetGroup])).toEqual([
      ['bench', null],
      ['curl', 0],
      ['pushdown', 0],
    ]);
  });

  /**
   * Renumbered server-side too. The client tidies before sending, but the AI
   * split path and any other caller do not, and the number is shown as a
   * letter — "Superset F" for the only pair in the day is nonsense.
   */
  it('renumbers groups from zero whatever it was sent', async () => {
    const rows = await save(['a', 'b', 'c', 'd'], [7, 7, 3, 3]);
    expect(rows.map((r) => r.supersetGroup)).toEqual([0, 0, 1, 1]);
  });

  /** A group with one member is not a superset, whatever the number says. */
  it('drops a group that has nothing to pair with', async () => {
    const rows = await save(['a', 'b'], [4, null]);
    expect(rows.map((r) => r.supersetGroup)).toEqual([null, null]);
  });

  it('leaves every exercise ungrouped when no grouping is sent', async () => {
    const rows = await save(['a', 'b']);
    expect(rows.map((r) => r.supersetGroup)).toEqual([null, null]);
  });
});
