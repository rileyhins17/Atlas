import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  nextOccurrences,
  type CreateEventInput,
  type EventDTO,
  type UpdateEventInput,
  ShiftScheduleInput,
  describeShift,
  planShift,
  type ShiftScheduleResult,
} from '@atlas/shared';
import type { Event } from '@atlas/db';
import { PrismaService } from '../../core/prisma.service.js';
import { dayKeyInTz, safeTz } from '../ai/time.util.js';
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
    recurrence: e.recurrence,
    taskId: e.taskId,
    createdAt: e.createdAt.toISOString(),
  };
}

const MAX_PAGE = 100;
/** Ceiling on instances generated from one rule inside a single window. */
const MAX_OCCURRENCES_PER_SERIES = 100;

/**
 * Project a stored series onto a window as read-only occurrence rows. The
 * stored row IS the first occurrence, so it comes back from the query normally
 * and only the later ones are synthesised here.
 *
 * Synthetic rows carry `id = "<rootId>@<epochMs>"` and `isOccurrence: true` so
 * the UI can render them but never PATCH/DELETE them as if they were rows.
 */
function expandSeries(event: Event, from: Date, to: Date): EventDTO[] {
  const durationMs = event.endAt.getTime() - event.startAt.getTime();
  // `after` is exclusive, so step back a millisecond to keep an occurrence
  // landing exactly on the window start.
  const after = new Date(Math.max(from.getTime() - 1, event.startAt.getTime()));
  const dates = nextOccurrences(
    event.recurrence,
    event.startAt,
    after,
    MAX_OCCURRENCES_PER_SERIES,
  );
  const base = toDto(event);
  const out: EventDTO[] = [];
  for (const startAt of dates) {
    if (startAt.getTime() >= to.getTime()) break;
    out.push({
      ...base,
      id: `${event.id}@${startAt.getTime()}`,
      startAt: startAt.toISOString(),
      endAt: new Date(startAt.getTime() + durationMs).toISOString(),
      isOccurrence: true,
    });
  }
  return out;
}

@Injectable()
export class CalendarService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly timeline: TimelineService,
  ) {}

  /** Ownership-scoped read, shared with the AI tool router so it can capture
   *  the "before" state an undo needs. */
  async owned(userId: string, id: string): Promise<Event> {
    const event = await this.prisma.client.event.findFirst({ where: { id, userId } });
    if (!event) throw new NotFoundException('Event not found');
    return event;
  }

  /** Same guarantee for a task a block is being attached to. */
  private async ownedTask(userId: string, taskId: string): Promise<{ id: string }> {
    const task = await this.prisma.client.task.findFirst({
      where: { id: taskId, userId },
      select: { id: true },
    });
    if (!task) throw new NotFoundException('Task not found');
    return task;
  }

  /** Upcoming + recently-past events, bounded (commercial-grade: never unbounded). */
  async list(
    userId: string,
    opts: { from?: Date; to?: Date; limit?: number } = {},
  ): Promise<EventDTO[]> {
    const from = opts.from ?? new Date(Date.now() - 1000 * 60 * 60 * 24); // yesterday onward
    const take = Math.min(opts.limit ?? 50, MAX_PAGE);
    const events = await this.prisma.client.event.findMany({
      where: { userId, startAt: { gte: from, ...(opts.to ? { lt: opts.to } : {}) } },
      orderBy: { startAt: 'asc' },
      take,
    });
    const rows = events.map(toDto);

    // Recurring series are expanded on READ, never materialised in the DB, so
    // nothing accumulates and editing the rule instantly changes every future
    // occurrence. Only a bounded window can be expanded — an open-ended list
    // has no natural end to stop generating at.
    const to = opts.to;
    if (!to) return rows;
    const series = await this.prisma.client.event.findMany({
      where: { userId, recurrence: { not: null }, startAt: { lt: to } },
      orderBy: { startAt: 'asc' },
      take: MAX_PAGE,
    });
    if (series.length === 0) return rows;

    const merged = [...rows];
    for (const s of series) merged.push(...expandSeries(s, from, to));
    merged.sort((a, b) => a.startAt.localeCompare(b.startAt));
    return merged.slice(0, take);
  }

  async create(userId: string, input: CreateEventInput): Promise<EventDTO> {
    // Never trust a client-supplied id: without this check one user could
    // attach a block to another user's task, and the duration Atlas learns
    // from it would leak across accounts.
    const taskId = input.taskId ? (await this.ownedTask(userId, input.taskId)).id : null;
    const event = await this.prisma.client.event.create({
      data: {
        userId,
        title: input.title,
        description: input.description,
        location: input.location,
        startAt: input.startAt,
        endAt: input.endAt,
        allDay: input.allDay,
        recurrence: input.recurrence,
        taskId,
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
    const before = await this.owned(userId, id);

    // The half the DTO cannot see. Moving ONE end past the other reverses the
    // event just as effectively as sending both, and `owned` has already paid
    // for the read, so this costs nothing.
    const startAt = input.startAt ?? before.startAt;
    const endAt = input.endAt ?? before.endAt;
    if (endAt < startAt) {
      throw new BadRequestException('endAt must be after startAt');
    }

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

  /**
   * "I'm running 30 minutes late" — push the rest of today.
   *
   * The rules live in `planShift` (pure, in @atlas/shared) so they can be tested
   * exhaustively and so the UI can describe the outcome before committing to it.
   * This half is only: read the right window, apply, log once.
   *
   * The window is "the rest of the LOCAL day". A fixed 24-hour reach would be
   * wrong twice a year, so today is defined by comparing timezone day keys
   * rather than by adding a day's worth of milliseconds — the trap this repo
   * has hit nine times.
   */
  async shiftSchedule(
    userId: string,
    timezone: string,
    input: ShiftScheduleInput,
  ): Promise<ShiftScheduleResult> {
    const tz = safeTz(timezone);
    const from = input.from ?? new Date();
    const dayKey = (d: Date) => dayKeyInTz(d, tz);

    // 36 hours is a generous over-fetch that cannot miss the end of the local
    // day under any offset; the day-key filter below is what actually decides.
    const horizon = new Date(from.getTime() + 36 * 60 * 60 * 1000);
    const candidates = await this.prisma.client.event.findMany({
      where: { userId, startAt: { gte: from, lt: horizon } },
      orderBy: { startAt: 'asc' },
    });
    const today = candidates.filter((e) => dayKey(e.startAt) === dayKey(from));

    const plan = planShift(today, { minutes: input.minutes, from, dayKey });
    const message = describeShift(plan, input.minutes);

    if (plan.moved.length === 0) {
      return { minutes: input.minutes, moved: [], skipped: plan.skipped, message };
    }

    // One transaction: a half-applied shift is a worse schedule than either the
    // old one or the new one, and there is no way for a user to tell which
    // half landed.
    const updated = await this.prisma.client.$transaction(
      plan.moved.map((m) =>
        this.prisma.client.event.update({
          where: { id: m.id },
          data: { startAt: m.startAt, endAt: m.endAt },
        }),
      ),
    );

    // ONE timeline row for one user action. A row per event would bury the
    // rest of the day's log under a single tap.
    await this.timeline.write({
      userId,
      type: 'schedule.shifted',
      source: 'calendar',
      title: message,
      summary: `${input.minutes > 0 ? '+' : ''}${input.minutes} minutes`,
      refType: 'schedule',
      refId: dayKey(from),
      payload: { minutes: input.minutes, movedIds: plan.moved.map((m) => m.id) },
    });

    return { minutes: input.minutes, moved: updated.map(toDto), skipped: plan.skipped, message };
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
