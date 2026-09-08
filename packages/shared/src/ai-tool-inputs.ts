import { z } from 'zod';
import { CreateEventInput } from './dto/event.js';
import { UpdateTaskInput } from './dto/task.js';
import { UpdateNoteInput } from './dto/note.js';
import { UpdateHabitInput } from './dto/habit.js';
import { UpdateGoalInput } from './dto/goal.js';
import type { ToolUndo } from './tool-contracts.js';

export const AiByIdInput = z.object({ id: z.string().min(1).max(64) });

/** Default span when the model gives a start but no end and no duration. */
const DEFAULT_EVENT_MINUTES = 60;

/**
 * What the model may send for an event: `endAt` OR `durationMinutes`. Models
 * are far more reliable at "how long is it" than at arithmetic on end times, so
 * duration is the preferred path and this normalises both into a real endAt.
 */
export const AiEventInput = z.object({
  title: z.string().min(1).max(300),
  startAt: z.coerce.date(),
  endAt: z.coerce.date().optional(),
  durationMinutes: z.number().int().min(1).max(24 * 60).optional(),
  location: z.string().max(500).optional(),
  description: z.string().max(5_000).optional(),
  recurrence: z.string().max(500).optional(),
});

export function normalizeAiEventInput(raw: unknown) {
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
export const AiEventPatch = z.object({
  id: z.string().min(1).max(64),
  title: z.string().min(1).max(300).optional(),
  startAt: z.coerce.date().optional(),
  endAt: z.coerce.date().optional(),
  durationMinutes: z.number().int().min(1).max(24 * 60).optional(),
  location: z.string().max(500).optional(),
});

export const AiHabitLogInput = z.object({
  id: z.string(),
  value: z.number().optional(),
  note: z.string().optional(),
});

export const AiTrackerLogInput = z.object({
  trackerId: z.string().min(1).max(64),
  value: z.number().int().min(1).max(10),
  note: z.string().max(500).nullish(),
});
export const AiTaskPatch = UpdateTaskInput.extend({ id: z.string().min(1).max(64) });
export const AiNotePatch = UpdateNoteInput.extend({ id: z.string().min(1).max(64) });
export const AiHabitPatch = UpdateHabitInput.extend({ id: z.string().min(1).max(64) });
export const AiGoalPatch = UpdateGoalInput.extend({ id: z.string().min(1).max(64) });
export const AiAskQuestionInput = z.object({
  question: z.string().min(1).max(2_000),
  rationale: z.string().max(2_000).optional(),
  relatesTo: z.string().max(100).optional(),
});

// ── Undo builders ─────────────────────────────────────────────────────────
// Every path here is built from a row the server just read or wrote. The model
// never supplies a path or a body, so replaying one can only ever reach data
// the caller's own session could already reach.

export const deleteToolUndo = (path: string, label: string): ToolUndo => ({ label, method: 'DELETE', path, body: null });

export const patchToolUndo = (path: string, label: string, body: Record<string, unknown>): ToolUndo => ({
  label,
  method: 'PATCH',
  path,
  body,
});

export const recreateToolUndo = (path: string, label: string, body: Record<string, unknown>): ToolUndo => ({
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
export function pickUndoFields(row: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    const v = row[k];
    out[k] = v instanceof Date ? v.toISOString() : (v ?? null);
  }
  return out;
}
