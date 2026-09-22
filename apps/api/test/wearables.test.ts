import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HealthExercise, HealthSleep } from '@atlas/connectors';
import { WearablesService, buildWearableDays } from '../src/modules/wearables/wearables.service.js';
import { googleHealthRedirectUri } from '../src/core/connectors.service.js';

const sleep = (day: string, over: Partial<HealthSleep> = {}): HealthSleep => ({
  id: `s-${day}-${Math.random()}`,
  day,
  startAt: new Date(`${day}T03:00:00Z`),
  endAt: new Date(`${day}T10:00:00Z`),
  minutesAsleep: 400,
  deepMinutes: 60,
  remMinutes: 80,
  mainSleep: true,
  ...over,
});

const run = (id: string): HealthExercise => ({
  id,
  type: 'RUNNING',
  name: 'Run',
  startAt: new Date('2026-09-21T11:00:00Z'),
  endAt: new Date('2026-09-21T11:35:00Z'),
  activeMinutes: 32,
  calories: 300,
  avgHeartRate: 150,
  distanceMeters: 5012,
  steps: 5000,
});

describe('buildWearableDays', () => {
  it('folds the night into the day it ended, alongside that day’s totals', () => {
    const days = buildWearableDays(
      [{ day: '2026-09-22', steps: 3000, restingHeartRate: 57 }],
      [sleep('2026-09-22')],
    );
    expect(days).toHaveLength(1);
    expect(days[0]).toMatchObject({ day: '2026-09-22', steps: 3000, restingHeartRate: 57 });
    expect(days[0]!.sleep?.minutesAsleep).toBe(400);
  });

  it('never lets a nap replace the night, even a long one', () => {
    const [day] = buildWearableDays(
      [],
      [sleep('2026-09-22', { minutesAsleep: 380 }), sleep('2026-09-22', { mainSleep: false, minutesAsleep: 500 })],
    );
    expect(day!.sleep?.minutesAsleep).toBe(380);
  });

  it('keeps a day with sleep but no daily totals', () => {
    expect(buildWearableDays([], [sleep('2026-09-21')]).map((d) => d.day)).toEqual(['2026-09-21']);
  });
});

describe('googleHealthRedirectUri', () => {
  it('derives from the Calendar callback', () => {
    expect(
      googleHealthRedirectUri({ GOOGLE_REDIRECT_URI: 'https://atlaslife.app/api/connectors/google/callback' }),
    ).toBe('https://atlaslife.app/api/connectors/google-health/callback');
  });

  it('prefers an explicit value', () => {
    expect(
      googleHealthRedirectUri({
        GOOGLE_REDIRECT_URI: 'https://x/connectors/google/callback',
        GOOGLE_HEALTH_REDIRECT_URI: 'https://y/cb',
      }),
    ).toBe('https://y/cb');
  });

  it('refuses to reuse the Calendar callback when it cannot derive one', () => {
    // Otherwise Health consent would land in the Calendar callback.
    expect(googleHealthRedirectUri({ GOOGLE_REDIRECT_URI: 'https://x/oauth' })).toBeNull();
  });
});

function makeService(opts: { lastSyncedAt?: string | null; newestDay?: string | null; knownIds?: string[] } = {}) {
  const connector = {
    redirectUri: 'https://atlaslife.app/api/connectors/google-health/callback',
    daily: vi.fn().mockResolvedValue([{ day: '2026-09-22', steps: 3000 }]),
    sleep: vi.fn().mockResolvedValue([sleep('2026-09-22')]),
    exercises: vi.fn().mockResolvedValue([run('ex-old'), run('ex-new')]),
  };
  const tx = vi.fn().mockResolvedValue([]);
  const prisma = {
    client: {
      credential: {
        findUnique: vi.fn().mockResolvedValue(
          opts.lastSyncedAt === undefined ? { meta: {} } : { meta: { lastSyncedAt: opts.lastSyncedAt } },
        ),
        deleteMany: vi.fn().mockReturnValue('del-cred'),
      },
      wearableDay: {
        findFirst: vi.fn().mockResolvedValue(opts.newestDay ? { dayKey: opts.newestDay } : null),
        upsert: vi.fn((args: unknown) => ({ op: 'day', args })),
        deleteMany: vi.fn().mockReturnValue('del-days'),
      },
      wearableActivity: {
        findMany: vi.fn().mockResolvedValue((opts.knownIds ?? []).map((externalId) => ({ externalId }))),
        upsert: vi.fn((args: unknown) => ({ op: 'activity', args })),
        deleteMany: vi.fn().mockReturnValue('del-acts'),
      },
      $transaction: tx,
    },
  };
  const connectors = {
    googleHealth: connector,
    contextFor: vi.fn().mockReturnValue({}),
    saveCredentialMeta: vi.fn().mockResolvedValue(undefined),
  };
  const timeline = { write: vi.fn(), writeMany: vi.fn().mockResolvedValue(undefined) };
  const timezones = { get: vi.fn().mockResolvedValue('America/Toronto') };
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const service = new WearablesService(prisma as any, connectors as any, timeline as any, timezones as any);
  /* eslint-enable @typescript-eslint/no-explicit-any */
  return { service, connector, prisma, connectors, timeline, tx };
}

