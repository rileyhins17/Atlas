import { describe, expect, it } from 'vitest';
import type { EventDTO, TaskDTO, TimelineEventDTO } from '@atlas/shared';
import { feedRowHref, groupFeedByDay, openTaskRef } from '@/lib/stream';

// Local-time constructors keep day boundaries stable in any test timezone.
const now = new Date(2026, 6, 15, 12, 0); // Wed Jul 15 2026, noon local

function event(over: Partial<EventDTO> & { startAt: string; endAt: string }): EventDTO {
  return {
    id: over.id ?? `e${Math.random()}`,
    title: over.title ?? 'Event',
    description: null,
    location: over.location ?? null,
    allDay: over.allDay ?? false,
    source: 'atlas',
    createdAt: now.toISOString(),
    ...over,
  } as EventDTO;
}

function task(over: Partial<TaskDTO>): TaskDTO {
  return {
    id: over.id ?? `t${Math.random()}`,
    title: over.title ?? 'Task',
    notes: null,
    status: 'OPEN',
    priority: 'NONE',
    dueAt: null,
    completedAt: null,
    tags: [],
    goalId: null,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    ...over,
  } as TaskDTO;
}

function row(over: Partial<TimelineEventDTO>): TimelineEventDTO {
  return {
    id: over.id ?? `r${Math.random()}`,
    type: over.type ?? 'task.created',
    source: over.source ?? 'tasks',
    title: over.title ?? 'Row',
    summary: null,
    refType: over.refType ?? null,
    refId: over.refId ?? null,
    occurredAt: over.occurredAt ?? now.toISOString(),
    ...over,
  };
}

const at = (h: number, m = 0, dayOffset = 0) =>
  new Date(2026, 6, 15 + dayOffset, h, m).toISOString();



describe('groupFeedByDay', () => {
  it('groups newest-first rows by local day, preserving order', () => {
    const groups = groupFeedByDay([
      row({ id: 'a', occurredAt: at(11) }),
      row({ id: 'b', occurredAt: at(9) }),
      row({ id: 'c', occurredAt: at(22, 0, -1) }),
    ]);
    expect(groups.length).toBe(2);
    expect(groups[0]![1].map((r) => r.id)).toEqual(['a', 'b']);
    expect(groups[1]![1].map((r) => r.id)).toEqual(['c']);
  });
});

describe('openTaskRef', () => {
  const open = task({ id: 'task1', title: 'Open task' });
  it('returns the open task behind a task.created row', () => {
    expect(openTaskRef(row({ type: 'task.created', refType: 'task', refId: 'task1' }), [open]))
      .toEqual(open);
  });
  it('ignores completed rows, done tasks, and non-task rows', () => {
    expect(openTaskRef(row({ type: 'task.completed', refType: 'task', refId: 'task1' }), [open]))
      .toBeNull();
    expect(
      openTaskRef(row({ type: 'task.created', refType: 'task', refId: 'task1' }), [
        { ...open, status: 'DONE' } as TaskDTO,
      ]),
    ).toBeNull();
    expect(openTaskRef(row({ type: 'journal.created', refType: 'journal', refId: 'j1' }), [open]))
      .toBeNull();
  });
});

describe('feedRowHref', () => {
  it('maps ref types to domain pages', () => {
    expect(feedRowHref(row({ refType: 'task' }))).toBe('/tasks');
    expect(feedRowHref(row({ refType: 'transaction' }))).toBe('/finance');
    expect(feedRowHref(row({ refType: null }))).toBeNull();
  });
});
