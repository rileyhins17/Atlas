import { expect, it } from 'vitest';
import { habitRhythm } from '../src/progress.js';
const now = new Date('2026-09-08T18:00:00Z');
const context = { now, createdAt: '2026-01-01T00:00:00Z', cadence: 'daily' };

it('does not score days before a habit existed as missed days', () => {
  const result = habitRhythm([{ day: '2026-09-08', count: 1 }], 1, 30,
    { ...context, createdAt: '2026-09-08T10:00:00Z' });
  expect(result.rate).toBe(1);
  expect(result.periods).toBe(1);
});

it('keeps empty calendar weeks in a sparse history', () => {
  const result = habitRhythm([{ day: '2026-08-25', count: 1 }, { day: '2026-09-08', count: 1 }], 1, 15, context);
  expect(result.weekly).toEqual([1, 0, 1]);
});

it('combines check-ins across days for a weekly target', () => {
  const result = habitRhythm([{ day: '2026-09-07', count: 1 }, { day: '2026-09-08', count: 2 }], 3, 30,
    { ...context, createdAt: '2026-09-07T00:00:00Z', cadence: 'weekly' });
  expect(result.rate).toBe(1);
  expect(result.periods).toBe(1);
  expect(result.partialPeriods).toBe(1);
});

it('excludes entries outside the calendar window, including future entries', () => {
  const result = habitRhythm([{ day: '2026-08-01', count: 1 }, { day: '2026-09-08', count: 1 }, { day: '2026-09-09', count: 1 }], 1, 7, context);
  expect(result.rate).toBeCloseTo(1 / 7);
});
