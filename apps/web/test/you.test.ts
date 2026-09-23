import { describe, expect, it } from 'vitest';
import { weekAtAGlance } from '@/lib/you';

const NOW = new Date(2026, 8, 23, 15, 0); // Wed 23 Sep 2026, 3pm local
const day = (offset: number, h = 12) => new Date(2026, 8, 23 + offset, h).toISOString();

describe('weekAtAGlance', () => {
  it('counts the last seven local days, today included', () => {
    const g = weekAtAGlance(
      [
        { status: 'DONE', completedAt: day(0) },
        { status: 'DONE', completedAt: day(-6, 0) },
        { status: 'DONE', completedAt: day(-7, 23) },
        { status: 'TODO', completedAt: null },
      ],
      [{ endedAt: day(-2) }, { endedAt: day(-9) }],
      [{ streak: 3 }, { streak: 12 }, { streak: 0 }],
      NOW,
    );
    expect(g).toEqual({ tasksDone: 2, workouts: 1, bestStreak: 12 });
  });

  it('never counts a session that is still open', () => {
    expect(weekAtAGlance([], [{ endedAt: null }], [], NOW).workouts).toBe(0);
  });

  it('reads zero, not a guess, for an empty account', () => {
    expect(weekAtAGlance([], [], [], NOW)).toEqual({ tasksDone: 0, workouts: 0, bestStreak: 0 });
  });
});
