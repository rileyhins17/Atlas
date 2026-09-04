import { Injectable } from '@nestjs/common';
import type { Prisma } from '@atlas/db';
import { PrismaService } from './prisma.service.js';

export interface TimelineWrite {
  userId: string;
  /** Dotted event type, e.g. "task.created". */
  type: string;
  /** Producing module/connector, e.g. "tasks". */
  source: string;
  title: string;
  summary?: string;
  refType?: string;
  refId?: string;
  payload?: Record<string, unknown>;
  occurredAt?: Date;
}

/**
 * The unified life log. Every module calls `write()` whenever something happens,
 * giving the AI a single chronological, cross-domain view without querying every
 * domain table. This is the backbone that makes "keep tracking my life" cheap.
 */
@Injectable()
export class TimelineService {
  constructor(private readonly prisma: PrismaService) {}

  async write(event: TimelineWrite): Promise<void> {
    await this.prisma.client.timelineEvent.create({
      data: {
        userId: event.userId,
        type: event.type,
        source: event.source,
        title: event.title,
        summary: event.summary,
        refType: event.refType,
        refId: event.refId,
        payload: (event.payload ?? undefined) as Prisma.InputJsonValue | undefined,
        occurredAt: event.occurredAt ?? new Date(),
      },
    });
  }

  /**
   * Write several rows in one round trip.
   *
   * The timeline is the one table almost every mutation also writes, so a loop
   * over N things is a loop over N inserts — and against a database 384ms away
   * that is the difference between an action feeling instant and feeling
   * broken. Rolling twenty tasks forward wrote twenty rows one at a time.
   *
   * Still one row per thing, not one summary row: the AI reads this log to
   * learn what you actually keep putting off, and that is per-task knowledge.
   * Only the number of round trips changes.
   */
  async writeMany(events: TimelineWrite[]): Promise<void> {
    if (events.length === 0) return;
    await this.prisma.client.timelineEvent.createMany({
      data: events.map((event) => ({
        userId: event.userId,
        type: event.type,
        source: event.source,
        title: event.title,
        summary: event.summary,
        refType: event.refType,
        refId: event.refId,
        payload: (event.payload ?? undefined) as Prisma.InputJsonValue | undefined,
        occurredAt: event.occurredAt ?? new Date(),
      })),
    });
  }

  async recent(userId: string, limit = 50) {
    return this.prisma.client.timelineEvent.findMany({
      where: { userId },
      orderBy: { occurredAt: 'desc' },
      take: limit,
    });
  }
}
