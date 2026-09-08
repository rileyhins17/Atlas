import { describe, expect, it } from 'vitest';
import {
  localDayStartUtc,
  localHour,
  localWeekStartUtc,
  tzOffsetMs,
} from '../src/time.js';

// 2026-07-15 is a Wednesday; July ⇒ America/Toronto is EDT (UTC-4).
const d = new Date('2026-07-15T12:00:00Z');

describe('time.util', () => {
  it.each([
    ['2026-03-08T12:00:00Z', 1, '2026-03-09T04:00:00.000Z'],
    ['2026-11-01T12:00:00Z', 1, '2026-11-02T05:00:00.000Z'],
    ['2026-03-09T12:00:00Z', -1, '2026-03-08T05:00:00.000Z'],
    ['2026-11-02T12:00:00Z', -1, '2026-11-01T04:00:00.000Z'],
    ['2026-01-01T12:00:00Z', -1, '2025-12-31T05:00:00.000Z'],
  ])('steps calendar days from %s by %s', (instant, days, expected) => {
    expect(localDayStartUtc('America/Toronto', new Date(instant), days).toISOString()).toBe(expected);
  });

  it.each([
    ['Asia/Kathmandu', '2026-07-15T12:00:00Z', '2026-07-14T18:15:00.000Z'],
    ['Australia/Lord_Howe', '2026-10-04T12:00:00Z', '2026-10-03T13:30:00.000Z'],
    ['America/Sao_Paulo', '2018-11-04T12:00:00Z', '2018-11-04T03:00:00.000Z'],
    ['America/Havana', '2026-11-01T12:00:00Z', '2026-11-01T04:00:00.000Z'],
  ])('resolves fractional offsets and skipped or repeated midnight in %s', (tz, instant, expected) => {
    expect(localDayStartUtc(tz, new Date(instant)).toISOString()).toBe(expected);
  });

  it('offset does not absorb an instant’s milliseconds', () => {
    expect(tzOffsetMs('UTC', new Date('2026-07-15T12:00:00.567Z'))).toBe(0);
  });

  it.each([
    ['2026-03-08T18:00:00Z', '2026-03-08T05:00:00.000Z'],
    ['2026-11-01T18:00:00Z', '2026-11-01T04:00:00.000Z'],
  ])('finds midnight before the offset changed on %s', (instant, expected) => {
    expect(localDayStartUtc('America/Toronto', new Date(instant)).toISOString()).toBe(expected);
  });

  it.each([
    ['2026-03-08T18:00:00Z', '2026-03-02T05:00:00.000Z'],
    ['2026-11-01T18:00:00Z', '2026-10-26T04:00:00.000Z'],
  ])('keeps Monday midnight across the offset change on %s', (instant, expected) => {
    expect(localWeekStartUtc('America/Toronto', new Date(instant)).toISOString()).toBe(expected);
  });

  it('tzOffsetMs is 0 for UTC and -4h for Toronto in summer', () => {
    expect(tzOffsetMs('UTC', d)).toBe(0);
    expect(tzOffsetMs('America/Toronto', d)).toBe(-4 * 3600 * 1000);
  });

  it('localHour returns the wall-clock hour', () => {
    expect(localHour('UTC', d)).toBe(12);
    expect(localHour('America/Toronto', d)).toBe(8);
  });

  it('localDayStartUtc is the UTC instant of local midnight', () => {
    expect(localDayStartUtc('America/Toronto', d).toISOString()).toBe('2026-07-15T04:00:00.000Z');
  });

  it('localWeekStartUtc is Monday local midnight', () => {
    expect(localWeekStartUtc('America/Toronto', d).toISOString()).toBe('2026-07-13T04:00:00.000Z');
  });

  it('falls back to UTC for an unknown timezone', () => {
    expect(tzOffsetMs('Not/AZone', d)).toBe(0);
    expect(localHour('Not/AZone', d)).toBe(12);
  });
});
