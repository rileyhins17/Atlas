import { describe, expect, it } from 'vitest';
import type { StatsDayDTO, StatsDTO } from '@atlas/shared';
import {
  dayActivity,
  daysSinceLastHabit,
  hasRealActivity,
  longestHabitStreak,
  whatChanged,
} from '@/lib/what-changed';

/**
 * The sentences that lead the page.
 *
 * They replace six unlabelled sparklines and "193 things happened" — numbers
 * that answered "how much did you do?" when the question is "am I doing better
 * or worse, and what should I change?". So every case here is about a sentence
 * being true, specific, and worth reading.
 */
const day = (over: Partial<StatsDayDTO> = {}): StatsDayDTO => ({
  day: '2026-09-01',
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
});

const totals = (over: Partial<StatsDTO['totals']['current']> = {}) => ({
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
});

const stats = (
  current: Partial<StatsDTO['totals']['current']>,
  previous: Partial<StatsDTO['totals']['current']>,
  days: StatsDayDTO[] = [],
): StatsDTO => ({ days, totals: { current: totals(current), previous: totals(previous) } });

const text = (data: StatsDTO, n = 30) => whatChanged(data, n).map((c) => c.text).join(' ');

describe('dayActivity', () => {
  /**
   * The bug this exists to prevent: the page gated on `events`, which counts
   * rows Atlas wrote to its OWN timeline. Ninety days of real history with no
   * timeline rows rendered "your long arc starts now".
   */
  it('counts what the person did, not what Atlas logged', () => {
    const busy = day({ tasksCompleted: 4, habitChecks: 2, workouts: 1, journalEntries: 1, events: 0 });
    expect(dayActivity(busy)).toBe(8);
    expect(hasRealActivity([busy])).toBe(true);
  });

  it('is not fooled by a full timeline on an empty day', () => {
    expect(dayActivity(day({ events: 250 }))).toBe(0);
    expect(hasRealActivity([day({ events: 250 })])).toBe(false);
  });
});

describe('streaks and gaps', () => {
  it('finds the longest unbroken run', () => {
    const days = [1, 1, 0, 1, 1, 1, 0].map((n) => day({ habitChecks: n }));
    expect(longestHabitStreak(days)).toBe(3);
  });

  it('counts days since the last check-in', () => {
    const days = [1, 1, 0, 0, 0].map((n) => day({ habitChecks: n }));
    expect(daysSinceLastHabit(days)).toBe(3);
  });

  it('says never rather than zero when there has been none', () => {
    expect(daysSinceLastHabit([day(), day()])).toBeNull();
  });
});

