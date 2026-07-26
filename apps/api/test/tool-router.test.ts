import { describe, expect, it, vi } from 'vitest';
import { ToolRouterService } from '../src/modules/ai/tool-router.service.js';

function makeRouter() {
  // `owned` is how the router captures the "before" state an undo needs.
  const tasks = {
    create: vi.fn().mockResolvedValue({ id: 'task_1', title: 'Buy milk' }),
    complete: vi.fn().mockResolvedValue({ id: 'task_1', title: 'Buy milk', status: 'DONE' }),
    update: vi.fn().mockResolvedValue({ id: 'task_1', title: 'Renamed' }),
    remove: vi.fn().mockResolvedValue({ ok: true }),
    owned: vi.fn().mockResolvedValue({
      id: 'task_1',
      title: 'Buy milk',
      status: 'TODO',
      priority: 'MEDIUM',
      notes: null,
      dueAt: null,
    }),
  };
  const habits = {
    log: vi.fn().mockResolvedValue({ id: 'habit_1', name: 'Meditate' }),
    create: vi.fn().mockResolvedValue({ id: 'habit_1', name: 'Meditate' }),
  };
  const journal = { create: vi.fn().mockResolvedValue({ id: 'journal_1' }) };
  const notes = {
    create: vi.fn().mockResolvedValue({ id: 'note_1', title: null }),
    update: vi.fn().mockResolvedValue({ id: 'note_1', title: null }),
    owned: vi.fn().mockResolvedValue({ id: 'note_1', title: null, body: 'old' }),
  };
  const calendar = {
    create: vi.fn().mockResolvedValue({ id: 'event_1', title: 'Standup' }),
    update: vi.fn().mockResolvedValue({ id: 'event_1', title: 'Standup' }),
    remove: vi.fn().mockResolvedValue({ ok: true }),
    owned: vi.fn().mockResolvedValue({
      id: 'event_1',
      title: 'Standup',
      startAt: new Date('2026-08-01T09:00:00Z'),
      endAt: new Date('2026-08-01T09:30:00Z'),
      location: null,
    }),
  };
  const routine = {
    addBlock: vi.fn().mockResolvedValue({ id: 'block_1', label: 'Work' }),
    list: vi.fn().mockResolvedValue([]),
    removeBlock: vi.fn().mockResolvedValue({ ok: true }),
  };
  const goals = {
    create: vi.fn().mockResolvedValue({ id: 'goal_1', title: 'Run a half', horizon: 'short' }),
    update: vi.fn().mockResolvedValue({ id: 'goal_1', title: 'Run a half' }),
    remove: vi.fn().mockResolvedValue({ ok: true }),
    owned: vi.fn().mockResolvedValue({
      id: 'goal_1',
      title: 'Run a half',
      description: null,
      horizon: 'short',
      status: 'active',
      targetDate: null,
    }),
  };
  const fitness = { start: vi.fn().mockResolvedValue({ id: 'workout_1' }) };
  const memory = { askUser: vi.fn().mockResolvedValue(undefined) };
  /* eslint-disable @typescript-eslint/no-explicit-any -- hand-rolled service doubles */
  const router = new ToolRouterService(
    tasks as any,
    habits as any,
    journal as any,
    notes as any,
    calendar as any,
    fitness as any,
    routine as any,
    goals as any,
    memory as any,
  );
  /* eslint-enable @typescript-eslint/no-explicit-any */
  return { router, tasks, habits, journal, notes, calendar, fitness, routine, goals, memory };
}

describe('ToolRouterService', () => {
  it('routes tasks.create with validated args', async () => {
    const { router, tasks } = makeRouter();
    await router.execute('user-1', 'tasks.create', { title: 'Buy milk' });
    expect(tasks.create).toHaveBeenCalledWith('user-1', expect.objectContaining({ title: 'Buy milk' }));
  });

  it('rejects tasks.create with missing required title', async () => {
    const { router } = makeRouter();
    await expect(router.execute('user-1', 'tasks.create', {})).rejects.toThrow();
  });

  it('routes tasks.complete by id', async () => {
    const { router, tasks } = makeRouter();
    await router.execute('user-1', 'tasks.complete', { id: 'task_1' });
    expect(tasks.complete).toHaveBeenCalledWith('user-1', 'task_1');
  });

  it('routes habits.log, splitting id from the log payload', async () => {
    const { router, habits } = makeRouter();
    await router.execute('user-1', 'habits.log', { id: 'habit_1', value: 2 });
    expect(habits.log).toHaveBeenCalledWith('user-1', 'habit_1', expect.objectContaining({ value: 2 }));
  });

  it('routes journal.add', async () => {
    const { router, journal } = makeRouter();
    await router.execute('user-1', 'journal.add', { body: 'Feeling good today', mood: 4 });
    expect(journal.create).toHaveBeenCalledWith('user-1', expect.objectContaining({ body: 'Feeling good today', mood: 4 }));
  });

  it('routes notes.remember', async () => {
    const { router, notes } = makeRouter();
    await router.execute('user-1', 'notes.remember', { body: 'Sarah is my sister', pinned: true });
    expect(notes.create).toHaveBeenCalledWith('user-1', expect.objectContaining({ body: 'Sarah is my sister', pinned: true }));
  });

  it('routes calendar.add', async () => {
    const { router, calendar } = makeRouter();
    await router.execute('user-1', 'calendar.add', {
      title: 'Dentist',
      startAt: '2026-08-01T10:00:00.000Z',
      endAt: '2026-08-01T11:00:00.000Z',
    });
    expect(calendar.create).toHaveBeenCalledWith('user-1', expect.objectContaining({ title: 'Dentist' }));
  });

  it('routes ai.ask_question to MemoryService.askUser', async () => {
    const { router, memory } = makeRouter();
    const result = await router.execute('user-1', 'ai.ask_question', { question: 'How are you feeling this week?' });
    expect(memory.askUser).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', question: 'How are you feeling this week?' }),
    );
    expect(result).toEqual({ result: { ok: true }, summary: null, undo: null });
  });

  it('routes fitness.start_workout, defaulting a missing argument object', async () => {
    const { router, fitness } = makeRouter();
    await router.execute('user-1', 'fitness.start_workout', { title: 'Push day' });
    expect(fitness.start).toHaveBeenCalledWith('user-1', { title: 'Push day' });

    // The model often calls a no-argument tool with null/undefined rather than
    // {}, which would otherwise blow up in zod before reaching the service.
    await router.execute('user-1', 'fitness.start_workout', undefined);
    expect(fitness.start).toHaveBeenLastCalledWith('user-1', {});
  });

  it('throws on an unknown tool name', async () => {
    const { router } = makeRouter();
    await expect(router.execute('user-1', 'unknown.tool', {})).rejects.toThrow('Unknown tool: unknown.tool');
  });
});

