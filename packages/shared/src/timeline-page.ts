import type { TimelineEventDTO, TimelinePageDTO } from './index.js';

export type TimelineRecord = Omit<TimelineEventDTO, 'occurredAt'> & { occurredAt: Date };

export function serializeTimelineEvent(e: TimelineRecord): TimelineEventDTO {
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

export function assembleTimelinePage(rows: TimelineRecord[], limit: number): TimelinePageDTO {
  return { events: rows.slice(0, limit).map(serializeTimelineEvent), hasMore: rows.length > limit };
}
