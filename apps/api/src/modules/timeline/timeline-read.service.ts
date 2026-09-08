import { assembleTimelinePage } from '@atlas/shared';
import { Injectable } from '@nestjs/common';
import type { TimelinePageDTO, TimelineQuery } from '@atlas/shared';
import { PrismaService } from '../../core/prisma.service.js';

/**
 * Read side of the unified life log. `core/timeline.service.ts` owns writes;
 * this module exposes the stream to the UI (the "Story" view) — userId-scoped,
 * newest-first, offset-paginated with an over-fetch of one row to compute
 * `hasMore` without a second COUNT query.
 */
@Injectable()
export class TimelineReadService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, query: TimelineQuery): Promise<TimelinePageDTO> {
    const rows = await this.prisma.client.timelineEvent.findMany({
      where: {
        userId,
        ...(query.source ? { source: query.source } : {}),
        ...(query.from && query.to ? { occurredAt: { gte: query.from, lt: query.to } } : {}),
      },
      orderBy: { occurredAt: 'desc' },
      skip: query.offset,
      take: query.limit + 1,
    });
    return assembleTimelinePage(rows, query.limit);
  }
}
