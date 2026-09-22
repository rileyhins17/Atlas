import { z } from 'zod';

/**
 * What a Fitbit or Pixel Watch measured, via the Google Health API.
 *
 * The point is not a second dashboard of the watch's own numbers — the Fitbit
 * app already draws those better than Atlas could. The point is the graph:
 * sleep sitting next to mood, training and the tasks that did or did not get
 * done. So what is kept is small (a day of totals, and workouts), and the
 * wording here is pure and tested, because the model reads it.
 *
 * Every number is nullable. A watch on the charger overnight still counted the
 * day's steps, and "no sleep recorded" must never read as "slept 0 hours".
 */

export const WearableDayDTO = z.object({
  /** YYYY-MM-DD, the user's local day. Sleep belongs to the day it ended. */
  dayKey: z.string(),
  steps: z.number().int().nullable(),
  restingHeartRate: z.number().int().nullable(),
  hrvMs: z.number().nullable(),
  sleepMinutes: z.number().int().nullable(),
  sleepStart: z.string().nullable(),
  sleepEnd: z.string().nullable(),
  deepMinutes: z.number().int().nullable(),
  remMinutes: z.number().int().nullable(),
});
export type WearableDayDTO = z.infer<typeof WearableDayDTO>;

export const WearableActivityDTO = z.object({
  id: z.string(),
  type: z.string(),
  name: z.string(),
  startAt: z.string(),
  endAt: z.string(),
  activeMinutes: z.number().int().nullable(),
  calories: z.number().int().nullable(),
  avgHeartRate: z.number().int().nullable(),
  distanceMeters: z.number().int().nullable(),
});
export type WearableActivityDTO = z.infer<typeof WearableActivityDTO>;

export const WearablesSummaryDTO = z.object({
  /** When Atlas last pulled from Google, or null if it never has. */
  lastSyncedAt: z.string().nullable(),
  /** Oldest first, at most `days` long; days with nothing recorded are absent. */
  days: z.array(WearableDayDTO),
  /** Newest first. */
  activities: z.array(WearableActivityDTO),
});
export type WearablesSummaryDTO = z.infer<typeof WearablesSummaryDTO>;

export const WearablesSummaryQuery = z.object({
  days: z.coerce.number().int().min(1).max(90).default(14),
});
export type WearablesSummaryQuery = z.infer<typeof WearablesSummaryQuery>;

export const DisconnectWearablesInput = z.object({
  /** Also delete everything already imported. Off by default, like Calendar. */
  forget: z.boolean().default(false),
});
export type DisconnectWearablesInput = z.infer<typeof DisconnectWearablesInput>;

export interface WearablesStatusDTO {
  /** The server has Google client credentials. */
  configured: boolean;
  /** This user has granted Google Health access. */
  connected: boolean;
  /** Connected, but Google refused the grant on the last sync. */
  needsReconnect: boolean;
  /** The exact callback Atlas sends, so it can be registered in Google Cloud. */
  redirectUri?: string;
  lastSyncedAt: string | null;
}

export interface WearablesSyncResultDTO {
  /** False when a sync ran moments ago and this one was skipped. */
  ran: boolean;
  days: number;
  activities: number;
  newActivities: number;
}

// ── Pure wording ────────────────────────────────────────────────────────────

/** A friendly default; there is no per-user goal yet. */
export const STEP_GOAL = 10_000;

/** 432 → "7h 12m"; 45 → "45m". */
export function formatSleep(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** 5012 → "5.0 km"; 800 → "800 m". */
export function formatDistance(meters: number): string {
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${meters} m`;
}

function average(values: number[]): number | null {
  return values.length === 0 ? null : values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * The model's view of the watch: one short block, measured facts only.
 *
 * Stated as numbers with their dates and never as a verdict — "6h 5m, below
 * your 7-day average" is information; "you slept badly" is a judgement Atlas
 * has no business making from a wrist sensor.
 */
export function summarizeWearables(
  days: WearableDayDTO[],
  activities: WearableActivityDTO[],
  todayKey: string,
): string {
  if (days.length === 0 && activities.length === 0) {
    return 'Watch connected, but nothing has synced yet.';
  }
  const lines: string[] = [];
  const byDay = new Map(days.map((d) => [d.dayKey, d]));
  const today = byDay.get(todayKey);
  const week = days.slice(-7);

  const sleepAvg = average(week.flatMap((d) => (d.sleepMinutes === null ? [] : [d.sleepMinutes])));
  if (today?.sleepMinutes != null) {
    const stages = [
      today.deepMinutes != null ? `deep ${formatSleep(today.deepMinutes)}` : null,
      today.remMinutes != null ? `REM ${formatSleep(today.remMinutes)}` : null,
    ].filter(Boolean);
    lines.push(
      `Last night: ${formatSleep(today.sleepMinutes)} asleep${stages.length ? ` (${stages.join(', ')})` : ''}` +
        (sleepAvg !== null ? `; 7-day average ${formatSleep(sleepAvg)}.` : '.'),
    );
  } else if (sleepAvg !== null) {
    lines.push(`No sleep recorded last night; 7-day average ${formatSleep(sleepAvg)}.`);
  }

  const stepsAvg = average(week.flatMap((d) => (d.steps === null ? [] : [d.steps])));
  if (today?.steps != null) {
    lines.push(
      `Steps today so far: ${today.steps.toLocaleString('en-US')}` +
        (stepsAvg !== null ? ` (7-day average ${Math.round(stepsAvg).toLocaleString('en-US')}).` : '.'),
    );
  }

  const rhr = [...days].reverse().find((d) => d.restingHeartRate !== null);
  if (rhr) lines.push(`Resting heart rate ${rhr.restingHeartRate} bpm (${rhr.dayKey}).`);

  if (activities.length > 0) {
    const recent = activities.slice(0, 5).map((a) => {
      const bits = [
        a.activeMinutes != null ? `${a.activeMinutes} min` : null,
        a.distanceMeters ? formatDistance(a.distanceMeters) : null,
      ].filter(Boolean);
      return `${a.startAt.slice(0, 10)} ${a.name}${bits.length ? ` (${bits.join(', ')})` : ''}`;
    });
    lines.push(`Recent watch workouts: ${recent.join('; ')}.`);
  }
  return lines.join('\n');
}
