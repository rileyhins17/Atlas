import { ConnectorScopeError, type Connector, type ConnectorContext } from './connector.js';
import {
  GoogleCredentialSchema,
  GoogleOAuth,
  type GoogleCredential,
  type GoogleOAuthConfig,
} from './google-oauth.js';

/**
 * Google Health API (v4) — the replacement for the Fitbit Web API, which
 * Google shut down in September 2026. It serves Fitbit and Pixel Watch data
 * through ordinary Google OAuth.
 *
 * Shapes here follow the API's own discovery document
 * (https://health.googleapis.com/$discovery/rest?version=v4), not a guess: the
 * int64 fields (`countSum`, `beatsPerMinute`, `minutesAsleep`) arrive as JSON
 * STRINGS, which is exactly the kind of thing a hand-written client gets wrong.
 *
 * Like every connector it never touches the database. It returns plain,
 * normalised rows; `WearablesSyncService` (apps/api) reconciles them.
 */

const API = 'https://health.googleapis.com/v4/users/me/dataTypes';

/**
 * Read-only, and only the three families Atlas uses. Every Google Health
 * scope is "Restricted": until the app passes Google's verification and a
 * CASA security assessment it is limited to 100 users, and while the consent
 * screen is in Testing the refresh token dies every seven days. Asking for
 * less does not change that, but it is what a user sees on the consent screen.
 */
export const GOOGLE_HEALTH_SCOPES = [
  'https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly',
  'https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly',
  'https://www.googleapis.com/auth/googlehealth.sleep.readonly',
];

/** The sleep and exercise list endpoints cap a page at 25. */
const SESSION_PAGE = 25;
/** Enough for months of daily points; a runaway paginator is a bug, not data. */
const MAX_PAGES = 20;

/** A calendar date as Google sends it (`google.type.Date`). */
interface GDate {
  year?: number;
  month?: number;
  day?: number;
}

/** One local day of daily metrics. `day` is YYYY-MM-DD in the user's own zone. */
export interface HealthDaily {
  day: string;
  steps?: number;
  restingHeartRate?: number;
  hrvMs?: number;
}

/** A night's sleep, keyed by the day it ENDED — last night belongs to today. */
export interface HealthSleep {
  id: string;
  day: string;
  startAt: Date;
  endAt: Date;
  minutesAsleep: number;
  deepMinutes: number | null;
  remMinutes: number | null;
  mainSleep: boolean;
}

/** One recorded workout. */
export interface HealthExercise {
  id: string;
  type: string;
  name: string;
  startAt: Date;
  endAt: Date;
  activeMinutes: number | null;
  calories: number | null;
  avgHeartRate: number | null;
  distanceMeters: number | null;
  steps: number | null;
}

// ── Pure mapping, exported for tests ───────────────────────────────────────

