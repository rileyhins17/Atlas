import { describe, expect, it } from 'vitest';
import {
  ShiftScheduleInput,
  describeShift,
  planShift,
  type ShiftableEvent,
} from '../src/dto/running-late.js';

/**
 * The feature is one button; the whole risk is in what it refuses to touch.
 * Silently moving a meeting other people are attending is real damage, not an
 * inconvenience, so the skip rules get more tests than the shift itself.
 */

const at = (iso: string) => new Date(iso);

/** Toronto: UTC-4 in August, which is what makes the day-boundary cases real. */
const torontoDayKey = (d: Date) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);

function ev(over: Partial<ShiftableEvent> & { id: string }): ShiftableEvent {
  return {
    startAt: at('2026-08-30T18:00:00.000Z'),
    endAt: at('2026-08-30T19:00:00.000Z'),
    allDay: false,
    source: 'atlas',
    ...over,
  };
}

const NOW = at('2026-08-30T17:00:00.000Z');
const run = (events: ShiftableEvent[], minutes = 30) =>
  planShift(events, { minutes, from: NOW, dayKey: torontoDayKey });

describe('planShift', () => {
  it('pushes a later Atlas event by the requested minutes', () => {
    const plan = run([ev({ id: 'a' })]);
    expect(plan.moved).toHaveLength(1);
    expect(plan.moved[0]!.startAt.toISOString()).toBe('2026-08-30T18:30:00.000Z');
    expect(plan.moved[0]!.endAt.toISOString()).toBe('2026-08-30T19:30:00.000Z');
  });

  it('keeps each event the same length', () => {
    const plan = run([
      ev({ id: 'a', startAt: at('2026-08-30T18:00:00.000Z'), endAt: at('2026-08-30T20:30:00.000Z') }),
    ]);
    const { startAt, endAt } = plan.moved[0]!;
    expect(endAt.getTime() - startAt.getTime()).toBe(2.5 * 60 * 60 * 1000);
  });

  /**
   * The one that matters. A synced event belongs to a calendar other people can
   * see; moving it here would both mislead them and drift out of sync with the
   * system that owns it.
   */
  it('never moves an event that came from somewhere else', () => {
    const plan = run([ev({ id: 'g', source: 'google' })]);
    expect(plan.moved).toHaveLength(0);
    expect(plan.skipped).toEqual([{ id: 'g', reason: 'not-from-atlas' }]);
  });

  it('never moves an all-day entry', () => {
    const plan = run([ev({ id: 'v', allDay: true })]);
    expect(plan.moved).toHaveLength(0);
    expect(plan.skipped).toEqual([{ id: 'v', reason: 'all-day' }]);
  });

  /** You are IN this one. Moving its start would rewrite what already happened. */
  it('leaves anything already under way alone', () => {
    const plan = run([ev({ id: 'now', startAt: at('2026-08-30T16:30:00.000Z') })]);
    expect(plan.moved).toHaveLength(0);
    expect(plan.skipped).toEqual([{ id: 'now', reason: 'already-started' }]);
  });

  it('treats an event starting exactly now as still ahead of you', () => {
    const plan = run([ev({ id: 'edge', startAt: NOW, endAt: at('2026-08-30T17:30:00.000Z') })]);
    expect(plan.moved.map((m) => m.id)).toEqual(['edge']);
  });

  it('sorts each event into exactly one outcome', () => {
    const plan = run([
      ev({ id: 'move' }),
      ev({ id: 'google', source: 'google' }),
      ev({ id: 'allday', allDay: true }),
      ev({ id: 'past', startAt: at('2026-08-30T09:00:00.000Z') }),
    ]);
    expect(plan.moved.map((m) => m.id)).toEqual(['move']);
    expect(plan.skipped.map((s) => s.id).sort()).toEqual(['allday', 'google', 'past']);
  });

  it('flags a shift that pushes something into tomorrow', () => {
    // 23:45 in Toronto on the 30th; +30 minutes lands on the 31st.
    const plan = run([
      ev({ id: 'late', startAt: at('2026-08-31T03:45:00.000Z'), endAt: at('2026-08-31T04:15:00.000Z') }),
    ]);
    expect(plan.moved[0]!.crossesDay).toBe(true);
  });

  it('does not call an ordinary evening shift a day change', () => {
    const plan = run([ev({ id: 'eve', startAt: at('2026-08-30T23:00:00.000Z') })]);
    // 19:00 -> 19:30 Toronto. UTC rolls past midnight here and the local day
    // does not, which is exactly why the day test is timezone-aware.
    expect(plan.moved[0]!.crossesDay).toBe(false);
  });

  it('pulls the day earlier when the shift is negative', () => {
    const plan = run([ev({ id: 'a' })], -15);
    expect(plan.moved[0]!.startAt.toISOString()).toBe('2026-08-30T17:45:00.000Z');
  });
});

describe('ShiftScheduleInput', () => {
  it('rejects a shift of zero', () => {
    expect(ShiftScheduleInput.safeParse({ minutes: 0 }).success).toBe(false);
  });

  it('rejects a shift beyond four hours', () => {
    expect(ShiftScheduleInput.safeParse({ minutes: 241 }).success).toBe(false);
    expect(ShiftScheduleInput.safeParse({ minutes: -241 }).success).toBe(false);
  });

  it('accepts a negative shift, which is the undo', () => {
    expect(ShiftScheduleInput.safeParse({ minutes: -30 }).success).toBe(true);
  });

  it('rejects a fractional shift', () => {
    expect(ShiftScheduleInput.safeParse({ minutes: 12.5 }).success).toBe(false);
  });
});

describe('describeShift', () => {
  it('says plainly when there was nothing to do', () => {
    expect(describeShift({ moved: [], skipped: [] }, 30)).toBe('Nothing left today to move.');
  });

  it('counts what moved and what was held back', () => {
    const plan = run([ev({ id: 'a' }), ev({ id: 'b' }), ev({ id: 'g', source: 'google' })]);
    expect(describeShift(plan, 30)).toBe('Moved 2 things 30 minutes later, 1 left where it was.');
  });

  /** An event that had already started is not "held back" — it was never a candidate. */
  it('does not count things already under way as held back', () => {
    const plan = run([ev({ id: 'a' }), ev({ id: 'past', startAt: at('2026-08-30T09:00:00.000Z') })]);
    expect(describeShift(plan, 30)).toBe('Moved 1 thing 30 minutes later.');
  });

  it('reads correctly for an undo', () => {
    const plan = run([ev({ id: 'a' })], -30);
    expect(describeShift(plan, -30)).toBe('Moved 1 thing 30 minutes earlier.');
  });
});
