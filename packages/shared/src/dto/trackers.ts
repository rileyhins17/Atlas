import { z } from 'zod';

/**
 * Rate anything, once a day, on a scale you define.
 *
 * This exists because of a specific request — "can you add a part where I rate
 * my digestive problems, like do you feel bloated today, 1-10" — and the right
 * answer to that was neither yes nor no. A bloating feature is too niche to
 * build and too reasonable to refuse, and the next person wants soreness, or
 * anxiety, or skin, or hangover, or focus. So the thing to build is the
 * primitive underneath all of them: you name what you want to watch, you rate
 * it daily, and Atlas does the part no single-purpose app can — puts it
 * alongside your training, sleep and mood and counts what goes with what.
 *
 * A standalone bloating app can tell you that you were a 7 on Tuesday. Only
 * something holding the rest of your life can notice that your 7s are the days
 * you trained legs and ate after 9.
 *
 * Everything here is pure: the scale rules, the summary maths and the contrast
 * counting. Nothing about it is an AI feature — counting is checkable, and a
 * model asked "why is he bloated?" will always produce a confident sentence
 * with no way to tell a real pattern from a fluent one.
 */

/** 1-10. Ten points is as fine as self-report gets before it is noise. */
export const TRACKER_MIN = 1;
export const TRACKER_MAX = 10;

/**
 * Which end is the good end.
 *
 * A tracker cannot be summarised without this. "Bloating is up 2 points" is bad
 * news and "Energy is up 2 points" is good news, and an app that renders both
 * in the same green is worse than one that renders neither.
 */
export const TrackerDirection = z.enum(['higher_better', 'lower_better', 'neutral']);
export type TrackerDirection = z.infer<typeof TrackerDirection>;

export const TrackerDTO = z.object({
  id: z.string(),
  name: z.string(),
  /** One emoji, or null. Purely to make a list of six scannable. */
  emoji: z.string().nullable(),
  direction: TrackerDirection,
  /** What 1 and 10 mean, in the user's words. Optional; the scale works anyway. */
  lowLabel: z.string().nullable(),
  highLabel: z.string().nullable(),
  active: z.boolean(),
  position: z.number().int(),
  createdAt: z.string(),
  /** Today's rating, when there is one. Null means "not asked yet today". */
  todayValue: z.number().int().nullable(),
});
export type TrackerDTO = z.infer<typeof TrackerDTO>;

export const TrackerEntryDTO = z.object({
  id: z.string(),
  trackerId: z.string(),
  /** Local day key, YYYY-MM-DD, in the user's timezone. */
  dayKey: z.string(),
  value: z.number().int(),
  note: z.string().nullable(),
});
export type TrackerEntryDTO = z.infer<typeof TrackerEntryDTO>;

const name = z.string().trim().min(1).max(40);
/**
 * One emoji, loosely. A tight grapheme regex rejects real emoji (flags, skin
 * tones, ZWJ families) more often than it catches abuse, and the only thing
 * that actually matters is that a caption cannot be smuggled in here.
 */
const emoji = z.string().trim().max(8).nullable().optional();
const label = z.string().trim().max(24).nullable().optional();

export const CreateTrackerInput = z.object({
  name,
  emoji,
  direction: TrackerDirection.default('neutral'),
  lowLabel: label,
  highLabel: label,
});
export type CreateTrackerInput = z.infer<typeof CreateTrackerInput>;

export const UpdateTrackerInput = z.object({
  name: name.optional(),
  emoji,
  direction: TrackerDirection.optional(),
  lowLabel: label,
  highLabel: label,
  active: z.boolean().optional(),
  position: z.number().int().min(0).max(100).optional(),
});
export type UpdateTrackerInput = z.infer<typeof UpdateTrackerInput>;

