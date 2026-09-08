import { buildAiEventPatch } from '@atlas/shared';
import {
  AiByIdInput as ByIdInput,
  AiEventPatch,
  AiHabitLogInput as HabitLogInput,
  AiTrackerLogInput as TrackerLogInput,
  AiTaskPatch,
  AiNotePatch,
  AiHabitPatch,
  AiGoalPatch,
  AiAskQuestionInput as AskQuestionInput,
  normalizeAiEventInput as toEventInput,
  pickUndoFields as pick,
  deleteToolUndo as del,
  patchToolUndo as patchBack,
  recreateToolUndo as recreate,
} from '@atlas/shared';
import { Injectable } from '@nestjs/common';
import {
  CreateHabitInput,
  CreateJournalInput,
  CreateGoalInput,
  CreateNoteInput,
  CreateTaskInput,
  LogHabitInput,
  LogTrackerInput,
  RoutineBlockInput,
  StartWorkoutInput,
} from '@atlas/shared';
import type { ToolOutcome } from '@atlas/shared';
import { TasksService } from '../tasks/tasks.service.js';
import { HabitsService } from '../habits/habits.service.js';
import { TrackersService } from '../trackers/trackers.service.js';
import { JournalService } from '../journal/journal.service.js';
import { NotesService } from '../notes/notes.service.js';
import { CalendarService } from '../calendar/calendar.service.js';
import { FitnessService } from '../fitness/fitness.service.js';
import { RoutineService } from '../routine/routine.service.js';
import { GoalsService } from '../goals/goals.service.js';
import { MemoryService } from '../../core/memory.service.js';

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
    private readonly trackers: TrackersService,
    private readonly journal: JournalService,
    private readonly notes: NotesService,
    private readonly calendar: CalendarService,
    private readonly fitness: FitnessService,
    private readonly routine: RoutineService,
    private readonly goals: GoalsService,
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
      case 'habits.update': {
        const { id, ...patch } = AiHabitPatch.parse(args);
        const before = await this.habits.owned(userId, id);
        const habit = await this.habits.update(userId, id, patch);
        return {
          result: habit,
          summary:
            patch.active === false ? `Paused "${habit.name}"` : `Updated "${habit.name}"`,
          undo: patchBack(
            `/habits/${id}`,
            `Undo the change to "${before.name}"`,
            pick(before as unknown as Record<string, unknown>, Object.keys(patch)),
          ),
        };
      }
      case 'habits.delete': {
        const { id } = ByIdInput.parse(args);
        const before = await this.habits.owned(userId, id);
        await this.habits.remove(userId, id);
        return {
          result: { ok: true },
          summary: `Stopped tracking "${before.name}"`,
          // Recreating gives a fresh habit — the check-in history is gone for
          // good, which is why the tool description steers toward pausing.
          undo: recreate('/habits', `Track "${before.name}" again`, {
            name: before.name,
            cadence: before.cadence,
            target: before.target,
          }),
        };
      }
      case 'habits.log': {
        const { id, ...rest } = HabitLogInput.parse(args);
        const habit = await this.habits.log(userId, id, LogHabitInput.parse(rest));
        // A check-in has no delete endpoint, so it is honestly not undoable
        // rather than offered with an inverse that would not work.
        return { result: habit, summary: `Checked in "${habit.name}"`, undo: null };
      }

      // ── Personal trackers ────────────────────────────────────────────────
      case 'trackers.log': {
        const { trackerId, ...rest } = TrackerLogInput.parse(args);
        const entry = await this.trackers.log(userId, trackerId, LogTrackerInput.parse(rest));
        const tracker = await this.trackers.owned(userId, trackerId);
        // Re-rating a day overwrites it, so there is no inverse that restores
        // the previous number — offering one that silently did nothing would be
        // worse than saying it cannot be undone.
        return {
          result: entry,
          summary: `Rated ${tracker.name} ${entry.value}/10`,
          undo: null,
        };
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

      case 'notes.delete': {
        const { id } = ByIdInput.parse(args);
        const before = await this.notes.owned(userId, id);
        await this.notes.remove(userId, id);
        return {
          result: { ok: true },
          summary: before.title ? `Deleted note "${before.title}"` : 'Deleted a note',
          undo: recreate('/notes', 'Restore that note', {
            ...(before.title ? { title: before.title } : {}),
            body: before.body,
            pinned: before.pinned,
          }),
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
        const event = await this.calendar.update(userId, parsed.id, buildAiEventPatch(parsed, before));
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

      // ── Goals ────────────────────────────────────────────────────────────
      case 'goals.create': {
        const goal = await this.goals.create(userId, CreateGoalInput.parse(args));
        return {
          result: goal,
          summary: `Added ${goal.horizon}-term goal "${goal.title}"`,
          undo: del(`/goals/${goal.id}`, `Remove "${goal.title}"`),
        };
      }
      case 'goals.update': {
        const { id, ...patch } = AiGoalPatch.parse(args);
        const before = await this.goals.owned(userId, id);
        const goal = await this.goals.update(userId, id, patch);
        return {
          result: goal,
          summary:
            patch.status === 'achieved'
              ? `Marked "${goal.title}" achieved`
              : `Updated "${goal.title}"`,
          undo: patchBack(
            `/goals/${id}`,
            `Undo the change to "${before.title}"`,
            pick(before as unknown as Record<string, unknown>, Object.keys(patch)),
          ),
        };
      }
      case 'goals.delete': {
        const { id } = ByIdInput.parse(args);
        const before = await this.goals.owned(userId, id);
        await this.goals.remove(userId, id);
        return {
          result: { ok: true },
          summary: `Deleted goal "${before.title}"`,
          undo: recreate('/goals', `Restore "${before.title}"`, {
            title: before.title,
            ...(before.description ? { description: before.description } : {}),
            horizon: before.horizon,
            ...(before.targetDate ? { targetDate: before.targetDate.toISOString() } : {}),
          }),
        };
      }

      // ── Fitness ──────────────────────────────────────────────────────────
      case 'routine.remove_block': {
        const { id } = ByIdInput.parse(args);
        const blocks = await this.routine.list(userId);
        const before = blocks.find((b) => b.id === id);
        if (!before) throw new Error('Routine block not found');
        await this.routine.removeBlock(userId, id);
        return {
          result: { ok: true },
          summary: `Removed "${before.label}" from your week`,
          undo: recreate('/routine/blocks', `Put "${before.label}" back`, {
            label: before.label,
            kind: before.kind,
            days: before.days,
            startMin: before.startMin,
            endMin: before.endMin,
            ...(before.onDate ? { onDate: before.onDate } : {}),
          }),
        };
      }

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
