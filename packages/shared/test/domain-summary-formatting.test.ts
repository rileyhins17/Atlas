import { describe, expect, it } from 'vitest';
import { summarizeCalendar, summarizeFinance, summarizeFitness, summarizeGoals, summarizeHabits, summarizeJournal, summarizeNotes, summarizeRoutine, summarizeTasks, summarizeTrackers } from '../src/domain-summaries.js';

describe('domain summary formatting', () => {
  it.each([
    [() => summarizeCalendar([], 'UTC'), 'No upcoming events.'],
    [() => summarizeFinance([], []), 'No financial accounts connected.'],
    [() => summarizeFitness(null, [], 'UTC'), 'No workouts logged.'],
    [() => summarizeGoals([], 'UTC'), 'No goals set.'],
    [() => summarizeHabits([]), 'No habits tracked.'],
    [() => summarizeJournal([], 'UTC'), 'No journal entries yet.'],
    [() => summarizeNotes([], 0), 'No notes yet.'],
    [() => summarizeRoutine([]), 'No routine set. The user has not described their typical week.'],
    [() => summarizeTasks(0, [], 'UTC'), 'No open tasks.'],
    [() => summarizeTrackers([]), 'No personal trackers.'],
  ] as const)('retains empty-domain wording (%#)', (render, expected) => {
    expect(render()).toBe(expected);
  });

  it('keeps account ids and signed cash flow', () => {
    expect(summarizeFinance([{ id: 'account', name: 'Synthetic cash', type: 'cash', balanceMinor: 12345n, currency: 'CAD', institution: null, mask: null, source: 'manual', createdAt: new Date(0) }], [{ amountMinor: -1599n }, { amountMinor: 5000n }]))
      .toBe('Accounts (1):\n- [account] Synthetic cash: 123.45 CAD\nLast 7 days: out -15.99, in 50.00.');
  });

  it('retains local journal dates, ids, snippets and mood averaging', () => {
    const instant = new Date('2026-07-16T02:30:00Z');
    expect(summarizeJournal([{ id: 'journal', entryDate: instant, body: '  Synthetic\n entry ', mood: 4, tags: [], createdAt: instant }], 'America/Toronto'))
      .toBe('1 recent entr(ies). Avg mood: 4.0/5. Dates in America/Toronto:\n- [journal] 2026-07-15: "Synthetic entry"');
  });

  it('keeps the no-deadlines distinction for an account with tasks', () => {
    expect(summarizeTasks(2, [], 'America/Toronto'))
      .toBe('2 open task(s). Dates in America/Toronto. Next up:\n(none with due dates)');
    expect(summarizeNotes([], 3)).toBe('3 note(s), none pinned as key facts.');
  });

  it('keeps routine ids, weekday masks and overnight annotation', () => {
    expect(summarizeRoutine([{ id: 'routine', label: 'Synthetic sleep', kind: 'sleep', days: 31, onDate: null, startMin: 1380, endMin: 420 }]))
      .toBe("Typical week (the user's routine — use this to time suggestions):\n- [routine] Synthetic sleep: 23:00–07:00 MTWTF (overnight)");
  });
});
