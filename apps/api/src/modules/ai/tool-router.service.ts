import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import {
  CreateEventInput,
  CreateHabitInput,
  CreateJournalInput,
  CreateNoteInput,
  CreateTaskInput,
  LogHabitInput,
  RoutineBlockInput,
  StartWorkoutInput,
  UpdateNoteInput,
  UpdateTaskInput,
} from '@atlas/shared';
import type { ToolOutcome, ToolUndo } from '@atlas/ai';
import { TasksService } from '../tasks/tasks.service.js';
import { HabitsService } from '../habits/habits.service.js';
import { JournalService } from '../journal/journal.service.js';
import { NotesService } from '../notes/notes.service.js';
import { CalendarService } from '../calendar/calendar.service.js';
import { FitnessService } from '../fitness/fitness.service.js';
import { RoutineService } from '../routine/routine.service.js';
import { MemoryService } from '../../core/memory.service.js';

const ByIdInput = z.object({ id: z.string().min(1).max(64) });

/** Default span when the model gives a start but no end and no duration. */
const DEFAULT_EVENT_MINUTES = 60;

/**
 * What the model may send for an event: `endAt` OR `durationMinutes`. Models
 * are far more reliable at "how long is it" than at arithmetic on end times, so
 * duration is the preferred path and this normalises both into a real endAt.
 */
const AiEventInput = z.object({
  title: z.string().min(1).max(300),
  startAt: z.coerce.date(),
  endAt: z.coerce.date().optional(),
  durationMinutes: z.number().int().min(1).max(24 * 60).optional(),
  location: z.string().max(500).optional(),
  description: z.string().max(5_000).optional(),
  recurrence: z.string().max(500).optional(),
});

function toEventInput(raw: unknown) {
  const parsed = AiEventInput.parse(raw);
  const minutes = parsed.durationMinutes ?? DEFAULT_EVENT_MINUTES;
  const endAt =
    parsed.endAt && parsed.endAt > parsed.startAt
      ? parsed.endAt
      : new Date(parsed.startAt.getTime() + minutes * 60_000);
  return CreateEventInput.parse({
    title: parsed.title,
    startAt: parsed.startAt,
    endAt,
    location: parsed.location,
    description: parsed.description,
    recurrence: parsed.recurrence,
    allDay: false,
  });
}

/** Moving an event: any field may be omitted, and duration still beats endAt. */
const AiEventPatch = z.object({
  id: z.string().min(1).max(64),
  title: z.string().min(1).max(300).optional(),
  startAt: z.coerce.date().optional(),
  endAt: z.coerce.date().optional(),
  durationMinutes: z.number().int().min(1).max(24 * 60).optional(),
  location: z.string().max(500).optional(),
});

const HabitLogInput = z.object({
  id: z.string(),
  value: z.number().optional(),
  note: z.string().optional(),
});
const AiTaskPatch = UpdateTaskInput.extend({ id: z.string().min(1).max(64) });
const AiNotePatch = UpdateNoteInput.extend({ id: z.string().min(1).max(64) });
const AskQuestionInput = z.object({
  question: z.string().min(1).max(2_000),
  rationale: z.string().max(2_000).optional(),
  relatesTo: z.string().max(100).optional(),
});

// ── Undo builders ─────────────────────────────────────────────────────────
// Every path here is built from a row the server just read or wrote. The model
// never supplies a path or a body, so replaying one can only ever reach data
// the caller's own session could already reach.

const del = (path: string, label: string): ToolUndo => ({ label, method: 'DELETE', path, body: null });

const patchBack = (path: string, label: string, body: Record<string, unknown>): ToolUndo => ({
  label,
  method: 'PATCH',
  path,
  body,
});

const recreate = (path: string, label: string, body: Record<string, unknown>): ToolUndo => ({
  label,
  method: 'POST',
  path,
  body,
});

/**
 * Only the fields the patch actually touched.
 *
 * Restoring the whole row would clobber a field someone edited by hand between
 * the AI's change and the undo.
 */
