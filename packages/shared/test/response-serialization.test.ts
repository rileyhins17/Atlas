import { describe, expect, it } from 'vitest';
import {
  serializeAccount, serializeAiQuestion, serializeEvent, serializeGoal, serializeInsight,
  serializeJournal, serializeNote, serializeRoutineBlock, serializeTask, serializeTransaction,
} from '../src/response-serialization.js';

const iso = '2026-11-01T06:30:00.000Z';
const date = new Date(iso);
const internal = { userId: 'synthetic-owner', internalCredential: 'synthetic-only' };

describe('explicit response serialization', () => {
  it('preserves task dates and nulls without leaking internal fields', () => {
    const fields = {
      id: 'task', title: 'Synthetic task', notes: null, status: 'TODO' as const,
      priority: 'MEDIUM' as const, tags: ['example'], goalId: null,
      recurrence: null, recurrenceParentId: null,
    };
    expect(serializeTask({ ...internal, ...fields, dueAt: date, completedAt: null, createdAt: date, updatedAt: date }))
      .toEqual({ ...fields, dueAt: iso, completedAt: null, createdAt: iso, updatedAt: iso });
  });

  it('converts signed bigint minor units without changing the amount', () => {
    const account = { id: 'account', name: 'Synthetic cash', type: 'cash', currency: 'CAD', mask: null, institution: null, source: 'manual' };
    const transaction = { id: 'transaction', accountId: 'account', currency: 'CAD', description: 'Synthetic purchase', category: null, merchantName: null, pending: false, source: 'manual' };
    expect(serializeAccount({ ...internal, ...account, balanceMinor: 12345n, createdAt: date }))
      .toEqual({ ...account, balanceMinor: 12345, createdAt: iso });
    expect(serializeTransaction({ ...internal, ...transaction, amountMinor: -1599n, postedAt: date, createdAt: date }))
      .toEqual({ ...transaction, amountMinor: -1599, postedAt: iso, createdAt: iso });
  });

  it('serializes stored events without inventing occurrence metadata', () => {
    const fields = { id: 'event', title: 'Synthetic event', description: null, location: null, allDay: false, source: 'manual', recurrence: null, taskId: null };
    expect(serializeEvent({ ...internal, ...fields, startAt: date, endAt: date, createdAt: date }))
      .toEqual({ ...fields, startAt: iso, endAt: iso, createdAt: iso });
  });

  it('preserves journal and note content without internal metadata', () => {
    const journal = { id: 'journal', body: 'Synthetic journal\nsecond line', mood: null, tags: ['test'] };
    const note = { id: 'note', title: null, body: 'Synthetic note', tags: [], pinned: true };
    expect(serializeJournal({ ...internal, ...journal, entryDate: date, createdAt: date }))
      .toEqual({ ...journal, entryDate: iso, createdAt: iso });
    expect(serializeNote({ ...internal, ...note, createdAt: date, updatedAt: date }))
      .toEqual({ ...note, createdAt: iso, updatedAt: iso });
  });

  it('retains goal fallback values and explicit completed counts', () => {
    const fields = { id: 'goal', title: 'Synthetic goal', description: null, position: 0 };
    expect(serializeGoal({ ...internal, ...fields, horizon: 'legacy', status: 'unknown', targetDate: null, createdAt: date }))
      .toEqual({ ...fields, horizon: 'short', status: 'active', targetDate: null, createdAt: iso, taskCount: 0, doneTaskCount: 0 });
    expect(serializeGoal({ ...fields, horizon: 'long', status: 'achieved', targetDate: date, createdAt: date, _count: { tasks: 3 } }, 2))
      .toEqual({ ...fields, horizon: 'long', status: 'achieved', targetDate: iso, createdAt: iso, taskCount: 3, doneTaskCount: 2 });
  });

  it('retains routine masks and overnight minutes', () => {
    const fields = { id: 'routine', label: 'Synthetic sleep', kind: 'sleep', days: 127, onDate: null, startMin: 1380, endMin: 420 };
    expect(serializeRoutineBlock({ ...internal, ...fields })).toEqual(fields);
  });

  it('serializes AI questions and insights with explicit public fields', () => {
    const question = { id: 'question', question: 'Synthetic question?', rationale: null, relatesTo: null, status: 'OPEN' as const };
    const insight = { id: 'insight', kind: 'test', title: 'Synthetic insight', body: 'Synthetic body' };
    expect(serializeAiQuestion({ ...internal, ...question, createdAt: date })).toEqual({ ...question, createdAt: iso });
    expect(serializeInsight({ ...internal, ...insight, createdAt: date })).toEqual({ ...insight, createdAt: iso });
  });
});
