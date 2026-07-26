import { Injectable, NotFoundException } from '@nestjs/common';
import type { CreateGoalInput, GoalDTO, UpdateGoalInput } from '@atlas/shared';
import type { Goal } from '@atlas/db';
import { PrismaService } from '../../core/prisma.service.js';
import { TimelineService } from '../../core/timeline.service.js';

const MAX_GOALS = 100;

type GoalRow = Goal & { _count?: { tasks: number } };

function toDto(g: GoalRow, doneTaskCount = 0): GoalDTO {
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

/**
 * Goals: the layer above tasks that says why any of this matters.
 *
 * A goal is only meaningfully "in progress" if real work is attached to it, so
 * every read carries its linked-task counts. A goal with nothing linked is
 * reported honestly as such rather than shown at 0%, which reads like failure
 * when it actually means "you have not broken this down yet".
 */
@Injectable()
export class GoalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly timeline: TimelineService,
  ) {}

  async owned(userId: string, id: string): Promise<Goal> {
    const goal = await this.prisma.client.goal.findFirst({ where: { id, userId } });
    if (!goal) throw new NotFoundException('Goal not found');
    return goal;
  }

  async list(userId: string): Promise<GoalDTO[]> {
    const goals = await this.prisma.client.goal.findMany({
      where: { userId },
      orderBy: [{ horizon: 'asc' }, { position: 'asc' }, { createdAt: 'asc' }],
      include: { _count: { select: { tasks: true } } },
    });
    if (goals.length === 0) return [];

    // One grouped count rather than a query per goal.
    const done = await this.prisma.client.task.groupBy({
      by: ['goalId'],
      where: { userId, goalId: { in: goals.map((g) => g.id) }, status: 'DONE' },
      _count: { _all: true },
    });
    const doneByGoal = new Map(done.map((d) => [d.goalId, d._count._all]));
    return goals.map((g) => toDto(g, doneByGoal.get(g.id) ?? 0));
  }

  async create(userId: string, input: CreateGoalInput): Promise<GoalDTO> {
    const count = await this.prisma.client.goal.count({ where: { userId } });
    if (count >= MAX_GOALS) throw new NotFoundException('Too many goals');
    const goal = await this.prisma.client.goal.create({
      data: {
        userId,
        title: input.title.trim(),
        description: input.description?.trim() || null,
        horizon: input.horizon,
        targetDate: input.targetDate ?? null,
        position: count,
      },
      include: { _count: { select: { tasks: true } } },
    });
    await this.timeline.write({
      userId,
      type: 'goal.created',
      source: 'goals',
      title: `New ${input.horizon}-term goal: ${goal.title}`,
      refType: 'goal',
      refId: goal.id,
    });
    return toDto(goal);
  }

  async update(userId: string, id: string, input: UpdateGoalInput): Promise<GoalDTO> {
    await this.owned(userId, id);
    const goal = await this.prisma.client.goal.update({
      where: { id },
      data: {
        ...(input.title !== undefined ? { title: input.title.trim() } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.horizon !== undefined ? { horizon: input.horizon } : {}),
        ...(input.targetDate !== undefined ? { targetDate: input.targetDate } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.position !== undefined ? { position: input.position } : {}),
      },
      include: { _count: { select: { tasks: true } } },
    });
    if (input.status === 'achieved') {
      await this.timeline.write({
        userId,
        type: 'goal.achieved',
        source: 'goals',
        title: `Achieved: ${goal.title}`,
        refType: 'goal',
        refId: goal.id,
      });
    }
    return toDto(goal);
  }

  async remove(userId: string, id: string): Promise<{ ok: true }> {
    const { count } = await this.prisma.client.goal.deleteMany({ where: { id, userId } });
    if (count === 0) throw new NotFoundException('Goal not found');
    return { ok: true };
  }

  /** Compact context for the AI: what the user is actually working toward. */
  async summarize(userId: string): Promise<string> {
    const goals = await this.list(userId);
    const active = goals.filter((g) => g.status === 'active');
    if (active.length === 0) return 'No goals set.';
    const line = (g: GoalDTO) =>
      `- [${g.id}] ${g.title}` +
      (g.targetDate ? ` (by ${g.targetDate.slice(0, 10)})` : '') +
      ` — ${g.taskCount === 0 ? 'nothing linked yet' : `${g.doneTaskCount}/${g.taskCount} tasks done`}`;
    const short = active.filter((g) => g.horizon === 'short');
    const long = active.filter((g) => g.horizon === 'long');
    const parts: string[] = [];
    if (short.length > 0) parts.push(`Short-term goals:\n${short.map(line).join('\n')}`);
    if (long.length > 0) parts.push(`Long-term goals:\n${long.map(line).join('\n')}`);
    return parts.join('\n\n');
  }
}
