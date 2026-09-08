import { afterAll, describe, expect, it, vi } from 'vitest';
import {
  calendarHourLabel, canvasDayTitle, canvasSpanLabel, clockOrMidnightInTimezone,
  describeRoutineDays, elapsedWorkoutLabel, workoutRecencyLabel,
} from '../src/clock-labels.js';

vi.stubEnv('TZ', 'America/Toronto');
afterAll(() => vi.unstubAllEnvs());
const now = new Date('2026-11-02T05:15:00Z');
const timezone = 'America/Toronto';

describe('clock labels with an explicit reference time', () => {
  it('labels adjacent calendar days across the fall DST transition', () => {
    expect(canvasDayTitle(new Date('2026-11-01T12:00:00-05:00'), now, timezone))
      .toBe('Yesterday · Sunday, November 1');
    expect(canvasDayTitle(now, now, timezone)).toBe('Today · Monday, November 2');
    expect(canvasDayTitle(new Date('2026-11-03T12:00:00-05:00'), now, timezone))
      .toBe('Tomorrow · Tuesday, November 3');
  });

  it('formats hour ticks without mutating the supplied clock', () => {
    expect(calendarHourLabel(9, now, timezone)).toBe('9 AM');
    expect(now.toISOString()).toBe('2026-11-02T05:15:00.000Z');
  });

  it('retains the local midnight label and display-zone clock formatting', () => {
    const start = new Date('2026-11-02T00:00:00-05:00');
    const end = new Date('2026-11-02T09:00:00-05:00');
    expect(clockOrMidnightInTimezone(start, timezone)).toBe('midnight');
    expect(clockOrMidnightInTimezone(start, 'UTC')).toBe('midnight');
    expect(clockOrMidnightInTimezone(end, 'UTC')).toBe('2:00 PM');
    expect(canvasSpanLabel({ start, end } as Parameters<typeof canvasSpanLabel>[0], timezone))
      .toBe('midnight – 9:00 AM');
  });

  it('counts workout recency in calendar days', () => {
    expect(workoutRecencyLabel('2026-11-01T23:00:00-05:00', now)).toBe('yesterday');
    expect(workoutRecencyLabel(null, now)).toBe('not done yet');
    expect(workoutRecencyLabel('2026-11-02T00:00:00-05:00', now)).toBe('today');
    expect(workoutRecencyLabel('2026-10-25T23:00:00-04:00', now)).toBe('last week');
  });

  it('formats elapsed session minutes and clamps future starts', () => {
    expect(elapsedWorkoutLabel('2026-11-02T04:15:00Z', now.getTime())).toBe('1h 00m');
    expect(elapsedWorkoutLabel('2026-11-02T06:15:00Z', now.getTime())).toBe('0 min');
  });

  it('describes Monday-first routine masks', () => {
    expect(describeRoutineDays(127)).toBe('Every day');
    expect(describeRoutineDays(31)).toBe('Weekdays');
    expect(describeRoutineDays(65)).toBe('Mon, Sun');
    expect(describeRoutineDays(0)).toBe('Never');
  });
});
