/**
 * When Atlas asks how you are.
 *
 * One reading a day tells you how a day went. TWO — one shortly after waking,
 * one shortly before sleep — tell you what the day DID to you, because the
 * difference between them is bounded by the hours in between. That is the pair
 * the pattern finder on Looking back can actually compare: a single evening
 * mood cannot separate "the day was hard" from "I woke up like this".
 *
 * The times come from the user's own sleep block in their routine, so this
 * follows a night shift or a 5am start without anyone configuring a second
 * thing. With no routine set, it falls back to ordinary hours and says so.
 *
 * Everything here is minutes from LOCAL midnight, and every comparison handles
 * wrapping past midnight, because a sleep block routinely does.
 */

/** Which of the day's two readings a moment belongs to. */
export type MoodWindowId = 'morning' | 'evening';

export interface MoodWindow {
  id: MoodWindowId;
  /** Minutes from local midnight. May be greater than `endMin` (wraps midnight). */
  startMin: number;
  endMin: number;
}

/**
 * The recommended hour — right after waking, right before bed.
 *
 * The window Atlas will actually accept an answer in is wider (see GRACE). An
 * hour is the right ADVICE and the wrong deadline: someone who opens Atlas
 * ninety minutes after waking would otherwise never be asked at all, and a
 * prompt that mostly does not fire collects nothing.
 */
export const RECOMMENDED_MINUTES = 60;

/** How much longer than the recommended hour the ask stays open. */
export const GRACE_MINUTES = 120;

/** Used when the user has not described their sleep yet. */
export const DEFAULT_WAKE_MIN = 7 * 60;
export const DEFAULT_SLEEP_MIN = 23 * 60;

const DAY = 24 * 60;
const wrap = (min: number) => ((min % DAY) + DAY) % DAY;

/** The sleep block's shape, reduced to what this needs. */
export interface SleepTimes {
  /** When sleep begins — the block's start. */
  startMin: number;
  /** When it ends — waking. */
  endMin: number;
}

/**
 * The day's two asks, from the user's sleep block (or ordinary hours without one).
 *
 * Morning opens at waking; evening closes at bedtime. Both run
 * RECOMMENDED + GRACE long, so the recommendation stays honest while the prompt
 * still fires for someone who does not open the app the minute they wake.
 */
export function moodWindows(sleep?: SleepTimes | null): MoodWindow[] {
  const wake = wrap(sleep?.endMin ?? DEFAULT_WAKE_MIN);
  const bed = wrap(sleep?.startMin ?? DEFAULT_SLEEP_MIN);
  const span = RECOMMENDED_MINUTES + GRACE_MINUTES;
  return [
    { id: 'morning', startMin: wake, endMin: wrap(wake + span) },
    { id: 'evening', startMin: wrap(bed - span), endMin: bed },
  ];
}

/** Whether a local minute-of-day falls inside a window that may wrap midnight. */
export function inMoodWindow(minuteOfDay: number, w: MoodWindow): boolean {
  const m = wrap(minuteOfDay);
  return w.startMin <= w.endMin
    ? m >= w.startMin && m < w.endMin
    : m >= w.startMin || m < w.endMin;
}

/**
 * The window a moment belongs to, or null between them.
 *
 * Evening is tested first. Windows can overlap for someone who sleeps very
 * little — a four-hour night makes "just after waking" and "just before bed"
 * genuinely the same moment — and in that case the useful reading is the one
 * that closes the day rather than the one that opens it.
 */
export function activeMoodWindow(minuteOfDay: number, windows: MoodWindow[]): MoodWindow | null {
  const evening = windows.find((w) => w.id === 'evening');
  if (evening && inMoodWindow(minuteOfDay, evening)) return evening;
  return windows.find((w) => inMoodWindow(minuteOfDay, w)) ?? null;
}

/**
 * Is this reading still inside its recommended hour?
 *
 * Only used to phrase the prompt: inside the hour it says nothing about timing,
 * past it, it explains what the better moment would have been. Nagging someone
 * who is answering right now would be a strange thanks for answering.
 */
export function isWithinRecommended(minuteOfDay: number, w: MoodWindow): boolean {
  const m = wrap(minuteOfDay);
  const from = w.id === 'morning' ? w.startMin : wrap(w.endMin - RECOMMENDED_MINUTES);
  const to = w.id === 'morning' ? wrap(w.startMin + RECOMMENDED_MINUTES) : w.endMin;
  return inMoodWindow(m, { id: w.id, startMin: from, endMin: to });
}
