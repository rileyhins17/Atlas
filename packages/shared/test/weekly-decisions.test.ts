import { describe, expect, it } from 'vitest';
import {
  describeDecision,
  weeklyDecisions,
  type GoalDTO,
  type HabitDTO,
} from '../src/index.js';

function goal(over: Partial<GoalDTO> = {}): GoalDTO {
  return {
    id: 'g1',
    title: 'Run a half marathon',
    description: null,
    horizon: 'short',
    status: 'active',
    targetDate: null,
    position: 0,
    taskCount: 0,
    doneTaskCount: 0,
    createdAt: '2026-07-01T00:00:00.000Z',
    ...over,
  };
}

function habit(over: Partial<HabitDTO> = {}): HabitDTO {
  return {
    id: 'h1',
    name: 'Stretch',
    cadence: 'daily',
    target: 1,
    active: true,
    doneToday: false,
    todayCount: 0,
    streak: 0,
    createdAt: '2026-07-01T00:00:00.000Z',
    ...over,
  };
}

const empty = { slippedCount: 0, goals: [], habits: [], daysSinceHabit: new Map<string, number>() };

describe('the weekly review as decisions', () => {
  it('has nothing to say when nothing needs deciding', () => {
    expect(weeklyDecisions(empty)).toEqual([]);
  });

  it('leads with work that slipped, the only thing that worsens on its own', () => {
    const out = weeklyDecisions({
      ...empty,
      slippedCount: 4,
      goals: [goal()],
      habits: [habit()],
      daysSinceHabit: new Map([['h1', 30]]),
    });
    expect(out[0]!.kind).toBe('slipped');
    expect(describeDecision(out[0]!)).toBe('4 things slipped past their dates.');
  });

  it('counts one slipped item without saying "1 things"', () => {
    const out = weeklyDecisions({ ...empty, slippedCount: 1 });
    expect(describeDecision(out[0]!)).toBe('1 thing slipped past its date.');
  });

  it('leaves a habit alone until it has really gone quiet', () => {
    // A week off is a week off. Prompting at that point trains the user to
    // dismiss the review unread, which costs more than the missed habit.
    const recent = weeklyDecisions({
      ...empty,
      habits: [habit()],
      daysSinceHabit: new Map([['h1', 9]]),
    });
    expect(recent).toEqual([]);

    const stale = weeklyDecisions({
      ...empty,
      habits: [habit()],
      daysSinceHabit: new Map([['h1', 21]]),
    });
    expect(stale[0]).toMatchObject({ kind: 'habit-stalled', habitId: 'h1', days: 21 });
  });

  it('ignores habits already switched off, and ones never logged', () => {
    expect(
      weeklyDecisions({
        ...empty,
        habits: [habit({ active: false })],
        daysSinceHabit: new Map([['h1', 40]]),
      }),
    ).toEqual([]);
    // No entry means no history to judge — a habit added yesterday is not stalled.
    expect(weeklyDecisions({ ...empty, habits: [habit()] })).toEqual([]);
  });

  it('asks about a short-term goal with no work on it', () => {
    const out = weeklyDecisions({ ...empty, goals: [goal()] });
    expect(out[0]).toMatchObject({ kind: 'goal-unbroken', goalId: 'g1' });
    expect(describeDecision(out[0]!)).toContain('no work attached');
  });

  it('never nags about a long-term goal', () => {
    // "Financial independence" having no tasks this week is not a problem, and
    // asking every week is how a review earns being ignored.
    expect(weeklyDecisions({ ...empty, goals: [goal({ horizon: 'long' })] })).toEqual([]);
  });

  it('says nothing about a goal that already has work, or one not active', () => {
    expect(weeklyDecisions({ ...empty, goals: [goal({ taskCount: 3 })] })).toEqual([]);
    expect(weeklyDecisions({ ...empty, goals: [goal({ status: 'achieved' })] })).toEqual([]);
  });

  it('caps the list, because a long review is one you skip', () => {
    const out = weeklyDecisions({
      ...empty,
      slippedCount: 2,
      habits: [habit({ id: 'h1' }), habit({ id: 'h2', name: 'Read' })],
      goals: [goal({ id: 'g1' }), goal({ id: 'g2', title: 'Ship Atlas' })],
      daysSinceHabit: new Map([
        ['h1', 20],
        ['h2', 20],
      ]),
    });
    expect(out).toHaveLength(3);
  });
});