describe('WearablesService.sync', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // 2pm in Toronto on 22 Sep.
    vi.setSystemTime(new Date('2026-09-22T18:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('reaches back 30 days on the first sync, through tomorrow', async () => {
    const { service, connector } = makeService();
    await service.sync('u1');
    expect(connector.daily).toHaveBeenCalledWith(expect.anything(), '2026-08-23', '2026-09-23');
    expect(connector.exercises).toHaveBeenCalledWith(expect.anything(), '2026-08-23');
    // Sleep ending on the first day began the evening before: local midnight, not UTC.
    expect(connector.sleep.mock.calls[0]![1].toISOString()).toBe('2026-08-23T04:00:00.000Z');
  });

  it('re-reads three days behind the newest it holds, because Google revises them', async () => {
    const { service, connector } = makeService({ newestDay: '2026-09-21' });
    await service.sync('u1');
    expect(connector.daily).toHaveBeenCalledWith(expect.anything(), '2026-09-18', '2026-09-23');
  });

  it('skips itself when it ran minutes ago, unless forced', async () => {
    const recent = new Date(Date.now() - 2 * 60_000).toISOString();
    const { service, connector } = makeService({ lastSyncedAt: recent });
    expect(await service.sync('u1')).toEqual({ ran: false, days: 0, activities: 0, newActivities: 0 });
    expect(connector.daily).not.toHaveBeenCalled();
    await service.sync('u1', { force: true });
    expect(connector.daily).toHaveBeenCalled();
  });

  it('writes everything in one transaction, and only new workouts to the timeline', async () => {
    const { service, tx, timeline, connectors } = makeService({ knownIds: ['ex-old'] });
    const out = await service.sync('u1');
    expect(out).toEqual({ ran: true, days: 1, activities: 2, newActivities: 1 });
    expect(tx).toHaveBeenCalledTimes(1);
    expect(tx.mock.calls[0]![0]).toHaveLength(3); // one day + two activities
    const rows = timeline.writeMany.mock.calls[0]![0];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ type: 'wearables.activity', title: 'Run · 32 min', refId: 'ex-new' });
    expect(connectors.saveCredentialMeta).toHaveBeenCalledWith('u1', 'google-health', {
      lastSyncedAt: expect.any(String),
    });
  });

  it('stores sleep as the day’s own columns, and unknowns as null rather than zero', async () => {
    const { service, prisma } = makeService();
    await service.sync('u1');
    const args = prisma.client.wearableDay.upsert.mock.calls[0]![0] as {
      create: Record<string, unknown>;
    };
    expect(args.create).toMatchObject({
      userId: 'u1',
      dayKey: '2026-09-22',
      steps: 3000,
      restingHeartRate: null,
      hrvMs: null,
      sleepMinutes: 400,
      deepMinutes: 60,
    });
  });

  it('refuses to sync an account that never connected', async () => {
    const { service, prisma } = makeService();
    prisma.client.credential.findUnique.mockResolvedValue(null);
    await expect(service.sync('u1')).rejects.toThrow(/not connected/);
  });
});

describe('WearablesService.disconnect', () => {
  it('keeps imported data by default', async () => {
    const { service, tx } = makeService();
    await service.disconnect('u1', false);
    expect(tx.mock.calls[0]![0]).toEqual(['del-cred']);
  });

  it('deletes it too when asked', async () => {
    const { service, tx } = makeService();
    await service.disconnect('u1', true);
    expect(tx.mock.calls[0]![0]).toEqual(['del-cred', 'del-days', 'del-acts']);
  });
});

describe('WearablesService expired grants', () => {
  it('marks the grant for reconnection when Google refuses it, and still throws', async () => {
    const { ConnectorAuthExpiredError } = await import('@atlas/connectors');
    const { service, connector, prisma } = makeService();
    (prisma.client.credential as Record<string, unknown>).updateMany = vi.fn().mockResolvedValue({});
    connector.daily.mockRejectedValue(new ConnectorAuthExpiredError('google-health', 'expired'));
    await expect(service.sync('u1')).rejects.toThrow('expired');
    expect(
      (prisma.client.credential as unknown as { updateMany: ReturnType<typeof vi.fn> }).updateMany,
    ).toHaveBeenCalledWith({ where: { userId: 'u1', connector: 'google-health' }, data: { status: 'revoked' } });
  });

  it('reports a revoked grant as needing reconnection', async () => {
    const { service, prisma } = makeService();
    prisma.client.credential.findUnique.mockResolvedValue({ meta: {}, status: 'revoked' });
    expect(await service.status('u1')).toMatchObject({ connected: true, needsReconnect: true });
  });
});
