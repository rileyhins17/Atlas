import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  GOOGLE_HEALTH_SCOPES,
  GoogleHealthConnector,
  dayKeyOf,
  durationMinutes,
  mapExercise,
  mapSleep,
  mergeDaily,
} from '../src/google-health.js';
import { ConnectorAuthExpiredError, ConnectorScopeError, type ConnectorContext } from '../src/connector.js';

const connector = new GoogleHealthConnector({
  clientId: 'client-id',
  clientSecret: 'client-secret',
  redirectUri: 'https://atlaslife.app/api/connectors/google-health/callback',
});

function ctxWith(secret: Record<string, unknown> | null): ConnectorContext {
  return { getSecret: vi.fn().mockResolvedValue(secret), saveSecret: vi.fn() };
}

const valid = () => ctxWith({ accessToken: 'tok', refreshToken: 'ref', expiresAt: Date.now() + 3_600_000 });

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

afterEach(() => vi.unstubAllGlobals());

describe('GoogleHealthConnector.authUrl', () => {
  it('asks only for read access to activity, heart metrics and sleep', () => {
    const url = new URL(connector.authUrl('state-1'));
    const scopes = (url.searchParams.get('scope') ?? '').split(' ');
    expect(scopes).toEqual(GOOGLE_HEALTH_SCOPES);
    expect(scopes.every((s) => s.endsWith('.readonly'))).toBe(true);
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('state')).toBe('state-1');
    expect(url.searchParams.get('redirect_uri')).toContain('/connectors/google-health/callback');
  });
});

describe('pure mapping', () => {
  it('reads a google.type.Date as a day key', () => {
    expect(dayKeyOf({ year: 2026, month: 3, day: 8 })).toBe('2026-03-08');
    expect(dayKeyOf({ year: 2026, month: 3 })).toBeNull();
  });

  it('reads protobuf durations as minutes', () => {
    expect(durationMinutes('1830s')).toBe(31);
    expect(durationMinutes('90.5s')).toBe(2);
    expect(durationMinutes(undefined)).toBeNull();
  });

  it('keys a night of sleep by the day it ended, and parses int64 strings', () => {
    const s = mapSleep({
      name: 'users/me/dataTypes/sleep/dataPoints/abc',
      sleep: {
        interval: {
          startTime: '2026-09-22T03:30:00Z',
          endTime: '2026-09-22T10:45:00Z',
          civilEndTime: { date: { year: 2026, month: 9, day: 22 } },
        },
        summary: {
          minutesAsleep: '402',
          stagesSummary: [
            { type: 'DEEP', minutes: '71' },
            { type: 'REM', minutes: '95' },
            { type: 'LIGHT', minutes: '236' },
          ],
        },
        metadata: { mainSleep: true },
      },
    });
    expect(s).toMatchObject({
      id: 'users/me/dataTypes/sleep/dataPoints/abc',
      day: '2026-09-22',
      minutesAsleep: 402,
      deepMinutes: 71,
      remMinutes: 95,
      mainSleep: true,
    });
  });

  it('treats a nap as not the main sleep, and an unprocessed session as main', () => {
    const base = { interval: { startTime: '2026-09-22T18:00:00Z', endTime: '2026-09-22T18:40:00Z' } };
    expect(mapSleep({ sleep: { ...base, metadata: { nap: true } } })?.mainSleep).toBe(false);
    expect(mapSleep({ sleep: base })?.mainSleep).toBe(true);
    // Falls back to the interval when no summary has been computed yet.
    expect(mapSleep({ sleep: base })?.minutesAsleep).toBe(40);
  });

  it('maps a workout, converting millimetres and string counts', () => {
    const e = mapExercise({
      name: 'users/me/dataTypes/exercise/dataPoints/run1',
      exercise: {
        displayName: 'Run',
        exerciseType: 'RUNNING',
        activeDuration: '1920s',
        interval: { startTime: '2026-09-21T11:00:00Z', endTime: '2026-09-21T11:35:00Z' },
        metricsSummary: {
          caloriesKcal: 311.6,
          averageHeartRateBeatsPerMinute: '152',
          distanceMillimeters: 5_012_345,
          steps: '5120',
        },
      },
    });
    expect(e).toMatchObject({
      id: 'users/me/dataTypes/exercise/dataPoints/run1',
      type: 'RUNNING',
      name: 'Run',
      activeMinutes: 32,
      calories: 312,
      avgHeartRate: 152,
      distanceMeters: 5012,
      steps: 5120,
    });
  });

  it('names an unnamed workout from its type', () => {
    const e = mapExercise({
      exercise: {
        exerciseType: 'STRENGTH_TRAINING',
        interval: { startTime: '2026-09-21T11:00:00Z', endTime: '2026-09-21T11:45:00Z' },
      },
    });
    expect(e?.name).toBe('Strength training');
    expect(e?.activeMinutes).toBe(45);
  });

  it('merges the daily series into one row per day, oldest first', () => {
    expect(
      mergeDaily(
        [{ day: '2026-09-21', steps: 8000 }],
        [
          { day: '2026-09-22', bpm: 58 },
          { day: '2026-09-21', bpm: 60 },
        ],
        [{ day: '2026-09-22', ms: 41.5 }],
      ),
    ).toEqual([
      { day: '2026-09-21', steps: 8000, restingHeartRate: 60 },
      { day: '2026-09-22', restingHeartRate: 58, hrvMs: 41.5 },
    ]);
  });
});