function pick(row: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    const v = row[k];
    out[k] = v instanceof Date ? v.toISOString() : (v ?? null);
  }
  return out;
}

/**
 * Bridges AI tool calls (by name, from getToolSpecs()) to the real domain
 * services. Validates arguments with the same zod DTOs the HTTP boundary uses
 * — the model is an untrusted caller just like an API client. Unknown tool
 * names or invalid arguments throw; the orchestrator's tool loop turns that
 * into a tool-result error the model can see and recover from.
 *
 * Every write returns a `summary` (what changed, in plain words) and an `undo`
 * (how to reverse it). That pairing is what lets the AI edit and delete freely
 * instead of only ever creating: nothing it does is a one-way door.
 */
@Injectable()
export class ToolRouterService {
  constructor(
    private readonly tasks: TasksService,
    private readonly habits: HabitsService,
    private readonly journal: JournalService,
    private readonly notes: NotesService,
    private readonly calendar: CalendarService,
    private readonly fitness: FitnessService,
    private readonly routine: RoutineService,
    private readonly memory: MemoryService,
  ) {}

  async execute(userId: string, name: string, args: unknown): Promise<ToolOutcome> {
    switch (name) {
      // ── Tasks ────────────────────────────────────────────────────────────
      case 'tasks.create': {
        const task = await this.tasks.create(userId, CreateTaskInput.parse(args));
        return {
          result: task,
          summary: `Added task "${task.title}"`,
          undo: del(`/tasks/${task.id}`, `Remove "${task.title}"`),
        };
      }
      case 'tasks.update': {
        const { id, ...patch } = AiTaskPatch.parse(args);
        const before = await this.tasks.owned(userId, id);
        const task = await this.tasks.update(userId, id, patch);
        return {
          result: task,
          summary: `Updated "${task.title}"`,
          undo: patchBack(
            `/tasks/${id}`,
            `Undo the change to "${before.title}"`,
            pick(before as unknown as Record<string, unknown>, Object.keys(patch)),
          ),
        };
      }
      case 'tasks.complete': {
        const { id } = ByIdInput.parse(args);
        const before = await this.tasks.owned(userId, id);
        const task = await this.tasks.complete(userId, id);
        return {
          result: task,
          summary: `Completed "${task.title}"`,
          undo: patchBack(`/tasks/${id}`, `Reopen "${task.title}"`, { status: before.status }),
        };
      }
      case 'tasks.delete': {
        const { id } = ByIdInput.parse(args);
        const before = await this.tasks.owned(userId, id);
        await this.tasks.remove(userId, id);
        return {
          result: { ok: true },
          summary: `Deleted "${before.title}"`,
          undo: recreate('/tasks', `Restore "${before.title}"`, {
            title: before.title,
            ...(before.notes ? { notes: before.notes } : {}),
            priority: before.priority,
            ...(before.dueAt ? { dueAt: before.dueAt.toISOString() } : {}),
          }),
        };
      }

      // ── Habits ───────────────────────────────────────────────────────────
      case 'habits.create': {
        const habit = await this.habits.create(userId, CreateHabitInput.parse(args));
        return {
          result: habit,
          summary: `Started tracking "${habit.name}"`,
          undo: del(`/habits/${habit.id}`, `Stop tracking "${habit.name}"`),
        };
      }
      case 'habits.log': {
        const { id, ...rest } = HabitLogInput.parse(args);
        const habit = await this.habits.log(userId, id, LogHabitInput.parse(rest));
        // A check-in has no delete endpoint, so it is honestly not undoable
        // rather than offered with an inverse that would not work.
        return { result: habit, summary: `Checked in "${habit.name}"`, undo: null };
      }

      // ── Notes ────────────────────────────────────────────────────────────
      case 'notes.remember': {
        const note = await this.notes.create(userId, CreateNoteInput.parse(args));
        return {
          result: note,
          summary: note.title ? `Saved note "${note.title}"` : 'Saved a note',
          undo: del(`/notes/${note.id}`, 'Delete that note'),
        };
      }
      case 'notes.update': {
        const { id, ...patch } = AiNotePatch.parse(args);
        const before = await this.notes.owned(userId, id);
        const note = await this.notes.update(userId, id, patch);
        return {
          result: note,
          summary: note.title ? `Updated note "${note.title}"` : 'Updated a note',
          undo: patchBack(
            `/notes/${id}`,
            'Undo that note change',
            pick(before as unknown as Record<string, unknown>, Object.keys(patch)),
          ),
        };
      }

      // ── Journal ──────────────────────────────────────────────────────────
      case 'journal.add': {
        const entry = await this.journal.create(userId, CreateJournalInput.parse(args));
        // Journal is append-only by design; there is nothing to reverse to.
        return { result: entry, summary: 'Added a journal entry', undo: null };
      }

      // ── Calendar ─────────────────────────────────────────────────────────
      // Both event tools normalise through the same duration-aware shape; block
      // is just the duration-first phrasing of add.
      case 'calendar.add':
      case 'calendar.block': {
        const event = await this.calendar.create(userId, toEventInput(args));
        return {
          result: event,
          summary: `Scheduled "${event.title}"`,
          undo: del(`/events/${event.id}`, `Remove "${event.title}"`),
        };
      }
      case 'calendar.update': {
        const parsed = AiEventPatch.parse(args);
        const before = await this.calendar.owned(userId, parsed.id);
        const start = parsed.startAt ?? before.startAt;
        const end =
          parsed.endAt ??
          (parsed.durationMinutes
            ? new Date(start.getTime() + parsed.durationMinutes * 60_000)
            : // Keep the original length when only the start moved.
              new Date(start.getTime() + (before.endAt.getTime() - before.startAt.getTime())));
        const event = await this.calendar.update(userId, parsed.id, {
          ...(parsed.title ? { title: parsed.title } : {}),
          ...(parsed.location !== undefined ? { location: parsed.location } : {}),
          startAt: start,
          endAt: end,
        });
        return {
          result: event,
          summary: `Moved "${event.title}"`,
          undo: patchBack(`/events/${parsed.id}`, `Put "${before.title}" back`, {
            title: before.title,
            startAt: before.startAt.toISOString(),
            endAt: before.endAt.toISOString(),
          }),
        };
      }
      case 'calendar.delete': {
        const { id } = ByIdInput.parse(args);
        const before = await this.calendar.owned(userId, id);
        await this.calendar.remove(userId, id);
        return {
          result: { ok: true },
          summary: `Removed "${before.title}"`,
          undo: recreate('/events', `Put "${before.title}" back`, {
            title: before.title,
            startAt: before.startAt.toISOString(),
            endAt: before.endAt.toISOString(),
            ...(before.location ? { location: before.location } : {}),
          }),
        };
      }

      // ── Your week ────────────────────────────────────────────────────────
      // Saying "I work 9 to 5 on weekdays" is what makes Today's free time
      // correct, and it was previously only reachable through Settings.
      case 'routine.add_block': {
        const block = await this.routine.addBlock(userId, RoutineBlockInput.parse(args));
        return {
          result: block,
          summary: `Added "${block.label}" to your week`,
          undo: del(`/routine/blocks/${block.id}`, `Remove "${block.label}"`),
        };
      }

      // ── Fitness ──────────────────────────────────────────────────────────
      case 'fitness.start_workout': {
        const workout = await this.fitness.start(userId, StartWorkoutInput.parse(args ?? {}));
        return { result: workout, summary: `Started "${workout.title}"`, undo: null };
      }

      case 'ai.ask_question': {
        const parsed = AskQuestionInput.parse(args);
        await this.memory.askUser({ userId, ...parsed });
        return { result: { ok: true }, summary: null, undo: null };
      }
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }
}
