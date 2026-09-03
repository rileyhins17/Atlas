import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SLEEP_MIN,
  DEFAULT_WAKE_MIN,
  GRACE_MINUTES,
  RECOMMENDED_MINUTES,
  activeMoodWindow,
  inMoodWindow,
  isWithinRecommended,
  moodWindows,
} from '../src/dto/mood-windows.js';

/**
 * Two readings a day, from the user's own sleep block. Almost everything that
 * can go wrong here is midnight: a sleep block wraps it by definition, and an
 * evening window sits right against it.
 */
const at = (h: number, m = 0) => h * 60 + m;

describe('moodWindows', () => {
  it('opens the morning at waking and closes the evening at bedtime', () => {
    // Asleep 23:00 → 07:00.
    const [morning, evening] = moodWindows({ startMin: at(23), endMin: at(7) });
    expect(morning!.startMin).toBe(at(7));
    expect(evening!.endMin).toBe(at(23));
  });

  it('falls back to ordinary hours with no routine set', () => {
    const [morning, evening] = moodWindows(null);
    expect(morning!.startMin).toBe(DEFAULT_WAKE_MIN);
    expect(evening!.endMin).toBe(DEFAULT_SLEEP_MIN);
  });

  /** A night shift is the case that makes this worth reading from the routine. */
  it('follows a night shift rather than the clock', () => {
    // Asleep 09:00 → 17:00.
    const [morning, evening] = moodWindows({ startMin: at(9), endMin: at(17) });
    expect(inMoodWindow(at(17, 30), morning!)).toBe(true);
    expect(inMoodWindow(at(8, 30), evening!)).toBe(true);
    // 8am is bedtime-adjacent for this person, not morning.
    expect(inMoodWindow(at(8, 30), morning!)).toBe(false);
  });

  it('stays open past the recommended hour, but not indefinitely', () => {
    const [morning] = moodWindows({ startMin: at(23), endMin: at(7) });
    expect(inMoodWindow(at(7, 30), morning!)).toBe(true);
    expect(inMoodWindow(at(9, 30), morning!)).toBe(true);
    expect(inMoodWindow(at(7) + RECOMMENDED_MINUTES + GRACE_MINUTES + 1, morning!)).toBe(false);
    // And the afternoon is nobody's morning.
    expect(inMoodWindow(at(14), morning!)).toBe(false);
  });
});

describe('inMoodWindow', () => {
  /** An evening window that ends at midnight wraps, and must not swallow the day. */
  it('handles a window that crosses midnight', () => {
    const w = { id: 'evening' as const, startMin: at(23), endMin: at(2) };
    expect(inMoodWindow(at(23, 30), w)).toBe(true);
    expect(inMoodWindow(at(0, 30), w)).toBe(true);
    expect(inMoodWindow(at(12), w)).toBe(false);
  });

  it('excludes the closing minute so the two windows cannot both claim it', () => {
    const w = { id: 'morning' as const, startMin: at(7), endMin: at(10) };
    expect(inMoodWindow(at(7), w)).toBe(true);
    expect(inMoodWindow(at(10), w)).toBe(false);
  });
});

describe('activeMoodWindow', () => {
  const windows = moodWindows({ startMin: at(23), endMin: at(7) });

  it('is the morning shortly after waking', () => {
    expect(activeMoodWindow(at(7, 20), windows)?.id).toBe('morning');
  });

  it('is the evening shortly before bed', () => {
    expect(activeMoodWindow(at(22, 30), windows)?.id).toBe('evening');
  });

  /** The middle of the day is not a moment Atlas has anything to ask about. */
  it('is nothing at all in between', () => {
    expect(activeMoodWindow(at(14), windows)).toBeNull();
  });

  /**
   * A four-hour night makes "just after waking" and "just before bed" the same
   * moment. The reading that closes the day is the useful one.
   */
  it('prefers the evening when a short night overlaps them', () => {
    const short = moodWindows({ startMin: at(3), endMin: at(0, 30) });
    expect(activeMoodWindow(at(1), short)?.id).toBe('evening');
  });
});

describe('isWithinRecommended', () => {
  const [morning, evening] = moodWindows({ startMin: at(23), endMin: at(7) });

  it('is true in the hour after waking and false after it', () => {
    expect(isWithinRecommended(at(7, 30), morning!)).toBe(true);
    expect(isWithinRecommended(at(9), morning!)).toBe(false);
  });

  it('is true in the hour before bed and false before it', () => {
    expect(isWithinRecommended(at(22, 30), evening!)).toBe(true);
    expect(isWithinRecommended(at(21), evening!)).toBe(false);
  });
});
