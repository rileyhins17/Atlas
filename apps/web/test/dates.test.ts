import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  dayDiff,
  formatAgo,
  formatDue,
  greeting,
  localDayKey,
} from '../lib/dates';

// Fixed local-time anchor: a Saturday mid-afternoon.
const NOW = new Date(2026, 6, 18, 15, 0, 0); // 2026-07-18 15:00 local

describe('date helpers', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('localDayKey formats local YYYY-MM-DD', () => {
    expect(localDayKey(NOW)).toBe('2026-07-18');
    expect(localDayKey(new Date(2026, 0, 3))).toBe('2026-01-03');
  });

  it('dayDiff counts calendar days, not 24h periods', () => {
    const lateTonight = new Date(2026, 6, 18, 23, 30);
    const earlyTomorrow = new Date(2026, 6, 19, 0, 30);
    expect(dayDiff(lateTonight, earlyTomorrow)).toBe(1);
  });

  describe('formatDue', () => {
    it('phrases overdue days', () => {
      expect(formatDue(new Date(2026, 6, 17, 9), NOW)).toBe('due yesterday');
      expect(formatDue(new Date(2026, 6, 15, 9), NOW)).toBe('3d overdue');
    });
    it('phrases today by hours/minutes', () => {
      expect(formatDue(new Date(2026, 6, 18, 17, 0), NOW)).toBe('in 2h');
      expect(formatDue(new Date(2026, 6, 18, 15, 20), NOW)).toBe('in 20m');
      expect(formatDue(new Date(2026, 6, 18, 15, 2), NOW)).toBe('now');
    });
    it('phrases tomorrow and near-week days', () => {
      expect(formatDue(new Date(2026, 6, 19, 9), NOW)).toBe('tomorrow');
      // 2026-07-20 is a Monday, 2 days out → weekday name.
      expect(formatDue(new Date(2026, 6, 20, 9), NOW)).toMatch(/Mon/);
    });
    it('falls back to a date for far-out due dates', () => {
      expect(formatDue(new Date(2026, 7, 28, 9), NOW)).toMatch(/Aug/);
    });
  });

  describe('formatAgo', () => {
    it('covers just-now through days', () => {
      expect(formatAgo(new Date(NOW.getTime() - 30_000), NOW)).toBe('just now');
      expect(formatAgo(new Date(NOW.getTime() - 12 * 60_000), NOW)).toBe('12m ago');
      expect(formatAgo(new Date(2026, 6, 18, 11, 0), NOW)).toBe('4h ago');
      expect(formatAgo(new Date(2026, 6, 17, 15, 0), NOW)).toBe('yesterday');
      expect(formatAgo(new Date(2026, 6, 15, 15, 0), NOW)).toBe('3d ago');
    });
  });

  it('greeting tracks the hour', () => {
    expect(greeting(new Date(2026, 6, 18, 8))).toBe('Good morning');
    expect(greeting(new Date(2026, 6, 18, 14))).toBe('Good afternoon');
    expect(greeting(new Date(2026, 6, 18, 21))).toBe('Good evening');
    expect(greeting(new Date(2026, 6, 18, 2))).toBe('Up late');
  });
});
