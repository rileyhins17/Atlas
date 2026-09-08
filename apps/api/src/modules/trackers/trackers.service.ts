import { serializeTracker, serializeTrackerEntry, assembleTrackerOverview } from '@atlas/shared';
import { summarizeTrackers } from '@atlas/shared';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  MAX_TRACKERS,
  type CreateTrackerInput,
  type LogTrackerInput,
  type TrackerDTO,
  type TrackerEntryDTO,
  type UpdateTrackerInput,
} from '@atlas/shared';
import type { Tracker, TrackerEntry } from '@atlas/db';
import { PrismaService } from '../../core/prisma.service.js';
import { UserTimezoneService } from '../../core/user-timezone.service.js';
import { TimelineService } from '../../core/timeline.service.js';
import { dayKeyInTz } from '../ai/time.util.js';

/**
 * Anything the user has decided to watch, rated once a day.
 *
 * The generic answer to a specific request. Someone asked for a bloating
 * rating; the next person wants soreness, or anxiety, or skin. A feature for
 * any one of those is too niche to build and too reasonable to refuse, so what
 * gets built is the primitive underneath all of them.
 */

/** How far back a summary ever looks. Enough for a season, bounded for a query. */
const WINDOW_DAYS = 120;
/** CLAUDE.md requires a bound on every list. Trackers are capped far below it. */
const MAX_ENTRIES = 2_000;