/** `{year, month, day}` → "YYYY-MM-DD", or null when any part is missing. */
export function dayKeyOf(d: GDate | undefined): string | null {
  if (!d?.year || !d.month || !d.day) return null;
  return `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;
}

/** "YYYY-MM-DD" → `{year, month, day}`. */
export function gDateOf(key: string): Required<GDate> {
  const [year, month, day] = key.split('-').map(Number);
  return { year: year!, month: month!, day: day! };
}

/** int64 fields arrive as strings; anything unparseable is absent, not zero. */
function num(v: unknown): number | null {
  if (v === undefined || v === null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** A protobuf Duration ("1830s", "1830.5s") → whole minutes. */
export function durationMinutes(d: string | undefined): number | null {
  if (!d) return null;
  const m = /^(\d+(?:\.\d+)?)s$/.exec(d);
  return m ? Math.round(Number(m[1]) / 60) : null;
}

interface RawSleep {
  interval?: { startTime?: string; endTime?: string; civilEndTime?: { date?: GDate } };
  summary?: {
    minutesAsleep?: string;
    stagesSummary?: { type?: string; minutes?: string }[];
  };
  metadata?: { mainSleep?: boolean; nap?: boolean };
}

export function mapSleep(point: { name?: string; sleep?: RawSleep }): HealthSleep | null {
  const s = point.sleep;
  const start = s?.interval?.startTime;
  const end = s?.interval?.endTime;
  if (!s || !start || !end) return null;
  const endAt = new Date(end);
  const day = dayKeyOf(s.interval?.civilEndTime?.date) ?? end.slice(0, 10);
  const stage = (type: string) => {
    const hit = s.summary?.stagesSummary?.find((x) => x.type === type);
    return hit ? num(hit.minutes) : null;
  };
  return {
    id: point.name ?? `sleep-${start}`,
    day,
    startAt: new Date(start),
    endAt,
    minutesAsleep:
      num(s.summary?.minutesAsleep) ?? Math.round((endAt.getTime() - Date.parse(start)) / 60_000),
    deepMinutes: stage('DEEP'),
    remMinutes: stage('REM'),
    // An unprocessed session has no flag yet; only a nap is excluded outright.
    mainSleep: s.metadata?.mainSleep ?? !s.metadata?.nap,
  };
}

interface RawExercise {
  displayName?: string;
  exerciseType?: string;
  activeDuration?: string;
  interval?: { startTime?: string; endTime?: string };
  metricsSummary?: {
    caloriesKcal?: number;
    averageHeartRateBeatsPerMinute?: string;
    distanceMillimeters?: number;
    steps?: string;
  };
}

export function mapExercise(point: { name?: string; exercise?: RawExercise }): HealthExercise | null {
  const e = point.exercise;
  const start = e?.interval?.startTime;
  const end = e?.interval?.endTime;
  if (!e || !start || !end) return null;
  const m = e.metricsSummary ?? {};
  const distance = num(m.distanceMillimeters);
  const calories = num(m.caloriesKcal);
  return {
    id: point.name ?? `exercise-${start}`,
    type: e.exerciseType ?? 'OTHER',
    name: e.displayName?.trim() || prettyType(e.exerciseType),
    startAt: new Date(start),
    endAt: new Date(end),
    activeMinutes:
      durationMinutes(e.activeDuration) ?? Math.round((Date.parse(end) - Date.parse(start)) / 60_000),
    calories: calories === null ? null : Math.round(calories),
    avgHeartRate: num(m.averageHeartRateBeatsPerMinute),
    distanceMeters: distance === null ? null : Math.round(distance / 1000),
    steps: num(m.steps),
  };
}

/** "STRENGTH_TRAINING" → "Strength training", for when Google sends no name. */
function prettyType(type: string | undefined): string {
  if (!type || type === 'EXERCISE_TYPE_UNSPECIFIED') return 'Workout';
  const words = type.toLowerCase().split('_').join(' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Merge the three daily series into one row per day. A day appears as soon as
 * ANY of them has it — a watch left on the charger still counted steps.
 */
export function mergeDaily(
  steps: { day: string; steps: number }[],
  resting: { day: string; bpm: number }[],
  hrv: { day: string; ms: number }[],
): HealthDaily[] {
  const days = new Map<string, HealthDaily>();
  const at = (day: string) => {
    let d = days.get(day);
    if (!d) days.set(day, (d = { day }));
    return d;
  };
  for (const s of steps) at(s.day).steps = s.steps;
  for (const r of resting) at(r.day).restingHeartRate = r.bpm;
  for (const h of hrv) at(h.day).hrvMs = h.ms;
  return [...days.values()].sort((a, b) => a.day.localeCompare(b.day));
}

// ── The connector ──────────────────────────────────────────────────────────

export class GoogleHealthConnector implements Connector {
  readonly id = 'google-health';
  readonly label = 'Google Health';
  readonly credentialSchema = GoogleCredentialSchema;
  readonly capabilities = ['health.read'] as const;

  private readonly oauth: GoogleOAuth;

  constructor(config: GoogleOAuthConfig) {
    this.oauth = new GoogleOAuth(config, 'google-health', 'Google Health', GOOGLE_HEALTH_SCOPES.join(' '));
  }

  get redirectUri(): string {
    return this.oauth.redirectUri;
  }

  authUrl(state: string): string {
    return this.oauth.authUrl(state);
  }

  exchangeCode(code: string): Promise<GoogleCredential> {
    return this.oauth.exchangeCode(code);
  }

  private async call<T>(ctx: ConnectorContext, url: string, init: RequestInit = {}): Promise<T> {
    const token = await this.oauth.accessToken(ctx);
    const res = await fetch(url, {
      ...init,
      headers: {
        ...(init.headers ?? {}),
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      // A grant missing one of the scopes — a user who unticked "sleep" on
      // the consent screen, say. Fixed by reconnecting, not by retrying.
      if (res.status === 403 && /insufficient|scope|ACCESS_TOKEN_SCOPE/i.test(text)) {
        throw new ConnectorScopeError(
          'google-health',
          'Reconnect Google Health and allow activity, heart and sleep data.',
        );
      }
      throw new Error(`Google Health API ${res.status}: ${text.slice(0, 300)}`);
    }
    return (await res.json()) as T;
  }

  /** Every page of a data-point list, newest first as the API returns them. */
  private async list<T>(
    ctx: ConnectorContext,
    dataType: string,
    filter: string,
    pageSize?: number,
  ): Promise<T[]> {
    const out: T[] = [];
    let pageToken: string | undefined;
    for (let page = 0; page < MAX_PAGES; page++) {
      const params = new URLSearchParams({ filter });
      if (pageSize) params.set('pageSize', String(pageSize));
      if (pageToken) params.set('pageToken', pageToken);
      const data = await this.call<{ dataPoints?: T[]; nextPageToken?: string }>(
        ctx,
        `${API}/${dataType}/dataPoints?${params.toString()}`,
      );
      out.push(...(data.dataPoints ?? []));
      if (!data.nextPageToken) break;
      pageToken = data.nextPageToken;
    }
    return out;
  }

  async verify(ctx: ConnectorContext): Promise<boolean> {
    try {
      const today = new Date().toISOString().slice(0, 10);
      await this.list(ctx, 'daily-resting-heart-rate', `daily_resting_heart_rate.date >= "${today}"`);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Steps, resting heart rate and HRV per local day, for [fromDay, toDay).
   * Days are the user's own calendar days as Google records them; the rollup
   * range is capped at 90 days by the API.
   */
  async daily(ctx: ConnectorContext, fromDay: string, toDay: string): Promise<HealthDaily[]> {
    const [stepsRes, resting, hrv] = await Promise.all([
      this.call<{
        rollupDataPoints?: { civilStartTime?: { date?: GDate }; steps?: { countSum?: string } }[];
      }>(ctx, `${API}/steps/dataPoints:dailyRollUp`, {
        method: 'POST',
        body: JSON.stringify({
          range: { start: { date: gDateOf(fromDay) }, end: { date: gDateOf(toDay) } },
          windowSizeDays: 1,
        }),
      }),
      this.list<{ dailyRestingHeartRate?: { date?: GDate; beatsPerMinute?: string } }>(
        ctx,
        'daily-resting-heart-rate',
        `daily_resting_heart_rate.date >= "${fromDay}" AND daily_resting_heart_rate.date < "${toDay}"`,
      ),
      this.list<{
        dailyHeartRateVariability?: { date?: GDate; averageHeartRateVariabilityMilliseconds?: number };
      }>(
        ctx,
        'daily-heart-rate-variability',
        `daily_heart_rate_variability.date >= "${fromDay}" AND daily_heart_rate_variability.date < "${toDay}"`,
      ),
    ]);

    return mergeDaily(
      (stepsRes.rollupDataPoints ?? []).flatMap((p) => {
        const day = dayKeyOf(p.civilStartTime?.date);
        const steps = num(p.steps?.countSum);
        return day && steps !== null ? [{ day, steps }] : [];
      }),
      resting.flatMap((p) => {
        const day = dayKeyOf(p.dailyRestingHeartRate?.date);
        const bpm = num(p.dailyRestingHeartRate?.beatsPerMinute);
        return day && bpm !== null ? [{ day, bpm }] : [];
      }),
      hrv.flatMap((p) => {
        const day = dayKeyOf(p.dailyHeartRateVariability?.date);
        const ms = num(p.dailyHeartRateVariability?.averageHeartRateVariabilityMilliseconds);
        return day && ms !== null ? [{ day, ms }] : [];
      }),
    );
  }

  /** Sleep sessions that ENDED at or after `since`. */
  async sleep(ctx: ConnectorContext, since: Date): Promise<HealthSleep[]> {
    const points = await this.list<{ name?: string; sleep?: RawSleep }>(
      ctx,
      'sleep',
      `sleep.interval.end_time >= "${since.toISOString()}"`,
      SESSION_PAGE,
    );
    return points.flatMap((p) => mapSleep(p) ?? []);
  }

  /** Workouts that started on or after local day `fromDay`. */
  async exercises(ctx: ConnectorContext, fromDay: string): Promise<HealthExercise[]> {
    const points = await this.list<{ name?: string; exercise?: RawExercise }>(
      ctx,
      'exercise',
      `exercise.interval.civil_start_time >= "${fromDay}"`,
      SESSION_PAGE,
    );
    return points.flatMap((p) => mapExercise(p) ?? []);
  }
}
