// Enum string unions mirrored from the Prisma schema. Kept here (not imported
// from @atlas/db) so browser code can use them without pulling in the DB client.
// If you change an enum in schema.prisma, update it here too.

import { z } from 'zod';

export const TaskStatus = z.enum(['TODO', 'IN_PROGRESS', 'DONE', 'ARCHIVED']);
export type TaskStatus = z.infer<typeof TaskStatus>;

export const TaskPriority = z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']);
export type TaskPriority = z.infer<typeof TaskPriority>;

export const AiQuestionStatus = z.enum(['OPEN', 'ANSWERED', 'DISMISSED']);
export type AiQuestionStatus = z.infer<typeof AiQuestionStatus>;
