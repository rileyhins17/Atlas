import { Injectable } from '@nestjs/common';
import type { TimelineEventDTO, TimelinePageDTO, TimelineQuery } from '@atlas/shared';
import type { TimelineEvent } from '@atlas/db';
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

  private toDto(e: TimelineEvent): TimelineEventDTO {
    return {
      id: e.id,
      type: e.type,
      source: e.source,
      title: e.title,
      summary: e.summary,
      refType: e.refType,
      refId: e.refId,
      occurredAt: e.occurredAt.toISOString(),
    };
  }

  async list(userId: string, query: TimelineQuery): Promise<TimelinePageDTO> {
    const rows = await this.prisma.client.timelineEvent.findMany({
      where: { userId, ...(query.source ? { source: query.source } : {}) },
      orderBy: { occurredAt: 'desc' },
      skip: query.offset,
      take: query.limit + 1,
    });
    const hasMore = rows.length > query.limit;
    return { events: rows.slice(0, query.limit).map((e) => this.toDto(e)), hasMore };
  }
}
