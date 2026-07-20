import { describe, expect, it } from 'vitest';
import {
  localDayStartUtc,
  localHour,
  localWeekStartUtc,
  tzOffsetMs,
} from '../src/modules/ai/time.util.js';

// 2026-07-15 is a Wednesday; July ⇒ America/Toronto is EDT (UTC-4).
const d = new Date('2026-07-15T12:00:00Z');

describe('time.util', () => {
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
