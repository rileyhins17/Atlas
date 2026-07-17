import { z } from 'zod';

// Notes are durable "things Atlas should know about me" (people, preferences,
// goals, context) — reference memory, not a scratchpad. `pinned` means
// always-in-context for the AI.
export const CreateNoteInput = z.object({
  title: z.string().max(200).optional(),
  body: z.string().min(1).max(20_000),
  tags: z.array(z.string()).default([]),
  pinned: z.boolean().default(false),
});
export type CreateNoteInput = z.infer<typeof CreateNoteInput>;

export const UpdateNoteInput = z.object({
  title: z.string().max(200).nullable().optional(),
  body: z.string().min(1).max(20_000).optional(),
  tags: z.array(z.string()).optional(),
  pinned: z.boolean().optional(),
});
export type UpdateNoteInput = z.infer<typeof UpdateNoteInput>;

export const NoteDTO = z.object({
  id: z.string(),
  title: z.string().nullable(),
  body: z.string(),
  tags: z.array(z.string()),
  pinned: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type NoteDTO = z.infer<typeof NoteDTO>;
