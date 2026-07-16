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

  async recent(userId: string, limit = 50) {
    return this.prisma.client.timelineEvent.findMany({
      where: { userId },
      orderBy: { occurredAt: 'desc' },
      take: limit,
    });
  }
}
