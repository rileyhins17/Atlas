import { Injectable } from '@nestjs/common';
import {
  buildEnergyProfile,
  estimateDurations,
  durationKey,
  type DurationEstimate,
  type DurationSample,
  type EnergyProfile,
  type EnergySample,
} from '@atlas/shared';
import { PrismaService } from '../../core/prisma.service.js';
import { localHour, safeTz } from '../ai/time.util.js';

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

  /**
   * When this user actually finishes demanding work.
   *
   * Deliberately a DIFFERENT query from `estimates`: that one needs a reserved
   * block to measure against, so it only ever sees tasks Atlas scheduled. Most
   * tasks are just ticked off, and for "what hour do you get hard things done"
   * the tick is the whole measurement — requiring a block would throw away the
   * majority of the evidence and bias the answer toward days that were planned.
   *
   * The hour is the user's LOCAL hour. Bucketing by UTC would smear a
   * consistent 9am into two different hours across a DST boundary and put an
   * eastern user's morning in the previous evening.
   */
  async energy(userId: string, timezone: string): Promise<EnergyProfile> {
    const tz = safeTz(timezone);
    const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000);
    const done = await this.prisma.client.task.findMany({
      where: { userId, status: 'DONE', completedAt: { not: null, gte: since } },
      select: { completedAt: true, priority: true },
      orderBy: { completedAt: 'desc' },
      take: MAX_SAMPLES,
    });

    const samples: EnergySample[] = [];
    for (const t of done) {
      if (!t.completedAt) continue;
      samples.push({
        hour: localHour(tz, t.completedAt),
        demanding: t.priority === 'HIGH' || t.priority === 'URGENT',
      });
    }
    return buildEnergyProfile(samples);
  }
}
