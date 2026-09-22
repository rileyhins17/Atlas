import { Injectable } from '@nestjs/common';
import {
  ConnectorAuthExpiredError,
  ConnectorNotConfiguredError,
  ConnectorScopeError,
  type GoogleHealthConnector,
  type HealthDaily,
  type HealthExercise,
  type HealthSleep,
} from '@atlas/connectors';
import type { Prisma, WearableActivity, WearableDay } from '@atlas/db';
import {
  summarizeWearables,
  type WearableActivityDTO,
  type WearableDayDTO,
  type WearablesStatusDTO,
  type WearablesSummaryDTO,
  type WearablesSyncResultDTO,
} from '@atlas/shared';
import { PrismaService } from '../../core/prisma.service.js';
import { ConnectorsService } from '../../core/connectors.service.js';
import { TimelineService } from '../../core/timeline.service.js';
import { UserTimezoneService } from '../../core/user-timezone.service.js';
import { dayKeyInTz, dayKeyStartUtc, shiftDayKey } from '../../core/time.js';

export const CONNECTOR_ID = 'google-health';

/** How far back the first sync reaches. Enough for patterns to have material. */
const FIRST_SYNC_DAYS = 30;
/**
 * Every later sync re-reads a few days behind the newest one it holds. Google
 * revises recent days after the fact — sleep stages finish processing hours
 * later, steps backfill when the watch next syncs — so "only fetch what is
 * new" would freeze each day at its first, incomplete reading.
 */
const OVERLAP_DAYS = 3;
/**
 * Sync is triggered by opening the app, not by a timer (an idle API makes no
 * database calls — see CLAUDE.md), so the same person opening Today twice in a
 * minute must not cost Google two round trips.
 */
const MIN_SYNC_INTERVAL_MS = 10 * 60_000;
/** The most workouts ever shown or handed to the model at once. */
const RECENT_ACTIVITIES = 20;

/**
 * One row per local day, with the night's sleep folded into the day it ended.
 *
 * The main sleep wins; with none flagged (still processing, or an older
 * device) the longest session does. Naps never replace a night.
 */
export function buildWearableDays(
  daily: HealthDaily[],
  sleeps: HealthSleep[],
): (HealthDaily & { sleep?: HealthSleep })[] {
  const byDay = new Map<string, HealthDaily & { sleep?: HealthSleep }>();
  for (const d of daily) byDay.set(d.day, { ...d });
  for (const s of sleeps) {
    const row = byDay.get(s.day) ?? { day: s.day };
    const current = row.sleep;
    const better =
      !current ||
      (s.mainSleep && !current.mainSleep) ||
      (s.mainSleep === current.mainSleep && s.minutesAsleep > current.minutesAsleep);
    if (better) row.sleep = s;
    byDay.set(s.day, row);
  }
  return [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day));
}

function dayToDto(d: WearableDay): WearableDayDTO {
  return {
    dayKey: d.dayKey,
    steps: d.steps,
    restingHeartRate: d.restingHeartRate,
    hrvMs: d.hrvMs,
    sleepMinutes: d.sleepMinutes,
    sleepStart: d.sleepStart?.toISOString() ?? null,
    sleepEnd: d.sleepEnd?.toISOString() ?? null,
    deepMinutes: d.deepMinutes,
    remMinutes: d.remMinutes,
  };
}

function activityToDto(a: WearableActivity): WearableActivityDTO {
  return {
    id: a.id,
    type: a.type,
    name: a.name,
    startAt: a.startAt.toISOString(),
    endAt: a.endAt.toISOString(),
    activeMinutes: a.activeMinutes,
    calories: a.calories,
    avgHeartRate: a.avgHeartRate,
    distanceMeters: a.distanceMeters,
  };
}

function activityData(e: HealthExercise) {
  return {
    type: e.type,
    name: e.name.slice(0, 200),
    startAt: e.startAt,
    endAt: e.endAt,
    activeMinutes: e.activeMinutes,
    calories: e.calories,
    avgHeartRate: e.avgHeartRate,
    distanceMeters: e.distanceMeters,
    steps: e.steps,
  };
}

/**
 * Fitbit and Pixel Watch data, through the Google Health API.
 *
 * Owns reconciliation — the connector never sees the database. Read-only
 * towards Google: Atlas never writes health data back.
 */
