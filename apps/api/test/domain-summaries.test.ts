import { describe, expect, it, vi } from 'vitest';
import { JournalService } from '../src/modules/journal/journal.service.js';
import { NotesService } from '../src/modules/notes/notes.service.js';
import { FitnessService } from '../src/modules/fitness/fitness.service.js';
import { TrackersService } from '../src/modules/trackers/trackers.service.js';
import { FinanceService } from '../src/modules/finance/finance.service.js';
import { TasksService } from '../src/modules/tasks/tasks.service.js';
import { GoalsService } from '../src/modules/goals/goals.service.js';

const timezone = { get: vi.fn(async () => 'America/Toronto') };
const instant = new Date('2026-07-16T02:30:00Z'); // July 15, 10:30pm for the user.

describe('AI summaries address records in the user’s local calendar', () => {
  it('includes every recent journal id and a local entry date', async () => {
    const findMany = vi.fn(async () => [
      { id: 'journal-one', entryDate: instant, body: 'A synthetic good day', mood: 4 },
      { id: 'journal-two', entryDate: instant, body: 'Another synthetic entry', mood: 3 },
    ]);
    const service = new JournalService({ client: { journalEntry: { findMany } } } as never, {} as never, {} as never, timezone as never);
    const text = await service.summarize('owner');
    expect(text).toContain('[journal-one]');
    expect(text).toContain('[journal-two]');
    expect(text).toContain('2026-07-15');
    expect(text).not.toContain('2026-07-16');
  });

  it('identifies pinned notes so the model can update the fact it was told', async () => {
    const service = new NotesService({ client: { note: {
      findMany: async () => [{ id: 'note-one', title: 'Preference', body: 'Synthetic preference' }],
      count: async () => 1,
    } } } as never, {} as never, {} as never);
    expect(await service.summarize('owner')).toContain('[note-one]');
  });

  it('identifies both unrated and rated trackers', async () => {
    const service = new TrackersService({} as never, {} as never, timezone as never);
    vi.spyOn(service, 'overview').mockResolvedValue([
      { tracker: { id: 'tracker-empty', name: 'Energy' }, points: [], sentence: null },
      { tracker: { id: 'tracker-rated', name: 'Focus' }, points: [{ value: 7 }], sentence: 'Focus was 7/10' },
    ] as never);
    const text = await service.summarize('owner');
    expect(text).toContain('[tracker-empty]');
    expect(text).toContain('[tracker-rated]');
  });

  it('identifies the financial account whose balance it reports', async () => {
    const service = new FinanceService({ client: {
      account: { findMany: async () => [{ id: 'account-one', name: 'Synthetic cash', balanceMinor: 1000, currency: 'CAD' }] },
      transaction: { findMany: async () => [] },
    } } as never, {} as never);
    expect(await service.summarize('owner')).toContain('[account-one]');
  });

  it('identifies active and completed workouts with local session dates', async () => {
    const service = new FitnessService({} as never, {} as never, timezone as never);
    vi.spyOn(service, 'active').mockResolvedValue({ id: 'workout-open', title: 'Open session', workingSets: 2 } as never);
    vi.spyOn(service, 'history').mockResolvedValue([
      { id: 'workout-done', title: 'Completed session', startedAt: instant.toISOString(), volumeGrams: 0, sets: [] },
    ] as never);
    const text = await service.summarize('owner');
    expect(text).toContain('[workout-open]');
    expect(text).toContain('[workout-done]');
    expect(text).toContain('2026-07-15');
    expect(text).not.toContain('2026-07-16');
  });

  it('renders task deadlines on the local due date', async () => {
    const service = new TasksService({ client: { task: {
      count: async () => 1,
      findMany: async () => [{ id: 'task-one', title: 'Synthetic task', dueAt: instant }],
    } } } as never, {} as never, timezone as never);
    const text = await service.summarize('owner');
    expect(text).toContain('[task-one]');
    expect(text).toContain('2026-07-15');
    expect(text).not.toContain('2026-07-16');
  });

  it('renders goal deadlines on the local target date', async () => {
    const service = new GoalsService({} as never, {} as never, timezone as never);
    vi.spyOn(service, 'list').mockResolvedValue([
      { id: 'goal-one', title: 'Synthetic goal', status: 'active', horizon: 'short', targetDate: instant.toISOString(), taskCount: 0 },
    ] as never);
    const text = await service.summarize('owner');
    expect(text).toContain('[goal-one]');
    expect(text).toContain('2026-07-15');
    expect(text).not.toContain('2026-07-16');
  });
});
