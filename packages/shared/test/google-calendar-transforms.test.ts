import { describe, expect, it } from 'vitest';
import { parseGoogleDate, isAllDay } from '../src/google-calendar-transforms.js';

describe('parseGoogleDate / isAllDay', () => {
  it('reads timed events from dateTime', () => {
    expect(parseGoogleDate({ dateTime: '2026-08-01T10:00:00Z' })?.toISOString()).toBe('2026-08-01T10:00:00.000Z');
  });

  it('reads all-day events from date', () => {
    expect(parseGoogleDate({ date: '2026-08-01' })?.toISOString()).toBe('2026-08-01T00:00:00.000Z');
  });

  it('returns null for a missing or unparseable slot', () => {
    expect(parseGoogleDate(undefined)).toBeNull();
    expect(parseGoogleDate({})).toBeNull();
    expect(parseGoogleDate({ dateTime: 'not-a-date' })).toBeNull();
  });

  it('detects all-day only when date is present without dateTime', () => {
    expect(isAllDay({ id: '1', start: { date: '2026-08-01' } })).toBe(true);
    expect(isAllDay({ id: '1', start: { dateTime: '2026-08-01T10:00:00Z' } })).toBe(false);
    expect(isAllDay({ id: '1' })).toBe(false);
  });
});
