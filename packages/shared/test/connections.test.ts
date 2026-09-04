import { describe, expect, it } from 'vitest';
import {
  describeMissingEvidence,
  findConnections,
  type StatsDayDTO,
} from '../src/index.js';

function day(over: Partial<StatsDayDTO> = {}): StatsDayDTO {
  return {
    day: '2026-07-01',
    tasksCompleted: 0,
    habitChecks: 0,
    moodAvg: null,
    journalEntries: 0,
    spentMinor: 0,
    earnedMinor: 0,
    workouts: 0,
    volumeGrams: 0,
    events: 0,
    ...over,
  };
}

/** `n` days matching `shape`, so a test reads as "10 days where X". */
function days(n: number, shape: Partial<StatsDayDTO>): StatsDayDTO[] {
  return Array.from({ length: n }, (_, i) =>
    day({ ...shape, day: `2026-07-${String(i + 1).padStart(2, '0')}` }),
  );
}

describe('finding cross-domain connections', () => {
  it('says nothing at all until there is a fortnight to look at', () => {
    // 13 days of a screamingly obvious pattern still gets silence. A confident
    // claim from a week of data is the failure this whole module defends
    // against, because the user cannot tell it apart from a real one.
    const obvious = [
      ...days(7, { workouts: 1, tasksCompleted: 8 }),
      ...days(6, { workouts: 0, tasksCompleted: 0 }),
    ];
    expect(findConnections(obvious)).toEqual([]);
    expect(describeMissingEvidence(obvious)).toContain('two weeks');
  });

  it('needs enough days on BOTH sides, not just enough days', () => {
    // 28 days, but only two of them are training days. The average of two days
    // is an anecdote; comparing it to 26 gives a headline built on nothing.
    const lopsided = [
      ...days(2, { workouts: 1, tasksCompleted: 9 }),
      ...days(26, { workouts: 0, tasksCompleted: 1 }),
    ];
    expect(findConnections(lopsided)).toEqual([]);
  });

  it('reports a real difference, with the numbers behind it', () => {
    const real = [
      ...days(10, { workouts: 1, tasksCompleted: 4 }),
      ...days(10, { workouts: 0, tasksCompleted: 1 }),
    ];
    const found = findConnections(real);
    const tasks = found.find((c) => c.id === 'training-tasks');
    expect(tasks).toBeDefined();
    expect(tasks!.headline).toContain('train');
    // The detail exists so the claim is checkable rather than trusted.
    expect(tasks!.detail).toContain('4');
    expect(tasks!.detail).toContain('1');
    expect(tasks!.domains).toEqual(['training', 'tasks']);
  });

  it('ignores a difference too small to act on', () => {
    // 5 a day versus 4 a day is a real difference and a worthless card.
    const noise = [
      ...days(10, { workouts: 1, tasksCompleted: 5 }),
      ...days(10, { workouts: 0, tasksCompleted: 4 }),
    ];
    expect(findConnections(noise).some((c) => c.id === 'training-tasks')).toBe(false);
  });

  it('never claims a direction the data does not show', () => {
    // Fewer tasks on training days is not "training helps you get things done"
    // said backwards — this rule simply has nothing to report.
    const inverted = [
      ...days(10, { workouts: 1, tasksCompleted: 1 }),
      ...days(10, { workouts: 0, tasksCompleted: 5 }),
    ];
    expect(findConnections(inverted).some((c) => c.id === 'training-tasks')).toBe(false);
  });

  it('leaves unjournaled days out of a mood comparison rather than scoring them zero', () => {
    // Counting a day with no journal as mood 0 would manufacture a difference
    // out of whether the user wrote anything, which is not what is being asked.
    const someJournaled = [
      ...days(8, { workouts: 1, moodAvg: 4 }),
      ...days(8, { workouts: 0, moodAvg: null }),
    ];
    // Only one side has mood data, so there is nothing to compare.
    expect(findConnections(someJournaled).some((c) => c.id === 'training-mood')).toBe(false);
  });

  it('reads mood on its own 1-5 scale, not as a percentage', () => {
    const moodSwing = [
      ...days(8, { workouts: 1, moodAvg: 4.2 }),
      ...days(8, { workouts: 0, moodAvg: 3.1 }),
    ];
    const mood = findConnections(moodSwing).find((c) => c.id === 'training-mood');
    expect(mood).toBeDefined();
    expect(mood!.detail).toContain('out of 5');
  });

  it('reports mood going the other way honestly instead of hiding it', () => {
    const worse = [
      ...days(8, { workouts: 1, moodAvg: 2.6 }),
      ...days(8, { workouts: 0, moodAvg: 3.9 }),
    ];
    const mood = findConnections(worse).find((c) => c.id === 'training-mood');
    expect(mood).toBeDefined();
    expect(mood!.headline).toContain('lower');
  });

  it('ranks the strongest observation first, because only one gets shown', () => {
    const both = [
      ...days(10, { workouts: 1, habitChecks: 1, tasksCompleted: 6, moodAvg: 4.1 }),
      ...days(10, { workouts: 0, habitChecks: 0, tasksCompleted: 1, moodAvg: 3.8 }),
    ];
    const found = findConnections(both);
    expect(found.length).toBeGreaterThan(1);
    for (let i = 1; i < found.length; i += 1) {
      expect(found[i - 1]!.strength).toBeGreaterThanOrEqual(found[i]!.strength);
    }
  });

  it('phrases a doubling as a doubling', () => {
    const doubled = [
      ...days(10, { workouts: 1, tasksCompleted: 4 }),
      ...days(10, { workouts: 0, tasksCompleted: 2 }),
    ];
    const tasks = findConnections(doubled).find((c) => c.id === 'training-tasks');
    expect(tasks!.headline).toContain('twice as many');
  });
});