@Injectable()
export class TrackersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly timeline: TimelineService,
    private readonly timezones: UserTimezoneService,
  ) {}

  private async timezoneOf(userId: string): Promise<string> {
    return this.timezones.get(userId);
  }

  /** Ownership-scoped read, shared with the AI tool router. */
  async owned(userId: string, id: string): Promise<Tracker> {
    const row = await this.prisma.client.tracker.findFirst({ where: { id, userId } });
    if (!row) throw new NotFoundException('Tracker not found');
    return row;
  }

  private toDto(row: Tracker, todayValue: number | null): TrackerDTO {
    return serializeTracker(row, todayValue);
  }

  /**
   * Every tracker, each carrying today's rating if it has one.
   *
   * Today's value comes back with the list rather than from a second call: the
   * only screen that renders this asks "what still needs rating today?", and
   * two round trips to answer one question is the waterfall this codebase keeps
   * finding.
   */
  async list(userId: string, includeArchived = false): Promise<TrackerDTO[]> {
    const rows = await this.prisma.client.tracker.findMany({
      where: { userId, ...(includeArchived ? {} : { active: true }) },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      take: MAX_TRACKERS + 1,
    });
    if (rows.length === 0) return [];

    const today = dayKeyInTz(new Date(), await this.timezoneOf(userId));
    const entries = await this.prisma.client.trackerEntry.findMany({
      where: { userId, dayKey: today, trackerId: { in: rows.map((r) => r.id) } },
      // (trackerId, dayKey) is unique, so this cannot truncate a rating.
      take: rows.length,
      select: { trackerId: true, value: true },
    });
    const byTracker = new Map(entries.map((e) => [e.trackerId, e.value]));
    return rows.map((r) => this.toDto(r, byTracker.get(r.id) ?? null));
  }

  async create(userId: string, input: CreateTrackerInput): Promise<TrackerDTO> {
    const count = await this.prisma.client.tracker.count({ where: { userId, active: true } });
    if (count >= MAX_TRACKERS) {
      throw new BadRequestException(
        `You can track ${MAX_TRACKERS} things at once. Archive one to add another.`,
      );
    }
    const existing = await this.prisma.client.tracker.findFirst({
      where: { userId, name: input.name },
      select: { id: true, active: true },
    });
    if (existing) {
      // Re-adding something archived brings it back WITH its history, rather
      // than failing on the unique constraint or starting an empty second one.
      if (!existing.active) {
        const revived = await this.prisma.client.tracker.update({
          where: { id: existing.id },
          data: { active: true, position: count },
        });
        return this.toDto(revived, null);
      }
      throw new BadRequestException(`You are already tracking "${input.name}".`);
    }

    const row = await this.prisma.client.tracker.create({
      data: {
        userId,
        name: input.name,
        emoji: input.emoji ?? null,
        direction: input.direction,
        lowLabel: input.lowLabel ?? null,
        highLabel: input.highLabel ?? null,
        position: count,
      },
    });
    await this.timeline.write({
      userId,
      type: 'tracker.created',
      source: 'trackers',
      title: `Started tracking ${row.name}`,
      refType: 'tracker',
      refId: row.id,
    });
    return this.toDto(row, null);
  }

  async update(userId: string, id: string, input: UpdateTrackerInput): Promise<TrackerDTO> {
    await this.owned(userId, id);
    const row = await this.prisma.client.tracker.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.emoji !== undefined ? { emoji: input.emoji } : {}),
        ...(input.direction !== undefined ? { direction: input.direction } : {}),
        ...(input.lowLabel !== undefined ? { lowLabel: input.lowLabel } : {}),
        ...(input.highLabel !== undefined ? { highLabel: input.highLabel } : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
        ...(input.position !== undefined ? { position: input.position } : {}),
      },
    });
    return this.toDto(row, null);
  }

  /**
   * Archive, never delete.
   *
   * The ratings are the point. Removing a tracker you have answered for three
   * months should stop it asking, not throw away the three months — and the
   * cross-domain contrast is exactly the thing that needs the history.
   */
  async archive(userId: string, id: string): Promise<{ ok: true }> {
    await this.owned(userId, id);
    await this.prisma.client.tracker.update({ where: { id }, data: { active: false } });
    return { ok: true };
  }

  /** Rate a day. Rating it again is an edit, not a second row. */
  async log(userId: string, id: string, input: LogTrackerInput): Promise<TrackerEntryDTO> {
    const tracker = await this.owned(userId, id);
    const dayKey = input.dayKey ?? dayKeyInTz(new Date(), await this.timezoneOf(userId));

    const row = await this.prisma.client.trackerEntry.upsert({
      where: { trackerId_dayKey: { trackerId: id, dayKey } },
      create: { userId, trackerId: id, dayKey, value: input.value, note: input.note ?? null },
      update: { value: input.value, ...(input.note !== undefined ? { note: input.note } : {}) },
    });
    await this.timeline.write({
      userId,
      type: 'tracker.logged',
      source: 'trackers',
      title: `${tracker.name}: ${input.value}/10`,
      summary: input.note ?? undefined,
      refType: 'tracker',
      refId: id,
    });
    return this.toEntryDto(row);
  }

  private toEntryDto(row: TrackerEntry): TrackerEntryDTO {
    return serializeTrackerEntry(row);
  }

  /** One tracker's recent days, oldest first, for a chart. */
  async history(userId: string, id: string, days = WINDOW_DAYS): Promise<TrackerEntryDTO[]> {
    await this.owned(userId, id);
    const rows = await this.prisma.client.trackerEntry.findMany({
      where: { userId, trackerId: id },
      orderBy: { dayKey: 'desc' },
      take: Math.min(days, MAX_ENTRIES),
    });
    return rows.reverse().map((r) => this.toEntryDto(r));
  }

  /**
   * Every active tracker with its window, for the Progress page.
   *
   * One query for the entries rather than one per tracker: the same N+1 that
   * turned a Google sync into five minutes.
   */
  async overview(
    userId: string,
    days = 60,
  ): Promise<
    { tracker: TrackerDTO; points: { dayKey: string; value: number }[]; sentence: string | null }[]
  > {
    const trackers = await this.list(userId);
    if (trackers.length === 0) return [];

    const rows = await this.prisma.client.trackerEntry.findMany({
      where: { userId, trackerId: { in: trackers.map((t) => t.id) } },
      orderBy: { dayKey: 'desc' },
      take: Math.min(days * trackers.length, MAX_ENTRIES),
      select: { trackerId: true, dayKey: true, value: true },
    });

    return assembleTrackerOverview(trackers, rows);
  }

  /** What the AI is told. One line per tracker, and nothing when there are none. */
  async summarize(userId: string): Promise<string> {
    const overview = await this.overview(userId, 30);
    return summarizeTrackers(overview);
  }
}
