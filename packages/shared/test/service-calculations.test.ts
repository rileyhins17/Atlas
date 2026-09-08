import { describe, expect, it } from 'vitest';
import {
  chunkItems, expandEventSeries, exportJson, indentJson, isValidTimezone, journalSnippet,
  noteEmbeddingText, routineClockLabel, serializeSettings, serviceErrorText,
  shiftCalendarDayKey, tagStatsRows, truncateNotification, workoutTemplateTitleCase,
} from '../src/service-calculations.js';

describe('service calculations without database or framework dependencies', () => {
  it('preserves settings fallback and timezone acceptance', () => {
    const settings = { displayName: null, timezone: 'America/Toronto', briefHour: 8, proactiveEnabled: true };
    expect(serializeSettings({ ...settings, weightUnit: 'legacy' })).toEqual({ ...settings, weightUnit: 'lb' });
    expect(serializeSettings({ ...settings, weightUnit: 'kg' })).toEqual({ ...settings, weightUnit: 'kg' });
    expect(isValidTimezone('America/Toronto')).toEqual(true);
    expect(isValidTimezone('Invalid/Place')).toEqual(false);
  });

  it('retains distinct journal, embedding and notification wording', () => {
    expect(journalSnippet('  Synthetic\n\n journal   entry ', 10)).toEqual('Synthetic …');
    expect(noteEmbeddingText({ title: null, body: 'Synthetic body' })).toEqual('Synthetic body');
    expect(noteEmbeddingText({ title: 'Title', body: 'Body' })).toEqual('Title\nBody');
    expect(truncateNotification('Synthetic message', 11)).toEqual('Synthetic…');
    expect(serviceErrorText(new Error('Synthetic error'))).toEqual('Synthetic error');
    expect(serviceErrorText('untrusted object')).toEqual('unknown error');
  });

  it('steps date keys through month, year and DST boundaries', () => {
    expect(shiftCalendarDayKey('2026-03-08', 1)).toEqual('2026-03-09');
    expect(shiftCalendarDayKey('2026-12-31', 1)).toEqual('2027-01-01');
    expect(shiftCalendarDayKey('2024-03-01', -1)).toEqual('2024-02-29');
    expect(routineClockLabel(75)).toEqual('01:15');
  });

  it('preserves acronyms in workout template names', () => {
    expect(workoutTemplateTitleCase('  upper   DB press ')).toEqual('Upper DB Press');
  });

  it('serializes export bigints as strings and retains nested indentation', () => {
    expect(exportJson({ amountMinor: -1599n })).toEqual('{"amountMinor":"-1599"}');
    expect(indentJson('a\nb', 2)).toEqual('a\n    b');
  });

  it('chunks ordered values without dropping a remainder', () => {
    expect(chunkItems([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunkItems([], 2)).toEqual([]);
    expect(tagStatsRows('tasks', [{ day: '2026-09-01', value: 2 }]))
      .toEqual([{ metric: 'tasks', day: '2026-09-01', value: 2 }]);
  });

  it('projects later occurrences with stable synthetic ids and an exclusive window end', () => {
    const event = { id: 'root', title: 'Synthetic daily event', description: null, location: null, allDay: false, source: 'manual', recurrence: 'FREQ=DAILY', taskId: null, startAt: new Date('2026-09-01T12:00:00Z'), endAt: new Date('2026-09-01T13:00:00Z'), createdAt: new Date('2026-09-01T00:00:00Z') };
    const rows = expandEventSeries(event, new Date('2026-09-02T12:00:00Z'), new Date('2026-09-03T12:00:00Z'));
    expect(rows.map(({ id, startAt, endAt, isOccurrence }) => ({ id, startAt, endAt, isOccurrence })))
      .toEqual([{ id: `root@${Date.parse('2026-09-02T12:00:00Z')}`, startAt: '2026-09-02T12:00:00.000Z', endAt: '2026-09-02T13:00:00.000Z', isOccurrence: true }]);
  });
});
