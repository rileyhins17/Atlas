import { describe, expect, it, vi } from 'vitest';
import { TaskDurationService } from '../src/modules/tasks/task-duration.service.js';

/**
 * The shape of the profile is tested exhaustively in `@atlas/shared`. What can
 * only go wrong here is the reading:
 *
 *   - scoping, as always;
 *   - which tasks count. `estimates` can only see work Atlas reserved a block
 *     for, because it measures block-start to completion. Energy needs the
 *     opposite: most tasks are simply ticked off, and requiring a block would
 *     throw away most of the evidence and bias the answer toward planned days;
 *   - the HOUR. Bucketing by UTC smears a consistent 9am across two hours over
 *     a DST boundary and lands an eastern user's morning in the night before.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anyCast = (value: unknown): any => value;

function makeService(rows: { completedAt: Date | null; priority: string }[]) {
  const findMany = vi.fn().mockResolvedValue(rows);
  const service = new TaskDurationService(anyCast({ client: { task: { findMany } } }));
  return { service, findMany };
}

/** 13:00 UTC is 09:00 in Toronto during EDT — the whole point of the test. */
const at = (iso: string, priority = 'HIGH') => ({ completedAt: new Date(iso), priority });
const morning = (n: number, priority = 'HIGH') =>
  Array.from({ length: n }, () => at('2026-08-20T13:00:00.000Z', priority));

describe('TaskDurationService.energy', () => {
  it('reads only the caller\'s completed tasks', async () => {
    const { service, findMany } = makeService(morning(12));
    await service.energy('u1', 'America/Toronto');

    const where = findMany.mock.calls[0]![0].where;
    expect(where.userId).toBe('u1');
    expect(where.status).toBe('DONE');
    expect(where.completedAt.not).toBeNull();
  });

  /** No `taskId` / block requirement, unlike `estimates`. */
  it('counts tasks that were simply ticked off, not only scheduled ones', async () => {
    const { service, findMany } = makeService(morning(12));
    await service.energy('u1', 'America/Toronto');
    expect(findMany.mock.calls[0]![0].where.taskId).toBeUndefined();
  });

  it('buckets by the local hour, not UTC', async () => {
    const { service } = makeService([
      ...morning(12),
      at('2026-08-20T19:00:00.000Z'), // 15:00 Toronto
      at('2026-08-20T20:00:00.000Z'), // 16:00 Toronto
    ]);
    const profile = await service.energy('u1', 'America/Toronto');
    // 13:00 UTC is 09:00 in Toronto. Reading it as UTC would name 13:00.
    expect(profile.peak).toEqual([{ startHour: 9, endHour: 10, completions: 12 }]);
  });

  it('gives the same instants a different shape in a different timezone', async () => {
    const rows = [
      ...morning(12),
      at('2026-08-20T19:00:00.000Z'),
      at('2026-08-20T20:00:00.000Z'),
    ];
    const toronto = await makeService(rows).service.energy('u1', 'America/Toronto');
    const london = await makeService(rows).service.energy('u1', 'Europe/London');
    expect(toronto.peak[0]!.startHour).toBe(9);
    expect(london.peak[0]!.startHour).toBe(14); // 13:00 UTC is 14:00 BST
  });

  it('treats only high and urgent work as demanding', async () => {
    const { service } = makeService([
      ...morning(12, 'MEDIUM'),
      ...morning(2, 'LOW'),
    ]);
    const profile = await service.energy('u1', 'America/Toronto');
    // Fourteen completions, none of them demanding, so nothing to say.
    expect(profile.samples).toBe(0);
    expect(profile.peak).toEqual([]);
  });

  it('counts URGENT alongside HIGH', async () => {
    const { service } = makeService([...morning(6, 'URGENT'), ...morning(6, 'HIGH')]);
    const profile = await service.energy('u1', 'America/Toronto');
    expect(profile.samples).toBe(12);
  });

  it('says nothing for an account with no history', async () => {
    const { service } = makeService([]);
    const profile = await service.energy('u1', 'America/Toronto');
    // A brand-new account must get exactly the plan it got before, not a
    // confident claim about a pattern that cannot exist yet.
    expect(profile).toEqual({ peak: [], trough: [], samples: 0 });
  });

  it('falls back rather than throwing on a nonsense timezone', async () => {
    const { service } = makeService(morning(12));
    await expect(service.energy('u1', 'Not/AZone')).resolves.toBeTruthy();
  });

  it('skips a row whose completedAt is null', async () => {
    const { service } = makeService([...morning(12), { completedAt: null, priority: 'HIGH' }]);
    const profile = await service.energy('u1', 'America/Toronto');
    expect(profile.samples).toBe(12);
  });
});
