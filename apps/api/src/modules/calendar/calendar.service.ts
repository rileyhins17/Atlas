import { Injectable, NotFoundException } from '@nestjs/common';
import type { CreateEventInput, EventDTO, UpdateEventInput } from '@atlas/shared';
import type { Event } from '@atlas/db';
import { PrismaService } from '../../core/prisma.service.js';
import { TimelineService } from '../../core/timeline.service.js';

function toDto(e: Event): EventDTO {
  return {
    id: e.id,
    title: e.title,
    description: e.description,
    location: e.location,
    startAt: e.startAt.toISOString(),
    endAt: e.endAt.toISOString(),
    allDay: e.allDay,
    source: e.source,
    createdAt: e.createdAt.toISOString(),
  };
}

const MAX_PAGE = 100;

@Injectable()
export class CalendarService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly timeline: TimelineService,
  ) {}

  private async owned(userId: string, id: string): Promise<Event> {
    const event = await this.prisma.client.event.findFirst({ where: { id, userId } });
    if (!event) throw new NotFoundException('Event not found');
    return event;
  }

  /** Upcoming + recently-past events, bounded (commercial-grade: never unbounded). */
  async list(userId: string, opts: { from?: Date; limit?: number } = {}): Promise<EventDTO[]> {
    const from = opts.from ?? new Date(Date.now() - 1000 * 60 * 60 * 24); // yesterday onward
    const take = Math.min(opts.limit ?? 50, MAX_PAGE);
    const events = await this.prisma.client.event.findMany({
      where: { userId, startAt: { gte: from } },
      orderBy: { startAt: 'asc' },
      take,
    });
    return events.map(toDto);
  }

  async create(userId: string, input: CreateEventInput): Promise<EventDTO> {
    const event = await this.prisma.client.event.create({
      data: {
        userId,
        title: input.title,
        description: input.description,
        location: input.location,
        startAt: input.startAt,
        endAt: input.endAt,
        allDay: input.allDay,
        source: 'atlas',
      },
    });
    await this.timeline.write({
      userId,
      type: 'event.created',
      source: 'calendar',
      title: `Event: ${event.title}`,
      refType: 'event',
      refId: event.id,
      occurredAt: event.startAt,
      payload: { startAt: event.startAt.toISOString(), endAt: event.endAt.toISOString() },
    });
    return toDto(event);
  }

  async update(userId: string, id: string, input: UpdateEventInput): Promise<EventDTO> {
    await this.owned(userId, id);
    const event = await this.prisma.client.event.update({ where: { id }, data: input });
    await this.timeline.write({
      userId,
      type: 'event.updated',
      source: 'calendar',
      title: `Updated event: ${event.title}`,
      refType: 'event',
      refId: event.id,
    });
    return toDto(event);
  }

  async remove(userId: string, id: string): Promise<{ ok: true }> {
    const event = await this.owned(userId, id);
    await this.prisma.client.event.delete({ where: { id } });
    await this.timeline.write({
      userId,
      type: 'event.deleted',
      source: 'calendar',
      title: `Deleted event: ${event.title}`,
      refType: 'event',
      refId: id,
    });
    return { ok: true };
  }

  /** Compact summary for the AI: the next few events. */
  async summarize(userId: string): Promise<string> {
    const upcoming = await this.list(userId, { from: new Date(), limit: 5 });
    if (upcoming.length === 0) return 'No upcoming events.';
    const lines = upcoming.map((e) => {
      const when = new Date(e.startAt);
      return `- ${e.title} — ${when.toISOString().slice(0, 16).replace('T', ' ')}`;
    });
    return `Next ${upcoming.length} event(s):\n${lines.join('\n')}`;
  }
}