describe('ToolRouterService undo', () => {
  it('pairs a create with a delete', async () => {
    const { router } = makeRouter();
    const out = await router.execute('user-1', 'tasks.create', { title: 'Buy milk' });
    expect(out.undo).toEqual({
      label: 'Remove "Buy milk"',
      method: 'DELETE',
      path: '/tasks/task_1',
      body: null,
    });
    expect(out.summary).toBe('Added task "Buy milk"');
  });

  it('pairs a delete with a recreate carrying the row back', async () => {
    const { router } = makeRouter();
    const out = await router.execute('user-1', 'tasks.delete', { id: 'task_1' });
    expect(out.undo?.method).toBe('POST');
    expect(out.undo?.path).toBe('/tasks');
    expect(out.undo?.body).toMatchObject({ title: 'Buy milk', priority: 'MEDIUM' });
  });

  it('restores only the fields an update touched', async () => {
    const { router } = makeRouter();
    const out = await router.execute('user-1', 'tasks.update', { id: 'task_1', title: 'Renamed' });
    // Not the whole row: a field someone edited by hand in between must survive.
    expect(out.undo?.method).toBe('PATCH');
    expect(out.undo?.body).toEqual({ title: 'Buy milk' });
  });

  it('reopens a task completed by mistake', async () => {
    const { router } = makeRouter();
    const out = await router.execute('user-1', 'tasks.complete', { id: 'task_1' });
    expect(out.undo?.body).toEqual({ status: 'TODO' });
  });

  it('puts a deleted event back where it was', async () => {
    const { router } = makeRouter();
    const out = await router.execute('user-1', 'calendar.delete', { id: 'event_1' });
    expect(out.undo?.body).toMatchObject({
      title: 'Standup',
      startAt: '2026-08-01T09:00:00.000Z',
    });
  });

  it('keeps an event its original length when only the start moves', async () => {
    const { router, calendar } = makeRouter();
    await router.execute('user-1', 'calendar.update', {
      id: 'event_1',
      startAt: '2026-08-01T10:00:00Z',
    });
    const patch = calendar.update.mock.calls[0]![2];
    // 30-minute event moved by an hour is still 30 minutes.
    expect(patch.endAt.toISOString()).toBe('2026-08-01T10:30:00.000Z');
  });

  it('offers no undo for actions that genuinely cannot be reversed', async () => {
    const { router } = makeRouter();
    // A habit check-in has no delete endpoint; claiming otherwise would give
    // the user an Undo button that fails.
    const log = await router.execute('user-1', 'habits.log', { id: 'habit_1' });
    expect(log.undo).toBeNull();
    const entry = await router.execute('user-1', 'journal.add', { body: 'a good day' });
    expect(entry.undo).toBeNull();
  });

  it('lets the AI set the working week, which drives free-time maths', async () => {
    const { router, routine } = makeRouter();
    const out = await router.execute('user-1', 'routine.add_block', {
      label: 'Work',
      days: 31,
      startMin: 540,
      endMin: 1020,
    });
    expect(routine.addBlock).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ label: 'Work', days: 31, startMin: 540, endMin: 1020 }),
    );
    expect(out.undo?.path).toBe('/routine/blocks/block_1');
  });
});

describe('ToolRouterService goals', () => {
  it('creates a goal with its horizon and offers a delete undo', async () => {
    const { router, goals } = makeRouter();
    const out = await router.execute('user-1', 'goals.create', {
      title: 'Run a half',
      horizon: 'short',
    });
    expect(goals.create).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ title: 'Run a half', horizon: 'short' }),
    );
    expect(out.summary).toBe('Added short-term goal "Run a half"');
    expect(out.undo?.path).toBe('/goals/goal_1');
  });

  it('says so plainly when a goal is achieved', async () => {
    const { router } = makeRouter();
    const out = await router.execute('user-1', 'goals.update', {
      id: 'goal_1',
      status: 'achieved',
    });
    expect(out.summary).toBe('Marked "Run a half" achieved');
    expect(out.undo?.body).toEqual({ status: 'active' });
  });

  it('restores a deleted goal with its horizon intact', async () => {
    const { router } = makeRouter();
    const out = await router.execute('user-1', 'goals.delete', { id: 'goal_1' });
    expect(out.undo?.method).toBe('POST');
    expect(out.undo?.body).toMatchObject({ title: 'Run a half', horizon: 'short' });
  });
});