export const LogTrackerInput = z.object({
  value: z.number().int().min(TRACKER_MIN).max(TRACKER_MAX),
  note: z.string().trim().max(500).nullable().optional(),
  /**
   * Which day this is a rating OF. Defaults to today in the user's timezone.
   * Present so last night can be filled in this morning, which is when people
   * actually remember to.
   */
  dayKey: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'dayKey must be YYYY-MM-DD')
    .optional(),
});
export type LogTrackerInput = z.infer<typeof LogTrackerInput>;

/** Six is already more daily questions than anyone answers honestly. */
export const MAX_TRACKERS = 8;

// ── summarising ─────────────────────────────────────────────────────────────

export interface TrackerPoint {
  dayKey: string;
  value: number;
}

export interface TrackerSummary {
  /** Mean over the window, to one decimal. Null when there is nothing. */
  mean: number | null;
  /** Mean over the most recent half, minus the mean over the older half. */
  change: number | null;
  /** How the change reads given which end is good. */
  tone: 'better' | 'worse' | 'flat' | 'unknown';
  days: number;
  latest: number | null;
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Enough days before a change is worth reporting at all.
 *
 * Same reasoning as the mood patterns: two entries are not a trend, and a
 * product that says otherwise is confidently wrong in public.
 */
export const MIN_DAYS_FOR_TREND = 8;

/** Below this, the two halves are the same number with noise on top. */
export const MIN_TREND_DELTA = 0.5;

/**
 * A tracker's window reduced to something sayable.
 *
 * Split-half rather than a fitted slope: a slope over ten noisy self-reports is
 * a number with a false amount of precision attached, and "the last five days
 * averaged 6.8 against 4.1 before" is both true and checkable by hand.
 */
export function summariseTracker(
  points: TrackerPoint[],
  direction: TrackerDirection,
): TrackerSummary {
  // De-duplicate by day, last write wins: a corrected rating is the real one.
  const byDay = new Map<string, number>();
  for (const p of points) {
    if (!Number.isFinite(p.value)) continue;
    if (p.value < TRACKER_MIN || p.value > TRACKER_MAX) continue;
    byDay.set(p.dayKey, p.value);
  }
  const days = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b));
  if (days.length === 0) {
    return { mean: null, change: null, tone: 'unknown', days: 0, latest: null };
  }

  const values = days.map(([, v]) => v);
  const summary: TrackerSummary = {
    mean: round1(mean(values)),
    change: null,
    tone: 'unknown',
    days: values.length,
    latest: values.at(-1)!,
  };
  if (values.length < MIN_DAYS_FOR_TREND) return summary;

  const half = Math.floor(values.length / 2);
  const older = values.slice(0, half);
  const recent = values.slice(values.length - half);
  const change = round1(mean(recent) - mean(older));
  summary.change = change;

  if (Math.abs(change) < MIN_TREND_DELTA || direction === 'neutral') {
    summary.tone = Math.abs(change) < MIN_TREND_DELTA ? 'flat' : 'unknown';
    return summary;
  }
  const up = change > 0;
  summary.tone = (direction === 'higher_better') === up ? 'better' : 'worse';
  return summary;
}

/**
 * One sentence about a tracker, or null when there is nothing honest to say.
 *
 * Null rather than a hedge. "Not enough data to tell" occupying a card is
 * worse than an empty space, because it looks like an answer.
 */
export function describeTracker(
  trackerName: string,
  summary: TrackerSummary,
  direction: TrackerDirection,
): string | null {
  if (summary.mean === null) return null;
  if (summary.change === null) {
    return `${trackerName} is averaging ${summary.mean} over ${summary.days} ${
      summary.days === 1 ? 'day' : 'days'
    }.`;
  }
  if (summary.tone === 'flat') {
    return `${trackerName} has held steady around ${summary.mean}.`;
  }
  const dir = summary.change > 0 ? 'up' : 'down';
  const better =
    direction === 'neutral' ? '' : summary.tone === 'better' ? ', which is the good direction' : '';
  return `${trackerName} is ${dir} ${Math.abs(summary.change)} points recently, averaging ${
    summary.mean
  }${better}.`;
}

