import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  isAllDay,
  parseGoogleDate,
  type GoogleCalendarConnector,
  type GoogleEvent,
  type SyncResult,
} from '@atlas/connectors';
import type { Event } from '@atlas/db';
import { PrismaService } from '../../core/prisma.service.js';
import { TimelineService } from '../../core/timeline.service.js';
import { ConnectorsService } from '../../core/connectors.service.js';

const CONNECTOR_ID = 'google-calendar';
/** How far back/forward to sync. Past events matter little; a year ahead covers planning. */
const WINDOW_PAST_DAYS = 30;
const WINDOW_FUTURE_DAYS = 365;
/** Safety rail: never push a huge historical backlog into someone's real calendar. */
const MAX_PUSH_PER_SYNC = 50;

/**
 * Two-way sync between Atlas `events` and Google Calendar.
 *
 * Conflict policy (chosen deliberately — see docs/adr/0004-google-calendar-sync.md):
 * **Google wins.** Google is where invites and other people's edits land, so on
 * every pull its version overwrites the Atlas row. Atlas-authored events are
 * pushed once, after which Google owns them.
 *
 * Atlas never deletes anything from Google. A local delete stays local; only a
 * deletion made *in* Google removes the Atlas row. Destroying real calendar
 * data on the strength of a sync bug is not a risk worth taking.
 */
@Injectable()
export class GoogleSyncService {
  private readonly logger = new Logger(GoogleSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly timeline: TimelineService,
    private readonly connectors: ConnectorsService,
  ) {}

  /** The connector, or a 400 if Google isn't configured on this deployment. */
  private connector(): GoogleCalendarConnector {
    const connector = this.connectors.googleCalendar;
    if (!connector) {
      throw new BadRequestException(
        'Google Calendar is not configured on this server (missing GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET).',
      );
    }
    return connector;
  }

  isConfigured(): boolean {
    return this.connectors.googleCalendar !== null;
  }

  async isConnected(userId: string): Promise<boolean> {
    if (!this.connectors.googleCalendar) return false;
    const cred = await this.prisma.client.credential.findUnique({
      where: { userId_connector_label: { userId, connector: CONNECTOR_ID, label: 'default' } },
    });
    return cred !== null;
  }

  authUrl(state: string): string {
    return this.connector().authUrl(state);
  }

  /** Exchange the OAuth code and store the tokens encrypted. */
  async completeOAuth(userId: string, code: string): Promise<void> {
    const credential = await this.connector().exchangeCode(code);
    await this.connectors.saveCredential(userId, CONNECTOR_ID, credential, {
      meta: { scope: credential.scope, connectedAt: new Date().toISOString() },
    });
    await this.timeline.write({
      userId,
      type: 'connector.connected',
      source: CONNECTOR_ID,
      title: 'Connected Google Calendar',
    });
  }

  async disconnect(userId: string): Promise<{ ok: true }> {
    await this.prisma.client.credential.deleteMany({
      where: { userId, connector: CONNECTOR_ID },
    });
    // Local copies of Google events stay — they're the user's data and the AI
    // still benefits from them. Only the ability to sync goes away.
    return { ok: true };
  }

  private toEventInput(event: Event) {
    return {
      title: event.title,
      description: event.description,
      location: event.location,
      startAt: event.startAt,
      endAt: event.endAt,
      allDay: event.allDay,
    };
  }