describe('saying what is missing', () => {
  it('asks for the specific thing that would unlock a comparison', () => {
    // Plenty of history, but nothing journaled — so say that, rather than
    // "not enough data", which reads as the user having done something wrong.
    const noJournal = days(30, { workouts: 1, tasksCompleted: 3 });
    expect(describeMissingEvidence(noJournal)).toContain('journal');
  });

  it('goes quiet once the data is there, so silence means something else', () => {
    const rich = [
      ...days(15, { workouts: 1, moodAvg: 4, tasksCompleted: 3 }),
      ...days(15, { workouts: 0, moodAvg: 3, tasksCompleted: 2 }),
    ];
    expect(describeMissingEvidence(rich)).toBeNull();
  });
});

describe('a window is not the same thing as history', () => {
  it('counts days that HAPPENED, not days in the window', () => {
    // The rollup zero-fills, so a brand-new account hands back a full window of
    // empty days. Reading that as "30 days of history" would skip the guard
    // that exists precisely to protect a new user from an invented pattern.
    const emptyWindow = days(30, {});
    expect(findConnections(emptyWindow)).toEqual([]);
    expect(describeMissingEvidence(emptyWindow)).toContain('It has 0.');
  });

  it('counts a day as history if anything at all is on it', () => {
    const barelyUsed = [...days(3, { events: 1 }), ...days(27, {})];
    expect(describeMissingEvidence(barelyUsed)).toContain('It has 3.');
  });
});

describe('gaps are not zeroes', () => {
  it('excludes days with nothing recorded from a comparison', () => {
    // Every non-training day here has exactly 1 task. Counting the six days the
    // user never opened Atlas as "0 tasks" would report the average as 0.7 and
    // turn a 4x difference into a 6x one. Found live, not in a test.
    const withGaps = [
      ...days(10, { workouts: 1, tasksCompleted: 4 }),
      ...days(10, { workouts: 0, tasksCompleted: 1 }),
      ...days(6, {}),
    ];
    const tasks = findConnections(withGaps).find((c) => c.id === 'training-tasks');
    expect(tasks).toBeDefined();
    // 4 vs 1 exactly — the untouched days must not appear on either side.
    expect(tasks!.detail).toBe('4 a day when you train, 1 when you do not.');
    expect(tasks!.headline).toContain('4 times as many');
  });
});