describe('GoogleHealthConnector requests', () => {
  it('rolls steps up by civil day and filters the daily types by date', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('steps/dataPoints:dailyRollUp')) {
        expect(init?.method).toBe('POST');
        expect(JSON.parse(String(init?.body))).toEqual({
          range: {
            start: { date: { year: 2026, month: 9, day: 20 } },
            end: { date: { year: 2026, month: 9, day: 23 } },
          },
          windowSizeDays: 1,
        });
        return json({
          rollupDataPoints: [
            { civilStartTime: { date: { year: 2026, month: 9, day: 22 } }, steps: { countSum: '9321' } },
          ],
        });
      }
      if (url.includes('daily-resting-heart-rate')) {
        expect(new URL(url).searchParams.get('filter')).toBe(
          'daily_resting_heart_rate.date >= "2026-09-20" AND daily_resting_heart_rate.date < "2026-09-23"',
        );
        return json({
          dataPoints: [
            { dailyRestingHeartRate: { date: { year: 2026, month: 9, day: 22 }, beatsPerMinute: '57' } },
          ],
        });
      }
      if (url.includes('daily-heart-rate-variability')) return json({ dataPoints: [] });
      throw new Error(`unexpected ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const days = await connector.daily(valid(), '2026-09-20', '2026-09-23');
    expect(days).toEqual([{ day: '2026-09-22', steps: 9321, restingHeartRate: 57 }]);
    expect(fetchMock.mock.calls[0]![1]?.headers).toMatchObject({ Authorization: 'Bearer tok' });
  });

  it('pages through sleep sessions at the API’s cap of 25', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      const params = new URL(url).searchParams;
      expect(params.get('pageSize')).toBe('25');
      expect(params.get('filter')).toBe('sleep.interval.end_time >= "2026-09-01T00:00:00.000Z"');
      const session = (id: string) => ({
        name: id,
        sleep: { interval: { startTime: '2026-09-21T04:00:00Z', endTime: '2026-09-21T11:00:00Z' } },
      });
      return params.get('pageToken')
        ? json({ dataPoints: [session('b')] })
        : json({ dataPoints: [session('a')], nextPageToken: 'p2' });
    });
    vi.stubGlobal('fetch', fetchMock);
    const sleeps = await connector.sleep(valid(), new Date('2026-09-01T00:00:00Z'));
    expect(sleeps.map((s) => s.id)).toEqual(['a', 'b']);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('turns a missing scope into a reconnect prompt, not a server fault', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('ACCESS_TOKEN_SCOPE_INSUFFICIENT', { status: 403 })),
    );
    await expect(connector.exercises(valid(), '2026-09-01')).rejects.toBeInstanceOf(ConnectorScopeError);
  });

  it('reports an expired grant as the user’s to fix', async () => {
    const ctx = ctxWith({ accessToken: 'old', expiresAt: Date.now() - 1000 });
    await expect(connector.sleep(ctx, new Date())).rejects.toBeInstanceOf(ConnectorAuthExpiredError);
  });
});
