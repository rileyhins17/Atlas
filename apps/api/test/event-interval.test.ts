import { describe, expect, it, vi } from 'vitest';
import { UpdateEventInput } from '@atlas/shared';
import { CalendarService } from '../src/modules/calendar/calendar.service.js';

/**
 * An event may not end before it starts. Create has refused that since it was
 * written; update did not, so a PATCH could produce a row that could never have
 * been created.
 *
 * The consequence is not a crash, which is why it survived: placeDayEvents
 * guards against a negative height by clamping the end to midnight, so a
 * reversed event renders as running from its start to the end of the day —
 * silently eating the rest of the calendar and forcing every later event that
 * day into a narrow column.
 *
 * It takes two checks because the two halves fail differently: sending BOTH
 * ends is a pure input problem the DTO can see, while sending ONE has to be
 * judged against the stored value, which no schema can do.
 */
const T = (h: number) => new Date(2026, 7, 11, h, 0, 0);

// A full row, because toDto maps every column and calls toISOString on the
// dates — a partial fixture fails inside the mapper rather than in the code
// under test, which reads like a bug in the guard.
const row = (stored: { startAt: Date; endAt: Date }) => ({
  id: 'e1',
  userId: 'u1',
  title: 'Standup',
  description: null,
  location: null,
  allDay: false,
  source: 'local',
  recurrence: null,
  taskId: null,
  createdAt: new Date(2026, 7, 1),
  ...stored,
});

function makeService(stored: { startAt: Date; endAt: Date }) {
  const findFirst = vi.fn().mockResolvedValue(row(stored));
  const update = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
    ...row(stored),
    ...data,
  }));
  const client = { event: { findFirst, update } };
  const timeline = { write: vi.fn().mockResolvedValue(undefined) };
  const service = new CalendarService(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { client } as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    timeline as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { get: async () => 'America/Toronto', prime() {}, forget() {} } as any,
  );
  return { service, update };
}

describe('UpdateEventInput', () => {
  it('rejects a reversed pair', () => {
    const r = UpdateEventInput.safeParse({ startAt: T(14), endAt: T(9) });
    expect(r.success).toBe(false);
  });

  it('still allows a zero-length event, and a normal one', () => {
    // Zero-length stays legal: create allows it (endAt >= startAt) and a
    // reminder pinned to an instant is a real thing. Reversed is the bug.
    expect(UpdateEventInput.safeParse({ startAt: T(9), endAt: T(9) }).success).toBe(true);
    expect(UpdateEventInput.safeParse({ startAt: T(9), endAt: T(10) }).success).toBe(true);
  });

  it('leaves a one-sided patch to the service', () => {
    // No stored value here to compare against, so the schema must not guess.
    expect(UpdateEventInput.safeParse({ endAt: T(9) }).success).toBe(true);
    expect(UpdateEventInput.safeParse({ startAt: T(23) }).success).toBe(true);
  });
});

describe('CalendarService.update', () => {
  it('rejects moving the END before the stored start', async () => {
    const { service, update } = makeService({ startAt: T(10), endAt: T(11) });
    await expect(service.update('u1', 'e1', { endAt: T(9) })).rejects.toThrow(/endAt must be after/i);
    expect(update).not.toHaveBeenCalled();
  });

  it('rejects moving the START past the stored end', async () => {
    const { service, update } = makeService({ startAt: T(10), endAt: T(11) });
    await expect(service.update('u1', 'e1', { startAt: T(23) })).rejects.toThrow(
      /endAt must be after/i,
    );
    expect(update).not.toHaveBeenCalled();
  });

  it('allows an ordinary move when both ends travel together', async () => {
    const { service, update } = makeService({ startAt: T(10), endAt: T(11) });
    await service.update('u1', 'e1', { startAt: T(13), endAt: T(14) });
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('allows a one-sided move that stays in order', async () => {
    // Dragging only the start later is fine right up until it passes the end —
    // which is exactly the boundary the stored value is needed to judge.
    const { service, update } = makeService({ startAt: T(10), endAt: T(14) });
    await service.update('u1', 'e1', { startAt: T(13) });
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('allows a patch that touches neither end', async () => {
    const { service, update } = makeService({ startAt: T(10), endAt: T(11) });
    await service.update('u1', 'e1', { title: 'Renamed' });
    expect(update).toHaveBeenCalledTimes(1);
  });
});
