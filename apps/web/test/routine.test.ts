import { describe, expect, it } from 'vitest';
import type { RoutineBlockDTO } from '@atlas/shared';
import { routineAt } from '@/lib/stream';
import { answersToNotes, buildRoutine, DAILY, minToTime, timeToMin, WEEKDAYS } from '@/lib/onboarding';

const block = (over: Partial<RoutineBlockDTO>): RoutineBlockDTO => ({
  id: over.id ?? `b${Math.random()}`,
  label: over.label ?? 'Block',
  kind: over.kind ?? 'custom',
  days: over.days ?? DAILY,
  startMin: over.startMin ?? 0,
  endMin: over.endMin ?? 60,
  ...over,
});

// Wed Jul 15 2026 (a Wednesday), local time constructors throughout.
const at = (h: number, m = 0, dayOffset = 0) => new Date(2026, 6, 15 + dayOffset, h, m);

describe('routineAt', () => {
  const sleep = block({ label: 'Sleep', kind: 'sleep', startMin: 23 * 60, endMin: 7 * 60 }); // wraps
  const work = block({ label: 'Work', kind: 'work', days: WEEKDAYS, startMin: 9 * 60, endMin: 17 * 60 });

  it('matches a plain daytime block on an applicable day', () => {
    expect(routineAt([sleep, work], at(10))?.label).toBe('Work'); // Wed 10:00
    expect(routineAt([sleep, work], at(18))).toBeNull(); // Wed 18:00 — gap
  });

  it('does not match a weekday block on the weekend', () => {
    expect(routineAt([work], at(10, 0, 3))).toBeNull(); // Saturday 10:00
  });

  it('matches both halves of an overnight block', () => {
    expect(routineAt([sleep], at(23, 30))?.label).toBe('Sleep'); // tonight's half
    expect(routineAt([sleep], at(3))?.label).toBe('Sleep'); // this morning's half
    expect(routineAt([sleep], at(12))).toBeNull(); // midday — no
  });

  it("the morning half of an overnight block follows YESTERDAY's day mask", () => {
    // Sleep only on Friday nights (bit 4). Saturday 3am = still that block; Sunday 3am = not.
    const friNight = block({ label: 'FriSleep', days: 1 << 4, startMin: 23 * 60, endMin: 7 * 60 });
    expect(routineAt([friNight], at(3, 0, 3))?.label).toBe('FriSleep'); // Sat 18th, 3am
    expect(routineAt([friNight], at(3, 0, 4))).toBeNull(); // Sun 19th, 3am
  });
});


describe('buildRoutine', () => {
  it('always anchors sleep + wind-down, wrapping bedtime correctly', () => {
    const blocks = buildRoutine({
      bedtimeMin: 0, // midnight
      wakeMin: 7 * 60,
      weekday: 'shifts',
      exercise: 'none',
      meals: 'chaotic',
    });
    const sleep = blocks.find((b) => b.kind === 'sleep')!;
    const wind = blocks.find((b) => b.kind === 'winddown')!;
    expect(sleep).toMatchObject({ startMin: 0, endMin: 420, days: DAILY });
    expect(wind.startMin).toBe(23 * 60 + 15); // 45 min before a midnight bedtime
    expect(blocks.filter((b) => b.kind === 'work')).toHaveLength(0); // shifts → none
  });

  it('maps an office week + evening movement + regular meals', () => {
    const blocks = buildRoutine({
      bedtimeMin: 23 * 60,
      wakeMin: 7 * 60,
      weekday: 'office',
      exercise: 'evening',
      meals: 'regular',
    });
    expect(blocks.find((b) => b.kind === 'work')).toMatchObject({
      days: WEEKDAYS,
      startMin: 540,
      endMin: 1020,
    });
    expect(blocks.find((b) => b.kind === 'exercise')?.startMin).toBe(17 * 60 + 30);
    expect(blocks.filter((b) => b.kind === 'meal')).toHaveLength(3);
  });

  it('office/school honour exact workday times when provided', () => {
    const blocks = buildRoutine({
      bedtimeMin: 23 * 60,
      wakeMin: 7 * 60,
      weekday: 'office',
      workStartMin: 10 * 60,
      workEndMin: 18 * 60 + 30,
      exercise: 'none',
      meals: 'chaotic',
    });
    expect(blocks.find((b) => b.kind === 'work')).toMatchObject({ startMin: 600, endMin: 1110 });
  });

  it('places morning exercise relative to wake time', () => {
    const blocks = buildRoutine({
      bedtimeMin: 22 * 60,
      wakeMin: 6 * 60,
      weekday: 'flexible',
      exercise: 'morning',
      meals: 'chaotic',
    });
    expect(blocks.find((b) => b.kind === 'exercise')?.startMin).toBe(6 * 60 + 30);
  });
});

describe('time input helpers', () => {
  it('round-trips <input type="time"> values and minutes', () => {
    expect(timeToMin('23:30')).toBe(1410);
    expect(timeToMin('00:05')).toBe(5);
    expect(minToTime(1410)).toBe('23:30');
    expect(minToTime(0)).toBe('00:00');
    expect(minToTime(1440 + 90)).toBe('01:30'); // wraps
  });
});

describe('answersToNotes', () => {
  it('creates pinned onboarding notes only for non-empty answers', () => {
    const notes = answersToNotes({ about: '  I build apps  ', goals: '', context: '\n' });
    expect(notes).toEqual([
      { title: 'About me', body: 'I build apps', tags: ['onboarding'], pinned: true },
    ]);
  });

  it('maps all three answers with their titles', () => {
    const notes = answersToNotes({ about: 'a', goals: 'g', context: 'c' });
    expect(notes.map((n) => n.title)).toEqual(['About me', 'My goals', 'Things to know']);
    expect(notes.every((n) => n.pinned)).toBe(true);
  });
});
