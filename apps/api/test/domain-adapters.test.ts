import { describe, expect, it, vi } from 'vitest';
import { ModuleRegistryService } from '../src/core/domain-module.js';
import { CalendarAiAdapter } from '../src/modules/calendar/calendar.ai.js';
import { FinanceAiAdapter } from '../src/modules/finance/finance.ai.js';
import { FitnessAiAdapter } from '../src/modules/fitness/fitness.ai.js';
import { GoalsAiAdapter } from '../src/modules/goals/goals.ai.js';
import { HabitsAiAdapter } from '../src/modules/habits/habits.ai.js';
import { JournalAiAdapter } from '../src/modules/journal/journal.ai.js';
import { NotesAiAdapter } from '../src/modules/notes/notes.ai.js';
import { RoutineAiAdapter } from '../src/modules/routine/routine.ai.js';
import { TasksAiAdapter } from '../src/modules/tasks/tasks.ai.js';
import { TrackersAiAdapter } from '../src/modules/trackers/trackers.ai.js';

const domains = [
  ['calendar', 'Calendar', 20, CalendarAiAdapter],
  ['finance', 'Finance', 100, FinanceAiAdapter],
  ['fitness', 'Training', 80, FitnessAiAdapter],
  ['goals', 'Goals', 60, GoalsAiAdapter],
  ['habits', 'Habits', 50, HabitsAiAdapter],
  ['journal', 'Journal', 90, JournalAiAdapter],
  ['notes', 'Notes / known facts', 40, NotesAiAdapter],
  ['routine', 'Routine', 10, RoutineAiAdapter],
  ['tasks', 'Tasks', 30, TasksAiAdapter],
  ['trackers', 'Personal trackers', 70, TrackersAiAdapter],
] as const;

describe('every domain keeps the same registration and context contract', () => {
  it.each(domains)('%s registers itself and summarizes only the requested owner', async (id, title, priority, Adapter) => {
    const registry = new ModuleRegistryService();
    const summarize = vi.fn(async () => 'Synthetic owner context');
    const adapter = new Adapter({ summarize } as never, registry);
    expect(registry.list()).toEqual([]);
    adapter.onModuleInit();
    expect(registry.get(id)).toBe(adapter);
    expect(adapter.contextPriority).toBe(priority);
    expect(await registry.collectContext('requested-owner')).toEqual([{
      source: id, title, content: 'Synthetic owner context', tokensEstimate: 6,
    }]);
    expect(summarize).toHaveBeenCalledExactlyOnceWith('requested-owner');
    const tools = registry.collectToolSpecs();
    expect(tools).toEqual(adapter.getToolSpecs());
    expect(tools.every(tool => tool.name.startsWith(`${id}.`))).toBe(true);
  });
});
