import { describe, expect, it, vi } from 'vitest';
import { ToolRouterService } from '../src/modules/ai/tool-router.service.js';

function makeRouter() {
  const tasks = { create: vi.fn().mockResolvedValue({ id: 'task_1' }), complete: vi.fn().mockResolvedValue({ id: 'task_1', status: 'DONE' }) };
  const habits = { log: vi.fn().mockResolvedValue({ id: 'habit_1' }) };
  const journal = { create: vi.fn().mockResolvedValue({ id: 'journal_1' }) };
  const notes = { create: vi.fn().mockResolvedValue({ id: 'note_1' }) };
  const calendar = { create: vi.fn().mockResolvedValue({ id: 'event_1' }) };
  const memory = { askUser: vi.fn().mockResolvedValue(undefined) };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const router = new ToolRouterService(tasks as any, habits as any, journal as any, notes as any, calendar as any, memory as any);
  return { router, tasks, habits, journal, notes, calendar, memory };
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
    expect(result).toEqual({ ok: true });
  });

  it('throws on an unknown tool name', async () => {
    const { router } = makeRouter();
    await expect(router.execute('user-1', 'unknown.tool', {})).rejects.toThrow('Unknown tool: unknown.tool');
  });
});