// ── cross-domain contrast ───────────────────────────────────────────────────

export interface TrackerContrast {
  factor: string;
  withMean: number;
  withoutMean: number;
  withDays: number;
  withoutDays: number;
  /** withMean − withoutMean. Positive means higher WITH the factor. */
  delta: number;
}

/** Matches the mood engine deliberately: same bars, same refusal to guess. */
export const MIN_DAYS_FOR_CONTRAST = 14;
export const MIN_TRACKER_DAYS_PER_SIDE = 5;
/** A tenth of a 1-10 scale, matching the half-point used on the 1-5 mood one. */
export const MIN_CONTRAST_DELTA = 1;

export interface TrackerDay {
  dayKey: string;
  value: number;
  /** Whatever else was true that day: trained, slept badly, drank, and so on. */
  factors: Record<string, boolean>;
}

/**
 * What a tracker's bad days have in common.
 *
 * The whole reason this feature is worth building rather than pointing someone
 * at a symptom-diary app. Same counting as the mood contrasts, and the same
 * hard rule: this is an observation about a fortnight, never a cause. "Bloating
 * averaged 6.8 on days you trained and 3.1 on days you did not" is a fact. "Training
 * bloats you" is a claim this data cannot support, and the arrow may well point
 * the other way.
 */
export function findTrackerContrasts(days: TrackerDay[]): TrackerContrast[] {
  const byDay = new Map<string, TrackerDay>();
  for (const d of days) {
    if (!Number.isFinite(d.value) || d.value < TRACKER_MIN || d.value > TRACKER_MAX) continue;
    byDay.set(d.dayKey, d);
  }
  const unique = [...byDay.values()];
  if (unique.length < MIN_DAYS_FOR_CONTRAST) return [];

  const factors = new Set<string>();
  for (const d of unique) for (const k of Object.keys(d.factors)) factors.add(k);

  const out: TrackerContrast[] = [];
  for (const factor of factors) {
    const withIt: number[] = [];
    const without: number[] = [];
    for (const d of unique) {
      // A day that never reported this factor is not evidence either way.
      if (!(factor in d.factors)) continue;
      (d.factors[factor] ? withIt : without).push(d.value);
    }
    if (withIt.length < MIN_TRACKER_DAYS_PER_SIDE || without.length < MIN_TRACKER_DAYS_PER_SIDE) continue;

    const withMean = mean(withIt);
    const withoutMean = mean(without);
    const delta = round1(withMean - withoutMean);
    if (Math.abs(delta) < MIN_CONTRAST_DELTA) continue;

    out.push({
      factor,
      withMean: round1(withMean),
      withoutMean: round1(withoutMean),
      withDays: withIt.length,
      withoutDays: without.length,
      delta,
    });
  }
  return out.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}

/** The observation, and nothing beyond it. */
export function describeTrackerContrast(
  trackerName: string,
  contrast: TrackerContrast,
  factorLabel: string,
): string {
  return `${trackerName} averaged ${contrast.withMean} on days you ${factorLabel} (${contrast.withDays} days) and ${contrast.withoutMean} on days you did not (${contrast.withoutDays}).`;
}

/** One tracker's contrasts, as the API returns them. */
export const TrackerPatternDTO = z.object({
  factor: z.string(),
  line: z.string(),
  withMean: z.number(),
  withoutMean: z.number(),
  withDays: z.number().int(),
  withoutDays: z.number().int(),
  delta: z.number(),
});
export type TrackerPatternDTO = z.infer<typeof TrackerPatternDTO>;

export const TrackerPatternsDTO = z.object({
  /** How many rated days it takes before anything is reported at all. */
  daysNeeded: z.number().int(),
  trackers: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      daysLogged: z.number().int(),
      patterns: z.array(TrackerPatternDTO),
    }),
  ),
});
export type TrackerPatternsDTO = z.infer<typeof TrackerPatternsDTO>;
