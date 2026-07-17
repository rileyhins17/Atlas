import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { CreateEventInput, CreateJournalInput, CreateNoteInput, CreateTaskInput, LogHabitInput } from '@atlas/shared';
import { TasksService } from '../tasks/tasks.service.js';
import { HabitsService } from '../habits/habits.service.js';
import { JournalService } from '../journal/journal.service.js';
import { NotesService } from '../notes/notes.service.js';
import { CalendarService } from '../calendar/calendar.service.js';
import { MemoryService } from '../../core/memory.service.js';

const TaskCompleteInput = z.object({ id: z.string() });
const HabitLogInput = z.object({ id: z.string(), value: z.number().optional(), note: z.string().optional() });
const AskQuestionInput = z.object({
  question: z.string().min(1).max(2_000),
  rationale: z.string().max(2_000).optional(),
  relatesTo: z.string().max(100).optional(),
});

/**
 * Bridges AI tool calls (by name, from getToolSpecs()) to the real domain
 * services. Validates arguments with the same zod DTOs the HTTP boundary uses
 * — the model is an untrusted caller just like an API client. Unknown tool
 * names or invalid arguments throw; the orchestrator's tool loop turns that
 * into a tool-result error the model can see and recover from.
 */
@Injectable()
export class ToolRouterService {
  constructor(
    private readonly tasks: TasksService,
    private readonly habits: HabitsService,
    private readonly journal: JournalService,
    private readonly notes: NotesService,
    private readonly calendar: CalendarService,
    private readonly memory: MemoryService,
  ) {}

  async execute(userId: string, name: string, args: unknown): Promise<unknown> {
    switch (name) {
      case 'tasks.create':
        return this.tasks.create(userId, CreateTaskInput.parse(args));
      case 'tasks.complete':
        return this.tasks.complete(userId, TaskCompleteInput.parse(args).id);
      case 'habits.log': {
        const { id, ...rest } = HabitLogInput.parse(args);
        return this.habits.log(userId, id, LogHabitInput.parse(rest));
      }
      case 'journal.add':
        return this.journal.create(userId, CreateJournalInput.parse(args));
      case 'notes.remember':
        return this.notes.create(userId, CreateNoteInput.parse(args));
      case 'calendar.add':
        return this.calendar.create(userId, CreateEventInput.parse(args));
      case 'ai.ask_question': {
        const parsed = AskQuestionInput.parse(args);
        await this.memory.askUser({ userId, ...parsed });
        return { ok: true };
      }
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }
}
