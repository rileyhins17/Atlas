import { Injectable, NotFoundException } from '@nestjs/common';
import type { CreateTaskInput, TaskDTO, UpdateTaskInput } from '@atlas/shared';
import type { Task } from '@atlas/db';
import { PrismaService } from '../../core/prisma.service.js';
import { TimelineService } from '../../core/timeline.service.js';

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

  private async owned(userId: string, id: string): Promise<Task> {
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
    return toDto(task);
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
    const lines = dueSoon.map(
      (t) => `- ${t.title}${t.dueAt ? ` (due ${t.dueAt.toISOString().slice(0, 10)})` : ''}`,
    );
    return `${open} open task(s). Next up:\n${lines.join('\n') || '(none with due dates)'}`;
  }
}
