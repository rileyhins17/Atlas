import { Injectable, NotFoundException } from '@nestjs/common';
import {
  nextOccurrence,
  type CreateTaskInput,
  type RollForwardAction,
  type RollForwardResultDTO,
  type TaskDTO,
  type UpdateTaskInput,
} from '@atlas/shared';
import type { Task } from '@atlas/db';
import { PrismaService } from '../../core/prisma.service.js';
import { TimelineService } from '../../core/timeline.service.js';
import { localDayStartUtc, safeTz } from '../ai/time.util.js';

function toDto(t: Task): TaskDTO {
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

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly timeline: TimelineService,
  ) {}

  /** Ownership-scoped read, shared with the AI tool router so it can capture
   *  the "before" state an undo needs. */
  async owned(userId: string, id: string): Promise<Task> {
    const task = await this.prisma.client.task.findFirst({ where: { id, userId } });
    if (!task) throw new NotFoundException('Task not found');
    return task;
  }

  async create(userId: string, input: CreateTaskInput): Promise<TaskDTO> {
    const task = await this.prisma.client.task.create({
      data: {
        userId,
        title: input.title,
        notes: input.notes,
        priority: input.priority,
        dueAt: input.dueAt,
        tags: input.tags,
        goalId: input.goalId,
        recurrence: input.recurrence,
      },
    });
    await this.timeline.write({
      userId,
      type: 'task.created',
      source: 'tasks',
      title: `Created task: ${task.title}`,
      refType: 'task',
      refId: task.id,
      payload: { priority: task.priority, dueAt: task.dueAt?.toISOString() ?? null },
    });
    return toDto(task);
  }

  async list(userId: string, page: { limit: number; offset: number }): Promise<TaskDTO[]> {
    const tasks = await this.prisma.client.task.findMany({
      where: { userId, status: { not: 'ARCHIVED' } },
      orderBy: [{ status: 'asc' }, { dueAt: 'asc' }, { createdAt: 'desc' }],
      take: page.limit,
      skip: page.offset,
    });
    return tasks.map(toDto);
  }

  /** Local midnight for this user, from the one clock the whole app buckets by. */
  private async dayStart(userId: string): Promise<Date> {
    const user = await this.prisma.client.user.findUnique({
      where: { id: userId },
      select: { timezone: true },
    });
    return localDayStartUtc(safeTz(user?.timezone ?? 'UTC'));
  }

  /**
   * Open work that was due before today — what did not happen.
   *
   * Anything due *today* is deliberately excluded: the day is not over, so it
   * has not slipped yet, and asking about it would train the user to dismiss
   * this without reading it.
   */
  async slipped(userId: string, limit = 25): Promise<TaskDTO[]> {
    const tasks = await this.prisma.client.task.findMany({
      where: {
        userId,
        status: { in: ['TODO', 'IN_PROGRESS'] },
        dueAt: { lt: await this.dayStart(userId) },
      },
      orderBy: [{ dueAt: 'asc' }, { priority: 'desc' }],
      take: limit,
    });
    return tasks.map(toDto);
  }

  /**
   * Answer the slipped list in one go: move it to today, or admit it is not
   * happening.
   *
   * Dropping ARCHIVES rather than deletes or completes. Deleting would destroy
   * the signal, and marking it DONE would be a lie that quietly inflates every
   * completion statistic on the Progress page. Archived means "I decided
   * against this", which is a different and more useful fact.
   */
  async rollForward(
    userId: string,
    taskIds: string[],
    action: RollForwardAction,
  ): Promise<RollForwardResultDTO> {
    // Scope the write by userId as well as id: the ids come from the client and
    // one that belongs to someone else must simply not match.
    const tasks = await this.prisma.client.task.findMany({
      where: { id: { in: taskIds }, userId, status: { in: ['TODO', 'IN_PROGRESS'] } },
    });
    if (tasks.length === 0) return { action, count: 0 };
    const ids = tasks.map((t) => t.id);

    if (action === 'today') {
      // End of the user's local day, so a rolled task reads as "today" on every
      // surface rather than landing at midnight and looking overdue again.
      const due = new Date((await this.dayStart(userId)).getTime() + 86_400_000 - 60_000);
      await this.prisma.client.task.updateMany({ where: { id: { in: ids } }, data: { dueAt: due } });
    } else {
      await this.prisma.client.task.updateMany({
        where: { id: { in: ids } },
        data: { status: 'ARCHIVED' },
      });
    }

    // One row per task, not one for the batch: the AI reads this log to learn
    // what you actually keep putting off, and that is per-task knowledge.
    for (const task of tasks) {
      await this.timeline.write({
        userId,
        type: action === 'today' ? 'task.rolled_forward' : 'task.dropped',
        source: 'tasks',
        title:
          action === 'today'
            ? `Moved to today: ${task.title}`
            : `Decided against: ${task.title}`,
        refType: 'task',
        refId: task.id,
      });
    }
    return { action, count: ids.length };
  }

  async update(userId: string, id: string, input: UpdateTaskInput): Promise<TaskDTO> {
    await this.owned(userId, id);
    const task = await this.prisma.client.task.update({
      where: { id },
      data: {
        title: input.title,
        notes: input.notes,
        status: input.status,
        priority: input.priority,
        dueAt: input.dueAt,
        tags: input.tags,
        goalId: input.goalId,
        recurrence: input.recurrence,
        completedAt: input.status === 'DONE' ? new Date() : input.status ? null : undefined,
      },
    });
    await this.timeline.write({
      userId,
      type: 'task.updated',
      source: 'tasks',
      title: `Updated task: ${task.title}`,
      refType: 'task',
      refId: task.id,
    });
    // Completing via PATCH must advance a series exactly like POST /complete
    // does — the web checkbox uses one, the AI tool uses the other.
    if (input.status === 'DONE') await this.spawnNextInstance(userId, task);
    return toDto(task);
  }

  async complete(userId: string, id: string): Promise<TaskDTO> {
    await this.owned(userId, id);
    const task = await this.prisma.client.task.update({
      where: { id },
      data: { status: 'DONE', completedAt: new Date() },
    });
    await this.timeline.write({
      userId,
      type: 'task.completed',
      source: 'tasks',
      title: `Completed task: ${task.title}`,
      refType: 'task',
      refId: task.id,
    });
    await this.spawnNextInstance(userId, task);
    return toDto(task);
  }

  /**
   * Recurring tasks are materialised LAZILY: a series keeps exactly one open
   * instance, and finishing it creates the next. No cron, nothing accumulates,
   * and a series you stop completing simply stops.
   *
   * The next date is always computed from the SERIES ROOT, never from the row
   * just completed — anchoring on the instance would let "monthly on the 31st"
   * drift to the 28th forever once February clamped it once, and would make
   * COUNT/UNTIL uncountable.
   */
  private async spawnNextInstance(userId: string, done: Task): Promise<void> {
    if (!done.recurrence) return;

    const seriesId = done.recurrenceParentId ?? done.id;
    const root =
      seriesId === done.id
        ? done
        : await this.prisma.client.task.findFirst({ where: { id: seriesId, userId } });
    if (!root) return; // series root deleted — the chain ends here, quietly

    // A series without a due date has nothing to step from; fall back to when
    // the root was created so a dateless recurring task still advances.
    const anchor = root.dueAt ?? root.createdAt;
    const after = done.dueAt ?? new Date();
    const next = nextOccurrence(done.recurrence, anchor, after);
    if (!next) return; // COUNT/UNTIL exhausted, or a rule we don't expand

    // Guard against a double-complete racing two instances into existence.
    const existing = await this.prisma.client.task.findFirst({
      where: {
        userId,
        recurrenceParentId: seriesId,
        status: { in: ['TODO', 'IN_PROGRESS'] },
      },
      select: { id: true },
    });
    if (existing) return;

    const spawned = await this.prisma.client.task.create({
      data: {
        userId,
        title: done.title,
        notes: done.notes,
        priority: done.priority,
        dueAt: next,
        tags: done.tags,
        goalId: done.goalId,
        recurrence: done.recurrence,
        recurrenceParentId: seriesId,
      },
    });
    await this.timeline.write({
      userId,
      type: 'task.created',
      source: 'tasks',
      title: `Next up: ${spawned.title}`,
      refType: 'task',
      refId: spawned.id,
      payload: { recurring: true, dueAt: spawned.dueAt?.toISOString() ?? null },
    });
  }

  async remove(userId: string, id: string): Promise<{ ok: true }> {
    const task = await this.owned(userId, id);
    await this.prisma.client.task.delete({ where: { id } });
    await this.timeline.write({
      userId,
      type: 'task.deleted',
      source: 'tasks',
      title: `Deleted task: ${task.title}`,
      refType: 'task',
      refId: task.id,
    });
    return { ok: true };
  }

  /** Compact summary used by the AI context builder. */
  async summarize(userId: string): Promise<string> {
    const [open, dueSoon] = await Promise.all([
      this.prisma.client.task.count({ where: { userId, status: { in: ['TODO', 'IN_PROGRESS'] } } }),
      this.prisma.client.task.findMany({
        where: { userId, status: { in: ['TODO', 'IN_PROGRESS'] }, dueAt: { not: null } },
        orderBy: { dueAt: 'asc' },
        take: 5,
      }),
    ]);
    if (open === 0) return 'No open tasks.';
    // The id is what makes tasks.update / tasks.delete usable at all — without
    // it the model can name a task but cannot address one.
    const lines = dueSoon.map(
      (t) => `- [${t.id}] ${t.title}${t.dueAt ? ` (due ${t.dueAt.toISOString().slice(0, 10)})` : ''}`,
    );
    return `${open} open task(s). Next up:\n${lines.join('\n') || '(none with due dates)'}`;
  }
}
