import { describe, expect, it, vi } from 'vitest';
import { CalendarService } from '../src/modules/calendar/calendar.service.js';

/**
 * The shift rules themselves are pure and tested exhaustively in
 * `@atlas/shared` (running-late.test.ts). What this covers is the half that
 * touches the database, where the failures are different in kind:
 *
 *   - reading events that are not the caller's,
 *   - defining "the rest of today" by adding 24 hours, which is wrong twice a
 *     year in a timezone that observes DST — and this app is used in one,
 *   - applying the moves one at a time, so a failure halfway leaves a schedule
 *     that is neither the old one nor the new one.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anyCast = (value: unknown): any => value;

const TZ = 'America/Toronto';
const NOW = new Date('2026-08-30T17:00:00.000Z'); // 13:00 Toronto

function evRow(over: Record<string, unknown> & { id: string }) {
  return {
    title: 'Thing',
    description: null,
    location: null,
    startAt: new Date('2026-08-30T18:00:00.000Z'),
    endAt: new Date('2026-08-30T19:00:00.000Z'),
    allDay: false,
    source: 'atlas',
    externalId: null,
    recurrence: null,
    recurrenceParentId: null,
    taskId: null,
    createdAt: NOW,
    updatedAt: NOW,
    userId: 'u1',
    ...over,
  };
}

function makeService(rows: ReturnType<typeof evRow>[]) {
  const findMany = vi.fn().mockResolvedValue(rows);
  const update = vi.fn().mockImplementation((args: { where: { id: string }; data: object }) => ({
    ...rows.find((r) => r.id === args.where.id)!,
    ...args.data,
  }));
  // Prisma's $transaction takes the array of prepared operations; the fake
  // resolves them the same way, so "was it batched" stays observable.
  const $transaction = vi.fn().mockImplementation((ops: unknown[]) => Promise.resolve(ops));
  const write = vi.fn().mockResolvedValue(undefined);
  const service = new CalendarService(
    anyCast({ client: { event: { findMany, update }, $transaction } }),
    anyCast({ write }),
    anyCast({ get: async () => 'America/Toronto', prime() {}, forget() {} }),
  );
  return { service, findMany, update, $transaction, write };
}

describe('CalendarService.shiftSchedule', () => {
  it('reads only the calling user, forward from now', async () => {
    const { service, findMany } = makeService([evRow({ id: 'a' })]);
    await service.shiftSchedule('u1', TZ, { minutes: 30, from: NOW });

    const where = findMany.mock.calls[0]![0].where;
    expect(where.userId).toBe('u1');
    expect(where.startAt.gte).toEqual(NOW);
  });

  it('moves the movable ones in a single transaction', async () => {
    const { service, update, $transaction } = makeService([
      evRow({ id: 'a' }),
      evRow({ id: 'b', startAt: new Date('2026-08-30T20:00:00.000Z'), endAt: new Date('2026-08-30T21:00:00.000Z') }),
    ]);
    const result = await service.shiftSchedule('u1', TZ, { minutes: 30, from: NOW });

    expect($transaction).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledTimes(2);
    expect(update.mock.calls[0]![0].data.startAt.toISOString()).toBe('2026-08-30T18:30:00.000Z');
    expect(result.moved).toHaveLength(2);
  });

  /**
   * "The rest of today" is a LOCAL day. Tomorrow 09:00 Toronto is inside a
   * 24-hour reach from 13:00 today, so a naive window would drag tomorrow's
   * morning backwards along with the afternoon.
   */
  it('leaves tomorrow alone even though it is within the fetch window', async () => {
    const { service, update } = makeService([
      evRow({ id: 'today' }),
      evRow({
        id: 'tomorrow',
        startAt: new Date('2026-08-31T13:00:00.000Z'), // 09:00 Toronto, next day
        endAt: new Date('2026-08-31T14:00:00.000Z'),
      }),
    ]);
    const result = await service.shiftSchedule('u1', TZ, { minutes: 30, from: NOW });

    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0]![0].where.id).toBe('today');
    expect(result.moved.map((m) => m.id)).toEqual(['today']);
  });

  it('records one timeline row for the whole action, not one per event', async () => {
    const { service, write } = makeService([
      evRow({ id: 'a' }),
      evRow({ id: 'b', startAt: new Date('2026-08-30T20:00:00.000Z') }),
      evRow({ id: 'c', startAt: new Date('2026-08-30T21:00:00.000Z') }),
    ]);
    await service.shiftSchedule('u1', TZ, { minutes: 30, from: NOW });

    expect(write).toHaveBeenCalledTimes(1);
    const event = write.mock.calls[0]![0];
    expect(event.type).toBe('schedule.shifted');
    expect(event.userId).toBe('u1');
    expect(event.payload.minutes).toBe(30);
    expect(event.payload.movedIds).toEqual(['a', 'b', 'c']);
  });

  it('writes nothing at all when there is nothing left to move', async () => {
    const { service, $transaction, write } = makeService([evRow({ id: 'g', source: 'google' })]);
    const result = await service.shiftSchedule('u1', TZ, { minutes: 30, from: NOW });

    expect($transaction).not.toHaveBeenCalled();
    // No timeline row either: a tap that changed nothing is not an event in
    // the user's life, and logging it would pad the log the AI reads.
    expect(write).not.toHaveBeenCalled();
    expect(result.message).toBe('Nothing left today to move.');
    expect(result.skipped).toEqual([{ id: 'g', reason: 'not-from-atlas' }]);
  });

  it('falls back to a bad timezone rather than throwing', async () => {
    const { service, update } = makeService([evRow({ id: 'a' })]);
    await expect(
      service.shiftSchedule('u1', 'Not/AZone', { minutes: 30, from: NOW }),
    ).resolves.toBeTruthy();
    expect(update).toHaveBeenCalled();
  });
});
