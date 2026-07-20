import { describe, expect, it } from 'vitest';
import type { EventDTO, TaskDTO, TimelineEventDTO } from '@atlas/shared';
import { buildUpNext, feedRowHref, groupFeedByDay, openTaskRef, upNextGlance } from '@/lib/stream';

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

describe('buildUpNext', () => {
  it('keeps only what is still ahead today, chronological, all-day first', () => {
    const upNext = buildUpNext(
      [
        event({ id: 'past', title: 'Morning standup', startAt: at(9), endAt: at(9, 30) }),
        event({ id: 'later', title: 'Dentist', startAt: at(15), endAt: at(16) }),
        event({ id: 'soon', title: 'Lunch', startAt: at(12, 30), endAt: at(13) }),
        event({ id: 'allday', title: 'Trip', startAt: at(0), endAt: at(23, 59), allDay: true }),
      ],
      [task({ id: 'td', title: 'Ship it', dueAt: at(17) })],
      now,
    );
    expect(upNext.today.map((i) => i.title)).toEqual(['Trip', 'Lunch', 'Dentist', 'Ship it']);
    expect(upNext.overdue).toEqual([]);
  });

  it('buckets past-day undone tasks as overdue; done/undated tasks never appear', () => {
    const upNext = buildUpNext(
      [],
      [
        task({ id: 'o1', title: 'Old thing', dueAt: at(10, 0, -3) }),
        task({ id: 'done', title: 'Done thing', dueAt: at(10, 0, -1), status: 'DONE' }),
        task({ id: 'nodate', title: 'Someday' }),
      ],
      now,
    );
    expect(upNext.overdue.map((i) => i.title)).toEqual(['Old thing']);
    expect(upNext.today).toEqual([]);
  });

  it('a task due earlier TODAY stays in today, not overdue', () => {
    const upNext = buildUpNext([], [task({ id: 'am', title: 'This morning', dueAt: at(8) })], now);
    expect(upNext.overdue).toEqual([]);
    expect(upNext.today.map((i) => i.title)).toEqual(['This morning']);
  });

  it('counts tomorrow instead of listing it, and caps today', () => {
    const manyToday = Array.from({ length: 12 }, (_, i) =>
      task({ id: `t${i}`, title: `T${i}`, dueAt: at(13 + (i % 8), i) }),
    );
    const upNext = buildUpNext(
      [event({ id: 'tm', title: 'Tomorrow evt', startAt: at(9, 0, 1), endAt: at(10, 0, 1) })],
      [...manyToday, task({ id: 'tmt', title: 'Tomorrow task', dueAt: at(9, 0, 1) })],
      now,
    );
    expect(upNext.today.length).toBe(8);
    expect(upNext.tomorrowCount).toBe(2);
  });
});

describe('upNextGlance', () => {
  it('surfaces overdue count, the single next thing, and tomorrow count', () => {
    const glance = upNextGlance(
      buildUpNext(
        [event({ id: 'soon', title: 'Lunch', startAt: at(12, 30), endAt: at(13) })],
        [
          task({ id: 'o1', title: 'Old thing', dueAt: at(10, 0, -3) }),
          task({ id: 'tm', title: 'Tomorrow task', dueAt: at(9, 0, 1) }),
        ],
        now,
      ),
    );
    expect(glance.overdueCount).toBe(1);
    expect(glance.next?.title).toBe('Lunch');
    expect(glance.tomorrowCount).toBe(1);
  });

  it('reports no next thing when the day is clear', () => {
    const glance = upNextGlance(buildUpNext([], [], now));
    expect(glance.overdueCount).toBe(0);
    expect(glance.next).toBeNull();
    expect(glance.tomorrowCount).toBe(0);
  });
});

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
