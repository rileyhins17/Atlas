import { describe, expect, it } from 'vitest';
import {
  assembleTimelinePage, buildAiEventPatch, googleEventDiffers, googleEventRow,
  pairTemplateExercises, proposeWorkoutTemplates, parseSplitText, selectSyncCalendars,
} from '../src/index.js';

describe('domain policies independent of runtime adapters', () => {
  it('retains primary calendar selection, excludes free/busy readers, and applies the ceiling', () => {
    const calendars = [
      { id: 'busy', summary: 'Busy', accessRole: 'freeBusyReader' },
      { id: 'work', summary: 'Work' },
      { id: 'owner', summary: 'Owner', primary: true, selected: false },
    ];
    expect(selectSyncCalendars(calendars, ['busy', 'work'], 1)).toEqual([{ id: 'owner', primary: true }]);
    expect(selectSyncCalendars(calendars, null, 25)).toEqual([
      { id: 'owner', primary: true }, { id: 'work', primary: false },
    ]);
  });

  it('rejects unusable remote intervals and preserves primary calendar identity', () => {
    const calendar = { id: 'owner', primary: true };
    expect(googleEventRow({ id: 'missing' }, calendar)).toBeNull();
    expect(googleEventRow({ id: 'backwards', start: { date: '2026-07-02' }, end: { date: '2026-07-01' } }, calendar)).toBeNull();
    const row = googleEventRow({ id: 'valid', summary: '  ', start: { date: '2026-07-01' }, end: { date: '2026-07-02' } }, calendar)!;
    expect(row).toMatchObject({ title: '(untitled)', allDay: true, sourceCalendarId: null });
    expect(googleEventDiffers(row, { ...row, startAt: new Date(row.startAt) })).toBe(false);
    expect(googleEventDiffers(row, { ...row, sourceCalendarId: 'work' })).toBe(true);
  });

  it('keeps exercise and superset positions paired while removing duplicates', () => {
    expect(pairTemplateExercises(['a', 'a', 'b'], [2, 8, 2])).toEqual([
      { exerciseId: 'a', supersetGroup: 2 }, { exerciseId: 'b', supersetGroup: 2 },
    ]);
    expect(pairTemplateExercises(['a'], undefined)).toEqual([{ exerciseId: 'a', supersetGroup: null }]);
  });

  it('proposes local catalog matches and retains unknown movements without an AI provider', () => {
    const result = proposeWorkoutTemplates(parseSplitText('Push: Bench Press, invented movement'), [{ id: 'bench', name: 'Bench Press' }]);
    expect(result[0]!.exercises[0]).toMatchObject({ exerciseId: 'bench', name: 'Bench Press' });
    expect(result[0]!.exercises[1]).toEqual({ exerciseId: null, name: 'invented movement', match: 'new' });
  });

  it('moves an event without changing its length and honors explicit end over duration', () => {
    const before = { startAt: new Date('2026-07-01T10:00Z'), endAt: new Date('2026-07-01T11:30Z') };
    const startAt = new Date('2026-07-02T12:00Z');
    expect(buildAiEventPatch({ id: 'event', startAt }, before).endAt.toISOString()).toBe('2026-07-02T13:30:00.000Z');
    const endAt = new Date('2026-07-02T14:00Z');
    expect(buildAiEventPatch({ id: 'event', startAt, endAt, durationMinutes: 15 }, before).endAt).toBe(endAt);
  });

  it('omits the overfetched timeline row and private persistence fields', () => {
    const row = { id: 'one', type: 'task.created', source: 'tasks', title: 'Synthetic task', summary: null,
      refType: 'task', refId: 'task-one', occurredAt: new Date('2026-07-01T10:00Z'), userId: 'private-owner' };
    const page = assembleTimelinePage([row, { ...row, id: 'two' }], 1);
    expect(page.hasMore).toBe(true);
    expect(page.events).toHaveLength(1);
    expect(page.events[0]).not.toHaveProperty('userId');
    expect(page.events[0]!.occurredAt).toBe('2026-07-01T10:00:00.000Z');
    expect(assembleTimelinePage([], 1)).toEqual({ events: [], hasMore: false });
  });
});