@Injectable()
export class WearablesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly connectors: ConnectorsService,
    private readonly timeline: TimelineService,
    private readonly timezones: UserTimezoneService,
  ) {}

  private connector(): GoogleHealthConnector {
    const c = this.connectors.googleHealth;
    if (!c) {
      throw new ConnectorNotConfiguredError(
        CONNECTOR_ID,
        'Google Health is not set up on this server yet.',
      );
    }
    return c;
  }

  private credential(userId: string) {
    return this.prisma.client.credential.findUnique({
      where: { userId_connector_label: { userId, connector: CONNECTOR_ID, label: 'default' } },
      select: { meta: true, status: true },
    });
  }

  private static lastSyncedAt(meta: Prisma.JsonValue | null | undefined): string | null {
    const value = (meta as Record<string, unknown> | null)?.lastSyncedAt;
    return typeof value === 'string' ? value : null;
  }

  async status(userId: string): Promise<WearablesStatusDTO> {
    const connector = this.connectors.googleHealth;
    const cred = connector ? await this.credential(userId) : null;
    return {
      configured: connector !== null,
      connected: cred !== null,
      // 'revoked' is written by sync when Google refuses the grant — weekly,
      // while the consent screen is in Testing. The UI offers Reconnect
      // instead of pretending all is well; a fresh grant sets it back.
      needsReconnect: cred !== null && cred.status !== 'active',
      // Not a secret: it is a public callback that appears in the URL bar
      // during consent, and Google refuses before Atlas is involved unless it
      // is registered verbatim — so Settings shows it.
      redirectUri: connector?.redirectUri,
      lastSyncedAt: WearablesService.lastSyncedAt(cred?.meta),
    };
  }

  authUrl(state: string): string {
    return this.connector().authUrl(state);
  }

  async completeOAuth(userId: string, code: string): Promise<void> {
    const credential = await this.connector().exchangeCode(code);
    await this.connectors.saveCredential(userId, CONNECTOR_ID, credential, {
      meta: { scope: credential.scope, connectedAt: new Date().toISOString() },
    });
    await this.timeline.write({
      userId,
      type: 'connector.connected',
      source: CONNECTOR_ID,
      title: 'Connected Google Health',
    });
  }

  /**
   * Stop syncing. What was imported stays unless `forget` — the same default
   * as Calendar, with deletion one explicit choice away because this is
   * health data and someone may want it gone rather than merely frozen.
   */
  async disconnect(userId: string, forget: boolean): Promise<{ ok: true }> {
    await this.prisma.client.$transaction([
      this.prisma.client.credential.deleteMany({ where: { userId, connector: CONNECTOR_ID } }),
      ...(forget
        ? [
            this.prisma.client.wearableDay.deleteMany({ where: { userId } }),
            this.prisma.client.wearableActivity.deleteMany({ where: { userId } }),
          ]
        : []),
    ]);
    return { ok: true };
  }

  async sync(userId: string, opts: { force?: boolean } = {}): Promise<WearablesSyncResultDTO> {
    const connector = this.connector();
    const cred = await this.credential(userId);
    if (!cred) {
      throw new ConnectorNotConfiguredError(
        CONNECTOR_ID,
        'Google Health is not connected. Connect it in Settings.',
      );
    }
    const last = WearablesService.lastSyncedAt(cred.meta);
    if (!opts.force && last && Date.now() - Date.parse(last) < MIN_SYNC_INTERVAL_MS) {
      return { ran: false, days: 0, activities: 0, newActivities: 0 };
    }

    const tz = await this.timezones.get(userId);
    const today = dayKeyInTz(new Date(), tz);
    const floor = shiftDayKey(today, -FIRST_SYNC_DAYS);
    const newest = await this.prisma.client.wearableDay.findFirst({
      where: { userId },
      orderBy: { dayKey: 'desc' },
      select: { dayKey: true },
    });
    const overlap = newest ? shiftDayKey(newest.dayKey, -OVERLAP_DAYS) : floor;
    const from = overlap > floor ? overlap : floor;
    const to = shiftDayKey(today, 1);

    const ctx = this.connectors.contextFor(userId, CONNECTOR_ID);
    let fetched: [HealthDaily[], HealthSleep[], HealthExercise[]];
    try {
      fetched = await Promise.all([
        connector.daily(ctx, from, to),
        // A night ending on `from` began the evening before.
        connector.sleep(ctx, dayKeyStartUtc(from, tz)),
        connector.exercises(ctx, from),
      ]);
    } catch (err) {
      if (err instanceof ConnectorAuthExpiredError || err instanceof ConnectorScopeError) {
        await this.prisma.client.credential.updateMany({
          where: { userId, connector: CONNECTOR_ID },
          data: { status: 'revoked' },
        });
      }
      throw err;
    }
    const [daily, sleeps, exercises] = fetched;

    const days = buildWearableDays(daily, sleeps);
    const dayWrites = days.map((d) => {
      const data = {
        steps: d.steps ?? null,
        restingHeartRate: d.restingHeartRate === undefined ? null : Math.round(d.restingHeartRate),
        hrvMs: d.hrvMs ?? null,
        sleepMinutes: d.sleep?.minutesAsleep ?? null,
        sleepStart: d.sleep?.startAt ?? null,
        sleepEnd: d.sleep?.endAt ?? null,
        deepMinutes: d.sleep?.deepMinutes ?? null,
        remMinutes: d.sleep?.remMinutes ?? null,
      };
      return this.prisma.client.wearableDay.upsert({
        where: { userId_dayKey: { userId, dayKey: d.day } },
        create: { userId, dayKey: d.day, ...data },
        update: data,
      });
    });

    const known = new Set(
      (
        await this.prisma.client.wearableActivity.findMany({
          where: { userId, externalId: { in: exercises.map((e) => e.id) } },
          select: { externalId: true },
        })
      ).map((a) => a.externalId),
    );
    const activityWrites = exercises.map((e) =>
      this.prisma.client.wearableActivity.upsert({
        where: { userId_externalId: { userId, externalId: e.id } },
        create: { userId, externalId: e.id, ...activityData(e) },
        update: activityData(e),
      }),
    );

    await this.prisma.client.$transaction([...dayWrites, ...activityWrites]);

    // Only NEW workouts reach the timeline — a re-read of last Tuesday's run is
    // not something that happened today.
    const fresh = exercises.filter((e) => !known.has(e.id));
    await this.timeline.writeMany(
      fresh.map((e) => ({
        userId,
        type: 'wearables.activity',
        source: 'wearables',
        title: `${e.name}${e.activeMinutes ? ` · ${e.activeMinutes} min` : ''}`,
        summary: 'Recorded by your watch',
        refType: 'wearable_activity',
        refId: e.id,
        occurredAt: e.startAt,
      })),
    );

    await this.connectors.saveCredentialMeta(userId, CONNECTOR_ID, {
      lastSyncedAt: new Date().toISOString(),
    });
    return { ran: true, days: days.length, activities: exercises.length, newActivities: fresh.length };
  }

  async summary(userId: string, days: number): Promise<WearablesSummaryDTO> {
    const tz = await this.timezones.get(userId);
    const today = dayKeyInTz(new Date(), tz);
    const [rows, activities, cred] = await Promise.all([
      this.prisma.client.wearableDay.findMany({
        where: { userId, dayKey: { gte: shiftDayKey(today, -(days - 1)) } },
        orderBy: { dayKey: 'asc' },
        take: days,
      }),
      this.prisma.client.wearableActivity.findMany({
        where: { userId, startAt: { gte: dayKeyStartUtc(shiftDayKey(today, -(days - 1)), tz) } },
        orderBy: { startAt: 'desc' },
        take: RECENT_ACTIVITIES,
      }),
      this.credential(userId),
    ]);
    return {
      lastSyncedAt: WearablesService.lastSyncedAt(cred?.meta),
      days: rows.map(dayToDto),
      activities: activities.map(activityToDto),
    };
  }

  /** The model's view — nothing at all for someone without a watch. */
  async summarize(userId: string): Promise<string> {
    const cred = await this.credential(userId);
    if (!cred) return 'No watch connected.';
    const tz = await this.timezones.get(userId);
    const { days, activities } = await this.summary(userId, 14);
    return summarizeWearables(days, activities.slice(0, 5), dayKeyInTz(new Date(), tz));
  }
}
