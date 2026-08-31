import { describe, expect, it } from 'vitest';
import { GROUPS_WORTH_ADDING_TO } from '@/components/panels/TasksPanel';
import { quickAddDueDate } from '@/lib/tasks-filter';

/**
 * There were six ways to add a task on one phone screen — the composer at the
 * top, one per date group, and the capture dock. Two of them were not choices,
 * they were duplicates, and duplicated affordances are the specific thing that
 * makes software feel built for its author rather than sold to a stranger.
 *
 * This locks in WHICH ones went, because the reasoning is not "fewer buttons is
 * tidier". Each removed control did exactly what another control already did;
 * each remaining one sets a due date nothing else on the screen sets.
 *
 * Deliberately pure. The decision is a set and a date function, and rendering
 * the panel to re-discover that would test React, not the choice.
 */

const ALL_GROUPS = ['overdue', 'today', 'week', 'later', 'someday'];
const now = new Date('2026-08-31T12:00:00Z');

describe('one job, one way: adding a task', () => {
  it('keeps an adder only where it sets a date nothing else sets', () => {
    expect([...GROUPS_WORTH_ADDING_TO].sort()).toEqual(['later', 'today', 'week']);
  });

  /**
   * The reason "Add to overdue" went, as an assertion rather than a comment: it
   * read as though it back-dated something and did not — it produced the end of
   * today, exactly like the control directly beneath it.
   */
  it('drops overdue, whose date was identical to today', () => {
    expect(quickAddDueDate('overdue', now)?.toISOString()).toBe(
      quickAddDueDate('today', now)?.toISOString(),
    );
    expect(GROUPS_WORTH_ADDING_TO.has('overdue')).toBe(false);
  });

  /** "Add to no date" created a task with no due date. So does the composer. */
  it('drops the no-date group, which the always-visible composer already covers', () => {
    expect(quickAddDueDate('someday', now)).toBeNull();
    expect(GROUPS_WORTH_ADDING_TO.has('someday')).toBe(false);
  });

  it('every kept group really does produce a distinct due date', () => {
    const kept = [...GROUPS_WORTH_ADDING_TO];
    const dates = kept.map((g) => quickAddDueDate(g, now)?.toISOString());
    expect(dates.every((d) => typeof d === 'string')).toBe(true);
    // No two shortcuts may land on the same day, or one of them is the next
    // duplicate waiting to be found.
    expect(new Set(dates).size).toBe(kept.length);
  });

  it('never drops a group that has no equivalent elsewhere', () => {
    // A guard against over-trimming: anything with a unique date must stay.
    for (const g of ALL_GROUPS) {
      const date = quickAddDueDate(g, now)?.toISOString();
      const isDuplicate =
        date === null ||
        date === undefined ||
        date === quickAddDueDate('today', now)?.toISOString();
      if (!isDuplicate) expect(GROUPS_WORTH_ADDING_TO.has(g)).toBe(true);
    }
  });
});
