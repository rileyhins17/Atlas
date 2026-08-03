import { describe, expect, it } from 'vitest';
import { computeAdoption, ratePercent, type ActivityRow, type SignupRow } from '../src/index.js';

const signup = (userId: string, day: string): SignupRow => ({ userId, day });
const act = (userId: string, day: string, source = 'tasks'): ActivityRow => ({ userId, day, source });

describe('adoption, derived from what Atlas already stores', () => {
  it('counts an account that never did anything as not activated', () => {
    const out = computeAdoption([signup('u1', '2026-07-01')], []);
    expect(out.totalUsers).toBe(1);
    expect(out.activated).toBe(0);
    expect(out.returnedNextDay).toBe(0);
  });

  it('does not count signup-day activity as coming back', () => {
    // Everyone pokes around on day one. Counting the tour as a return visit
    // would make retention look healthy for a product nobody reopens.
    const out = computeAdoption([signup('u1', '2026-07-01')], [act('u1', '2026-07-01')]);
    expect(out.activated).toBe(1);
    expect(out.returnedNextDay).toBe(0);
  });

  it('counts a later day as a return, and a week later separately', () => {
    const out = computeAdoption(
      [signup('u1', '2026-07-01'), signup('u2', '2026-07-01')],
      [act('u1', '2026-07-02'), act('u2', '2026-07-09')],
    );
    expect(out.returnedNextDay).toBe(2);
    expect(out.returnedAfterWeek).toBe(1);
  });

  it('measures the actual thesis: how many people use more than one domain', () => {
    const out = computeAdoption(
      [signup('u1', '2026-07-01'), signup('u2', '2026-07-01')],
      [
        act('u1', '2026-07-02', 'tasks'),
        act('u1', '2026-07-02', 'fitness'),
        act('u1', '2026-07-03', 'habits'),
        act('u1', '2026-07-03', 'journal'),
        act('u2', '2026-07-02', 'tasks'),
      ],
    );
    expect(out.usedTwoDomains).toBe(1);
    expect(out.usedFourDomains).toBe(1);
    expect(out.byDomain[0]).toEqual({ source: 'tasks', users: 2 });
  });

  it('ignores activity from an account that is no longer there', () => {
    // Purging test accounts leaves their timeline rows unmatched; counting them
    // would inflate every number against a smaller denominator.
    const out = computeAdoption([signup('u1', '2026-07-01')], [act('ghost', '2026-07-05')]);
    expect(out.activated).toBe(0);
    expect(out.byDomain).toEqual([]);
  });

  it('buckets signups into Monday-anchored weeks', () => {
    // 2026-07-01 is a Wednesday; its week starts on Monday the 29th of June.
    const out = computeAdoption(
      [signup('u1', '2026-07-01'), signup('u2', '2026-07-05'), signup('u3', '2026-07-06')],
      [],
    );
    expect(out.signupsByWeek).toEqual([
      { week: '2026-06-29', count: 2 },
      { week: '2026-07-06', count: 1 },
    ]);
  });
});

describe('refusing to report noise as a rate', () => {
  it('withholds a percentage until the denominator can carry one', () => {
    // "50% retention" from two users is a coin toss with a percent sign.
    expect(ratePercent(1, 2)).toBeNull();
    expect(ratePercent(3, 10)).toBe(30);
  });
});
