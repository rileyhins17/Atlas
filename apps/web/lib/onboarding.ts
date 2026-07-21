import type { CreateNoteInput, RoutineBlockInput } from '@atlas/shared';

/**
 * Answer → schedule + knowledge mapping for the onboarding wizard. Pure and
 * unit-tested: exact times (from real time inputs) become routine blocks, and
 * the free-text answers become pinned notes — always in the AI's context and
 * auto-embedded for recall by the existing memory pipeline.
 */

export const WEEKDAYS = 0b0011111; // Mon–Fri
export const DAILY = 0b1111111;

export interface OnboardingAnswers {
  /** Exact minutes from midnight (real <input type="time"> values). */
  bedtimeMin: number;
  wakeMin: number;
  weekday: 'office' | 'school' | 'shifts' | 'flexible';
  /** Fixed-hours shapes may carry exact times; sensible defaults otherwise. */
  workStartMin?: number;
  workEndMin?: number;
  exercise: 'morning' | 'lunch' | 'evening' | 'none';
  meals: 'regular' | 'chaotic';
}

/** "23:30" ↔ 1410 — the <input type="time"> wire format. */
export function timeToMin(value: string): number {
  const [h, m] = value.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

export function minToTime(min: number): string {
  const clamped = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(clamped / 60)).padStart(2, '0')}:${String(clamped % 60).padStart(2, '0')}`;
}

export function buildRoutine(a: OnboardingAnswers): RoutineBlockInput[] {
  const blocks: RoutineBlockInput[] = [];

  // Sleep — the anchor. Wind-down covers the 45 min before bed.
  blocks.push({ label: 'Sleep', kind: 'sleep', days: DAILY, startMin: a.bedtimeMin, endMin: a.wakeMin });
  const windStart = (a.bedtimeMin - 45 + 1440) % 1440;
  blocks.push({ label: 'Wind-down', kind: 'winddown', days: DAILY, startMin: windStart, endMin: a.bedtimeMin });

  if (a.weekday === 'office') {
    blocks.push({
      label: 'Work',
      kind: 'work',
      days: WEEKDAYS,
      startMin: a.workStartMin ?? 9 * 60,
      endMin: a.workEndMin ?? 17 * 60,
    });
  } else if (a.weekday === 'school') {
    blocks.push({
      label: 'School',
      kind: 'school',
      days: WEEKDAYS,
      startMin: a.workStartMin ?? 8 * 60 + 30,
      endMin: a.workEndMin ?? 15 * 60 + 30,
    });
  } else if (a.weekday === 'flexible') {
    blocks.push({ label: 'Focus time', kind: 'work', days: WEEKDAYS, startMin: 10 * 60, endMin: 12 * 60 + 30 });
  }
  // 'shifts' → no fixed block; the calendar carries the varying schedule.

  if (a.exercise === 'morning') {
    const start = (a.wakeMin + 30) % 1440;
    blocks.push({ label: 'Exercise', kind: 'exercise', days: DAILY, startMin: start, endMin: start + 60 });
  } else if (a.exercise === 'lunch') {
    blocks.push({ label: 'Exercise', kind: 'exercise', days: WEEKDAYS, startMin: 12 * 60, endMin: 12 * 60 + 45 });
  } else if (a.exercise === 'evening') {
    blocks.push({ label: 'Exercise', kind: 'exercise', days: DAILY, startMin: 17 * 60 + 30, endMin: 18 * 60 + 15 });
  }

  if (a.meals === 'regular') {
    const breakfast = (a.wakeMin + 15) % 1440;
    blocks.push({ label: 'Breakfast', kind: 'meal', days: DAILY, startMin: breakfast, endMin: breakfast + 30 });
    blocks.push({ label: 'Lunch', kind: 'meal', days: DAILY, startMin: 12 * 60 + 45, endMin: 13 * 60 + 15 });
    blocks.push({ label: 'Dinner', kind: 'meal', days: DAILY, startMin: 18 * 60 + 30, endMin: 19 * 60 + 15 });
  }

  return blocks;
}

export interface OnboardingFreeText {
  about: string;
  goals: string;
  context: string;
}

/**
 * The free-text answers become PINNED notes: always in the AI's context via the
 * notes summary, and auto-queued for embedding → semantically recallable.
 * Empty answers write nothing — never create hollow notes.
 */
export function answersToNotes(text: OnboardingFreeText): CreateNoteInput[] {
  const notes: CreateNoteInput[] = [];
  const add = (title: string, body: string) => {
    const trimmed = body.trim();
    if (trimmed) notes.push({ title, body: trimmed, tags: ['onboarding'], pinned: true });
  };
  add('About me', text.about);
  add('My goals', text.goals);
  add('Things to know', text.context);
  return notes;
}

/** Habit seeds the wizard offers alongside free entry. */
export const HABIT_SEEDS = ['Gym', 'Read', 'Water', 'Meditate', 'Journal', 'Walk'] as const;
