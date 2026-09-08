import type { TaskDTO } from './dto/task.js';
import type { AccountDTO, TransactionDTO } from './dto/finance.js';
import type { EventDTO } from './dto/event.js';
import type { JournalDTO } from './dto/journal.js';
import type { NoteDTO } from './dto/note.js';
import type { GoalDTO } from './dto/goal.js';
import type { RoutineBlockDTO, RoutineKind } from './dto/routine.js';
import type { InsightDTO } from './dto/ai.js';
import type { AiQuestionDTO } from './contracts.js';

/** Input records describe only fields serialization reads; no ORM dependency. */
export type TaskRecord = Omit<TaskDTO, 'dueAt' | 'completedAt' | 'createdAt' | 'updatedAt'> & {
  dueAt: Date | null; completedAt: Date | null; createdAt: Date; updatedAt: Date;
};
export type AccountRecord = Omit<AccountDTO, 'balanceMinor' | 'createdAt'> & {
  balanceMinor: bigint; createdAt: Date;
};
export type TransactionRecord = Omit<TransactionDTO, 'amountMinor' | 'postedAt' | 'createdAt'> & {
  amountMinor: bigint; postedAt: Date; createdAt: Date;
};
export type EventRecord = Omit<EventDTO, 'startAt' | 'endAt' | 'createdAt' | 'isOccurrence'> & {
  startAt: Date; endAt: Date; createdAt: Date;
};
export type JournalRecord = Omit<JournalDTO, 'entryDate' | 'createdAt'> & {
  entryDate: Date; createdAt: Date;
};
export type NoteRecord = Omit<NoteDTO, 'createdAt' | 'updatedAt'> & {
  createdAt: Date; updatedAt: Date;
};
export type GoalRecord = Omit<GoalDTO, 'horizon' | 'status' | 'targetDate' | 'createdAt' | 'taskCount' | 'doneTaskCount'> & {
  horizon: string; status: string; targetDate: Date | null; createdAt: Date;
  _count?: { tasks: number };
};
export type RoutineBlockRecord = Omit<RoutineBlockDTO, 'kind'> & { kind: string };
export type AiQuestionRecord = Omit<AiQuestionDTO, 'createdAt'> & { createdAt: Date };
export type InsightRecord = Omit<InsightDTO, 'createdAt'> & { createdAt: Date };

export function serializeTask(t: TaskRecord): TaskDTO {
  return {
    id: t.id,
    title: t.title,
    notes: t.notes,
    status: t.status,
    priority: t.priority,
    dueAt: t.dueAt?.toISOString() ?? null,
    completedAt: t.completedAt?.toISOString() ?? null,
    tags: t.tags,
    goalId: t.goalId,
    recurrence: t.recurrence,
    recurrenceParentId: t.recurrenceParentId,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}

export function serializeAccount(a: AccountRecord): AccountDTO {
  return {
    id: a.id,
    name: a.name,
    type: a.type,
    currency: a.currency,
    // Minor units fit comfortably in a JS number for any realistic balance.
    balanceMinor: Number(a.balanceMinor),
    mask: a.mask,
    institution: a.institution,
    source: a.source,
    createdAt: a.createdAt.toISOString(),
  };
}

export function serializeTransaction(t: TransactionRecord): TransactionDTO {
  return {
    id: t.id,
    accountId: t.accountId,
    amountMinor: Number(t.amountMinor),
    currency: t.currency,
    description: t.description,
    category: t.category,
    merchantName: t.merchantName,
    postedAt: t.postedAt.toISOString(),
    pending: t.pending,
    source: t.source,
    createdAt: t.createdAt.toISOString(),
  };
}

export function serializeEvent(e: EventRecord): EventDTO {
  return {
    id: e.id,
    title: e.title,
    description: e.description,
    location: e.location,
    startAt: e.startAt.toISOString(),
    endAt: e.endAt.toISOString(),
    allDay: e.allDay,
    source: e.source,
    recurrence: e.recurrence,
    taskId: e.taskId,
    createdAt: e.createdAt.toISOString(),
  };
}

export function serializeJournal(e: JournalRecord): JournalDTO {
  return {
    id: e.id,
    entryDate: e.entryDate.toISOString(),
    body: e.body,
    mood: e.mood,
    tags: e.tags,
    createdAt: e.createdAt.toISOString(),
  };
}

export function serializeNote(n: NoteRecord): NoteDTO {
  return {
    id: n.id,
    title: n.title,
    body: n.body,
    tags: n.tags,
    pinned: n.pinned,
    createdAt: n.createdAt.toISOString(),
    updatedAt: n.updatedAt.toISOString(),
  };
}

export function serializeGoal(g: GoalRecord, doneTaskCount = 0): GoalDTO {
  return {
    id: g.id,
    title: g.title,
    description: g.description,
    horizon: g.horizon === 'long' ? 'long' : 'short',
    status: (['active', 'achieved', 'paused', 'dropped'] as const).includes(
      g.status as GoalDTO['status'],
    )
      ? (g.status as GoalDTO['status'])
      : 'active',
    targetDate: g.targetDate ? g.targetDate.toISOString() : null,
    position: g.position,
    taskCount: g._count?.tasks ?? 0,
    doneTaskCount,
    createdAt: g.createdAt.toISOString(),
  };
}

export function serializeRoutineBlock(b: RoutineBlockRecord): RoutineBlockDTO {
  return {
    id: b.id,
    label: b.label,
    kind: b.kind as RoutineKind,
    days: b.days,
    onDate: b.onDate,
    startMin: b.startMin,
    endMin: b.endMin,
  };
}

export function serializeAiQuestion(q: AiQuestionRecord): AiQuestionDTO {
  return {
    id: q.id,
    question: q.question,
    rationale: q.rationale,
    relatesTo: q.relatesTo,
    status: q.status,
    createdAt: q.createdAt.toISOString(),
  };
}

export function serializeInsight(i: InsightRecord): InsightDTO {
  return {
    id: i.id,
    kind: i.kind,
    title: i.title,
    body: i.body,
    createdAt: i.createdAt.toISOString(),
  };
}