describe('whatChanged', () => {
  it('puts a real number in every sentence', () => {
    const out = whatChanged(stats({ tasksCompleted: 114 }, { tasksCompleted: 94 }), 30);
    expect(out.length).toBeGreaterThan(0);
    for (const c of out) expect(c.text, c.id).toMatch(/\d/);
  });

  it('quantifies against the period before, by name', () => {
    expect(text(stats({ tasksCompleted: 114 }, { tasksCompleted: 94 }))).toMatch(
      /114 tasks.*21%.*30 days before/,
    );
  });

  /** "Up 300%" from one to four is true and useless. */
  it('refuses a percentage against a tiny base', () => {
    const out = text(stats({ workouts: 4 }, { workouts: 1 }));
    expect(out).toMatch(/trained 4 times/);
    expect(out).not.toMatch(/%/);
    expect(out).toMatch(/up from 1/);
  });

  it('says nothing about a move too small to be a trend', () => {
    const out = whatChanged(stats({ tasksCompleted: 100 }, { tasksCompleted: 96 }), 30);
    expect(out.find((c) => c.id === 'tasks')).toBeUndefined();
  });

  /** Mood lives on a 1–5 scale; a percentage on it means nothing. */
  it('reports mood in points, never percent', () => {
    const out = text(stats({ moodAvg: 4.2 }, { moodAvg: 3.4 }));
    expect(out).toMatch(/4\.2 out of 5/);
    expect(out).toMatch(/up 0\.8 of a point/);
    expect(out).not.toMatch(/%/);
  });

  it('calls steady mood steady rather than omitting it', () => {
    expect(text(stats({ moodAvg: 3.4 }, { moodAvg: 3.3 }))).toMatch(/3\.4 out of 5, steady/);
  });

  /**
   * The page must not only report improvement. A gap is the most actionable
   * line on it, and it outranks good news.
   */
  it('surfaces a habit gap, and ranks it above the good news', () => {
    const days = [
      ...Array.from({ length: 5 }, () => day({ habitChecks: 1 })),
      ...Array.from({ length: 6 }, () => day({ habitChecks: 0 })),
    ];
    const out = whatChanged(stats({ tasksCompleted: 200 }, { tasksCompleted: 100 }, days), 30);
    const gap = out.find((c) => c.id === 'gap');
    expect(gap?.text).toMatch(/No habit check-in for 6 days/);
    expect(gap?.tone).toBe('warn');
    expect(out[0]?.id).toBe('gap');
  });

  it('stays quiet about a gap of a day or two', () => {
    const days = [day({ habitChecks: 1 }), day({ habitChecks: 0 })];
    expect(whatChanged(stats({}, {}, days), 30).find((c) => c.id === 'gap')).toBeUndefined();
  });

  /**
   * Spending less is GOOD news pointing DOWN. Tone and direction are separate
   * fields precisely so the colour and the arrow can disagree — a green
   * up-arrow beside the words "down 31%" is a small contradiction that costs a
   * reader their trust in every other line on the page.
   */
  it('calls a drop in spending good news, while still pointing down', () => {
    const out = whatChanged(stats({ spentMinor: 30_000 }, { spentMinor: 60_000 }), 30);
    const spend = out.find((c) => c.id === 'spend');
    expect(spend?.text).toMatch(/down 50%/);
    expect(spend?.tone).toBe('good');
    expect(spend?.direction).toBe('down');
  });

  it('calls a rise in spending bad news pointing up', () => {
    const spend = whatChanged(stats({ spentMinor: 90_000 }, { spentMinor: 30_000 }), 30).find(
      (c) => c.id === 'spend',
    );
    expect(spend?.tone).toBe('bad');
    expect(spend?.direction).toBe('up');
  });

  /**
   * Ranking on magnitude alone put "you spent 31% less" above "you kept a habit
   * on 93% of days", because percentages on money are simply bigger numbers.
   */
  it('ranks what Atlas uniquely knows above what a bank app would tell you', () => {
    const days = Array.from({ length: 30 }, () => day({ habitChecks: 1 }));
    const out = whatChanged(
      stats({ spentMinor: 30_000 }, { spentMinor: 60_000 }, days),
      30,
    );
    const habits = out.findIndex((c) => c.id === 'habits');
    const spend = out.findIndex((c) => c.id === 'spend');
    expect(habits).toBeLessThan(spend);
  });

  it('reports habit consistency as a share of days, with the best run', () => {
    const days = [1, 1, 1, 0, 1].map((n) => day({ habitChecks: n }));
    expect(text(stats({}, {}, days))).toMatch(/80% of days.*longest run was 3 days/);
  });

  /** A wall of sentences is the same failure as a wall of charts. */
  it('shows at most five', () => {
    const days = Array.from({ length: 30 }, () => day({ habitChecks: 1 }));
    const out = whatChanged(
      stats(
        { tasksCompleted: 200, workouts: 20, moodAvg: 4.5, spentMinor: 90_000 },
        { tasksCompleted: 50, workouts: 5, moodAvg: 3.0, spentMinor: 20_000 },
        days,
      ),
      30,
    );
    expect(out.length).toBeLessThanOrEqual(5);
  });

  it('says nothing at all for an empty account', () => {
    expect(whatChanged(stats({}, {}, []), 30)).toEqual([]);
  });
});
