import { z } from 'zod';

export const CreateJournalInput = z.object({
  body: z.string().min(1).max(20_000),
  // 1 (low) .. 5 (great). Optional, but drives mood-correlation + AI questions.
  mood: z.number().int().min(1).max(5).optional(),
  tags: z.array(z.string()).default([]),
  // The day the entry is about; defaults to today server-side.
  entryDate: z.coerce.date().optional(),
});
export type CreateJournalInput = z.infer<typeof CreateJournalInput>;

export const JournalDTO = z.object({
  id: z.string(),
  entryDate: z.string(),
  body: z.string(),
  mood: z.number().int().nullable(),
  tags: z.array(z.string()),
  createdAt: z.string(),
});
export type JournalDTO = z.infer<typeof JournalDTO>;