  /** Pull from Google (Google wins), then push events Atlas has never synced. */
  async sync(userId: string): Promise<SyncResult> {
    const connector = this.connector();
    const ctx = this.connectors.contextFor(userId, CONNECTOR_ID);
    const result: SyncResult = {
      connector: CONNECTOR_ID,
      imported: 0,
      updated: 0,
      pushed: 0,
      deleted: 0,
      errors: [],
    };

    const now = Date.now();
    const timeMin = new Date(now - WINDOW_PAST_DAYS * 86_400_000);
    const timeMax = new Date(now + WINDOW_FUTURE_DAYS * 86_400_000);

    const remote = await connector.listEvents(ctx, { timeMin, timeMax });

    for (const gEvent of remote) {
      try {
        if (gEvent.status === 'cancelled') {
          result.deleted += await this.applyRemoteDeletion(userId, gEvent.id);
          continue;
        }
        const applied = await this.applyRemoteEvent(userId, gEvent);
        if (applied === 'imported') result.imported++;
        else if (applied === 'updated') result.updated++;
      } catch (err) {
        result.errors.push(
          `event ${gEvent.id}: ${err instanceof Error ? err.message : 'unknown error'}`,
        );
      }
    }

    // Push Atlas-authored events that have never reached Google. Once pushed,
    // the row flips to source=google-calendar so later pulls match it instead of
    // creating a duplicate.
    const unsynced = await this.prisma.client.event.findMany({
      where: { userId, source: 'atlas', startAt: { gte: timeMin, lte: timeMax } },
      take: MAX_PUSH_PER_SYNC,
    });

    for (const event of unsynced) {
      try {
        const created = await connector.createEvent(ctx, this.toEventInput(event));
        await this.prisma.client.event.update({
          where: { id: event.id },
          data: { source: CONNECTOR_ID, externalId: created.id },
        });
        result.pushed++;
      } catch (err) {
        result.errors.push(
          `push ${event.id}: ${err instanceof Error ? err.message : 'unknown error'}`,
        );
      }
    }

    await this.connectors.saveCredentialMeta(userId, CONNECTOR_ID, {
      lastSyncedAt: new Date().toISOString(),
    });

    if (result.errors.length > 0) {
      this.logger.warn(`Google sync finished with ${result.errors.length} error(s) for user ${userId}`);
    }
    return result;
  }

  private async applyRemoteDeletion(userId: string, googleId: string): Promise<number> {
    const { count } = await this.prisma.client.event.deleteMany({
      where: { userId, source: CONNECTOR_ID, externalId: googleId },
    });
    if (count > 0) {
      await this.timeline.write({
        userId,
        type: 'event.deleted',
        source: CONNECTOR_ID,
        title: 'Event removed in Google Calendar',
        refType: 'event',
        refId: googleId,
      });
    }
    return count;
  }

  private async applyRemoteEvent(
    userId: string,
    gEvent: GoogleEvent,
  ): Promise<'imported' | 'updated' | 'skipped'> {
    const startAt = parseGoogleDate(gEvent.start);
    const endAt = parseGoogleDate(gEvent.end);
    // Google can return events without usable times (rare, but they exist).
    // Skipping beats writing a row that violates endAt >= startAt.
    if (!startAt || !endAt || endAt < startAt) return 'skipped';

    const data = {
      title: gEvent.summary?.trim() || '(untitled)',
      description: gEvent.description ?? null,
      location: gEvent.location ?? null,
      startAt,
      endAt,
      allDay: isAllDay(gEvent),
    };

    const existing = await this.prisma.client.event.findUnique({
      where: {
        userId_source_externalId: { userId, source: CONNECTOR_ID, externalId: gEvent.id },
      },
    });

    if (!existing) {
      const created = await this.prisma.client.event.create({
        data: { userId, source: CONNECTOR_ID, externalId: gEvent.id, ...data },
      });
      await this.timeline.write({
        userId,
        type: 'event.imported',
        source: CONNECTOR_ID,
        title: `Imported from Google: ${created.title}`,
        refType: 'event',
        refId: created.id,
        occurredAt: created.startAt,
      });
      return 'imported';
    }

    // Google wins — but only write when something actually differs, so the
    // timeline isn't spammed with a no-op update on every sync.
    if (
      existing.title === data.title &&
      existing.description === data.description &&
      existing.location === data.location &&
      existing.startAt.getTime() === data.startAt.getTime() &&
      existing.endAt.getTime() === data.endAt.getTime() &&
      existing.allDay === data.allDay
    ) {
      return 'skipped';
    }

    await this.prisma.client.event.update({ where: { id: existing.id }, data });
    await this.timeline.write({
      userId,
      type: 'event.updated',
      source: CONNECTOR_ID,
      title: `Updated from Google: ${data.title}`,
      refType: 'event',
      refId: existing.id,
    });
    return 'updated';
  }
}
