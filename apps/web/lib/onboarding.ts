import type { RoutineBlockInput } from '@atlas/shared';

/**
 * Answer → schedule mapping for the onboarding wizard. Pure and unit-tested:
 * given the MCQ answers, produce the routine blocks that fill the user's week.
 */

export const WEEKDAYS = 0b0011111; // Mon–Fri
export const DAILY = 0b1111111;

export interface OnboardingAnswers {
  /** Bedtime + wake, minutes from midnight. Sleep wraps overnight. */
  bedtimeMin: number;
  wakeMin: number;
  /** Weekday shape. */
  weekday: 'office' | 'school' | 'shifts' | 'flexible';
  exercise: 'morning' | 'lunch' | 'evening' | 'none';
  meals: 'regular' | 'chaotic';
}

export function buildRoutine(a: OnboardingAnswers): RoutineBlockInput[] {
  const blocks: RoutineBlockInput[] = [];

  // Sleep — the anchor. Wind-down covers the 45 min before bed.
  blocks.push({ label: 'Sleep', kind: 'sleep', days: DAILY, startMin: a.bedtimeMin, endMin: a.wakeMin });
  const windStart = (a.bedtimeMin - 45 + 1440) % 1440;
  blocks.push({ label: 'Wind-down', kind: 'winddown', days: DAILY, startMin: windStart, endMin: a.bedtimeMin });

  if (a.weekday === 'office') {
    blocks.push({ label: 'Work', kind: 'work', days: WEEKDAYS, startMin: 9 * 60, endMin: 17 * 60 });
  } else if (a.weekday === 'school') {
    blocks.push({ label: 'School', kind: 'school', days: WEEKDAYS, startMin: 8 * 60 + 30, endMin: 15 * 60 + 30 });
  } else if (a.weekday === 'flexible') {
    blocks.push({ label: 'Focus time', kind: 'work', days: WEEKDAYS, startMin: 10 * 60, endMin: 12 * 60 + 30 });
  }
  // 'shifts' → no fixed block; the calendar carries the varying schedule.

  if (a.exercise === 'morning') {
    // An hour after waking, so it never collides with the sleep block.
    const start = (a.wakeMin + 30) % 1440;
    blocks.push({ label: 'Exercise', kind: 'exercise', days: DAILY, startMin: start, endMin: start + 60 });
  } else if (a.exercise === 'lunch') {
    blocks.push({ label: 'Exercise', kind: 'exercise', days: WEEKDAYS, startMin: 12 * 60, endMin: 13 * 60 });
  } else if (a.exercise === 'evening') {
    blocks.push({ label: 'Exercise', kind: 'exercise', days: DAILY, startMin: 18 * 60, endMin: 19 * 60 });
  }

  if (a.meals === 'regular') {
    const breakfast = (a.wakeMin + 15) % 1440;
    blocks.push({ label: 'Breakfast', kind: 'meal', days: DAILY, startMin: breakfast, endMin: breakfast + 30 });
    blocks.push({ label: 'Lunch', kind: 'meal', days: DAILY, startMin: 12 * 60 + 30, endMin: 13 * 60 });
    blocks.push({ label: 'Dinner', kind: 'meal', days: DAILY, startMin: 18 * 60 + 30, endMin: 19 * 60 + 15 });
  }

  return blocks;
}

/** Habit seeds the wizard offers — name + a friendly emoji-free label. */
export const HABIT_SEEDS = ['Gym', 'Read', 'Water', 'Meditate', 'Journal', 'Walk'] as const;
