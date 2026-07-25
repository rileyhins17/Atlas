import { Injectable } from '@nestjs/common';
import {
  estimateDurations,
  durationKey,
  type DurationEstimate,
  type DurationSample,
} from '@atlas/shared';
import { PrismaService } from '../../core/prisma.service.js';

/** Only learn from work finished recently — how long things take drifts. */
const LOOKBACK_DAYS = 120;
/** Enough history to be representative without scanning a whole account. */
const MAX_SAMPLES = 500;

/**
 * What the user's own history says about how long their work takes.
 *
 * The measurement is the block Atlas reserved for a task (`Event.taskId`) paired
 * with when that task was completed. That is a real observation rather than the
 * model's guess, and it is the difference between a planner that is plausible
 * and one that is correct.
 *
 * Read-only and derived — nothing is stored, so there is no cache to go stale
 * and no migration when the definition improves.
 */
@Injectable()
export class TaskDurationService {
  constructor(private readonly prisma: PrismaService) {}

  async estimates(userId: string): Promise<Map<string, DurationEstimate>> {
    const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000);
    const blocks = await this.prisma.client.event.findMany({
      where: {
        userId,
        taskId: { not: null },
        task: { status: 'DONE', completedAt: { not: null, gte: since } },
      },
      select: {
        startAt: true,
        task: { select: { title: true, completedAt: true } },
      },
      orderBy: { startAt: 'desc' },
      take: MAX_SAMPLES,
    });

    const samples: DurationSample[] = [];
    for (const b of blocks) {
      if (!b.task?.completedAt) continue;
      samples.push({
        title: b.task.title,
        startedAt: b.startAt,
        completedAt: b.task.completedAt,
      });
    }
    return estimateDurations(samples);
  }

  /** The estimate for one title, or null when there is not enough history. */
  async forTitle(userId: string, title: string): Promise<DurationEstimate | null> {
    return (await this.estimates(userId)).get(durationKey(title)) ?? null;
  }
}
