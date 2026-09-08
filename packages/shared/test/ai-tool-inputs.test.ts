import { describe, expect, it } from 'vitest';
import { normalizeAiEventInput, pickUndoFields, deleteToolUndo, patchToolUndo, recreateToolUndo } from '../src/ai-tool-inputs.js';
import { DailyTokenCapError, startOfUtcDayAt } from '../src/ai-budget.js';

describe('AI input and undo calculations', () => {
  it('defaults an event to one hour and strips unrelated model fields', () => {
    const result = normalizeAiEventInput({ title: 'Synthetic event', startAt: '2026-09-01T12:00:00Z', userId: 'not-a-routing-input' });
    expect({ start: result.startAt.toISOString(), end: result.endAt.toISOString(), allDay: result.allDay, hasOwner: 'userId' in result })
      .toEqual({ start: '2026-09-01T12:00:00.000Z', end: '2026-09-01T13:00:00.000Z', allDay: false, hasOwner: false });
  });

  it('keeps an explicit valid end and falls back to duration for an invalid interval', () => {
    const input = { title: 'Synthetic event', startAt: '2026-09-01T12:00:00Z', durationMinutes: 15 };
    expect(normalizeAiEventInput({ ...input, endAt: '2026-09-01T14:00:00Z' }).endAt.toISOString())
      .toEqual('2026-09-01T14:00:00.000Z');
    expect(normalizeAiEventInput({ ...input, endAt: '2026-09-01T11:00:00Z' }).endAt.toISOString())
      .toEqual('2026-09-01T12:15:00.000Z');
  });

  it('selects only touched undo fields and preserves falsy values', () => {
    expect(pickUndoFields({ title: '', count: 0, enabled: false, dueAt: new Date('2026-09-01T12:00:00Z'), untouched: 'keep' }, ['title', 'count', 'enabled', 'dueAt', 'missing']))
      .toEqual({ title: '', count: 0, enabled: false, dueAt: '2026-09-01T12:00:00.000Z', missing: null });
  });

  it('constructs the existing inverse request shapes', () => {
    expect(deleteToolUndo('/tasks/synthetic', 'Remove')).toEqual({ label: 'Remove', method: 'DELETE', path: '/tasks/synthetic', body: null });
    expect(patchToolUndo('/tasks/synthetic', 'Restore', { title: 'Before' })).toEqual({ label: 'Restore', method: 'PATCH', path: '/tasks/synthetic', body: { title: 'Before' } });
    expect(recreateToolUndo('/tasks', 'Recreate', { title: 'Before' })).toEqual({ label: 'Recreate', method: 'POST', path: '/tasks', body: { title: 'Before' } });
  });

  it('anchors budget days to UTC without mutating the reference clock', () => {
    const now = new Date('2026-09-01T23:30:00-04:00');
    expect(startOfUtcDayAt(now).toISOString()).toEqual('2026-09-02T00:00:00.000Z');
    expect(now.toISOString()).toEqual('2026-09-02T03:30:00.000Z');
  });

  it('preserves typed cap errors and distinct remedies', () => {
    const error = new DailyTokenCapError(10, 10);
    expect({ name: error.name, scope: error.scope, used: error.usedToday, cap: error.cap })
      .toEqual({ name: 'DailyTokenCapError', scope: 'user', used: 10, cap: 10 });
    expect(error.message).toEqual('You have used your AI for today (10/10 tokens). It resets at midnight UTC.');
    expect(new DailyTokenCapError(10, 10, 'disabled').message)
      .toEqual('Atlas AI is turned off on this server. Nothing was sent and nothing was charged.');
  });
});
