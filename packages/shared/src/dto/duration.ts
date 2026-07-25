/**
 * Learning how long work actually takes.
 *
 * Atlas schedules a task by reserving a calendar block for it, and the task
 * records when it was completed. Those two facts together are a real
 * measurement — start of the block to completion — which is the one thing a
 * planner needs and almost no app has: your own history rather than a guess.
 *
 * Pure on purpose. The API computes estimates from the database and the UI
 * renders them from the same functions, so "usually takes ~1h" on a task row
 * and the number the planner reasons with can never drift apart.
 */

/** One completed piece of work: a block that was reserved, and when it ended. */
export interface DurationSample {
  title: string;
  /** When the reserved block began. */
  startedAt: Date;
  /** When the task was marked done. */
  completedAt: Date;
}

export interface DurationEstimate {
  /** Normalised title the estimate is keyed by. */
  key: string;
  /** Median observed minutes, rounded to the nearest 5. */
  minutes: number;
  /** How many completions it is based on. */
  samples: number;
}

/**
 * Below this a "completion" is someone ticking a box they had already done,
 * and above it they walked away and came back. Neither describes the work, and
 * a median made of them would quietly poison every estimate.
 */
const MIN_SAMPLE_MINUTES = 2;
const MAX_SAMPLE_MINUTES = 8 * 60;

/** Fewer than this and a "usually" claim is a lie — one data point is an anecdote. */
export const MIN_SAMPLES_FOR_ESTIMATE = 2;

/**
 * Key a task by its title, ignoring the noise that makes the same recurring
 * work look like different work: case, surrounding space, and a trailing
 * counter or date that instances tend to carry.
 */
export function durationKey(title: string): string {
  return title
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/** Round to the nearest 5 minutes: false precision reads as a promise. */
function roundMinutes(minutes: number): number {
  return Math.max(5, Math.round(minutes / 5) * 5);
}

function median(sorted: number[]): number {
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * Median elapsed minutes per task title.
 *
 * Median rather than mean because one task you left open over lunch would drag
 * an average somewhere useless, and the whole point is a number you would bet
 * your afternoon on.
 */
export function estimateDurations(samples: DurationSample[]): Map<string, DurationEstimate> {
  const byKey = new Map<string, number[]>();
  for (const s of samples) {
    const minutes = (s.completedAt.getTime() - s.startedAt.getTime()) / 60_000;
    if (!Number.isFinite(minutes)) continue;
    if (minutes < MIN_SAMPLE_MINUTES || minutes > MAX_SAMPLE_MINUTES) continue;
    const key = durationKey(s.title);
    if (!key) continue;
    const arr = byKey.get(key) ?? [];
    arr.push(minutes);
    byKey.set(key, arr);
  }

  const out = new Map<string, DurationEstimate>();
  for (const [key, values] of byKey) {
    if (values.length < MIN_SAMPLES_FOR_ESTIMATE) continue;
    values.sort((a, b) => a - b);
    out.set(key, { key, minutes: roundMinutes(median(values)), samples: values.length });
  }
  return out;
}

/** "45m", "1h", "1h 20m" — the same phrasing the rest of the app uses. */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
