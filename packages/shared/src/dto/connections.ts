import type { StatsDayDTO } from './stats.js';

/**
 * Cross-domain observations — the one thing Atlas can say that a single-purpose
 * app cannot.
 *
 * Deliberately NOT the model. These are hand-written comparisons over data
 * already stored, which makes them instant, free, and incapable of inventing a
 * pattern that is not there. An LLM asked to "find something interesting" will
 * always find something, which is exactly the failure mode: a confident
 * correlation drawn from four days is worse than silence, because the user
 * cannot tell the difference and will believe it.
 *
 * Every rule here is a two-group comparison: split the days by something that
 * happened, then compare a number measured on both sides. That shape is honest
 * about what it is — an observation about co-occurrence, never a causal claim —
 * and it is the reason the phrasing below never says "because".
 */

/** Which parts of the user's life an observation joins. Both are shown. */
export type ConnectionDomain = 'training' | 'tasks' | 'habits' | 'mood' | 'money';

export interface Connection {
  /** Stable across renders so the UI can avoid re-animating the same card. */
  id: string;
  domains: [ConnectionDomain, ConnectionDomain];
  /** The observation, in one sentence. */
  headline: string;
  /** The numbers behind it, so the claim is checkable rather than trusted. */
  detail: string;
  /**
   * Relative effect size, 0–1+. Used only for ranking; never shown, because a
   * number like "0.62" invites reading it as a confidence or a p-value.
   */
  strength: number;
}

/**
 * Guards, chosen to be boring rather than clever.
 *
 * The failure this defends against is a card that fires on noise: with 30 days
 * of data and five rules, something will always look interesting. A comparison
 * needs enough days on BOTH sides to mean anything, and the gap has to be big
 * enough that a person would act differently knowing it.
 */
const MIN_DAYS_EACH_SIDE = 5;
const MIN_TOTAL_DAYS = 14;
/** 35% apart. Below this the difference is real but not worth a card. */
const MIN_RELATIVE_EFFECT = 0.35;
/** Mood is a 1–5 scale, where a third of a point is already visible. */
const MIN_MOOD_EFFECT = 0.4;

interface Rule {
  id: string;
  domains: [ConnectionDomain, ConnectionDomain];
  /** True/false puts the day in a group; null leaves it out as no evidence. */
  when: (d: StatsDayDTO) => boolean | null;
  /** The number being compared. null excludes the day from the average. */
  measure: (d: StatsDayDTO) => number | null;
  /** Passed the means for the with-group and the without-group. */
  phrase: (a: number, b: number) => { headline: string; detail: string } | null;
  /** Mood needs an absolute threshold; everything else is relative. */
  effect?: (a: number, b: number) => number;
}

const mean = (xs: number[]): number => xs.reduce((s, x) => s + x, 0) / xs.length;

/**
 * Did anything happen on this day?
 *
 * The rollup zero-fills every day in the window, so the length of the array is
 * the size of the window and never a measure of how much the user has actually
 * recorded — a brand-new account hands back thirty days of zeroes. Counting
 * days with something in them is what "two weeks of history" has to mean.
 */
function hasActivity(d: StatsDayDTO): boolean {
  return (
    d.tasksCompleted > 0 ||
    d.habitChecks > 0 ||
    d.workouts > 0 ||
    d.events > 0 ||
    d.moodAvg !== null ||
    d.spentMinor !== 0 ||
    d.earnedMinor !== 0
  );
}

/** How far apart two averages are, as a fraction of the larger one. */
function relativeEffect(a: number, b: number): number {
  const hi = Math.max(a, b);
  if (hi === 0) return 0;
  return Math.abs(a - b) / hi;
}

/** "2.4" not "2.4000000001", and "3" not "3.0". */
function num(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

/** "twice as many", "about 40% more" — how people actually say a ratio. */
function describeRatio(hi: number, lo: number): string {
  if (lo === 0) return 'far more';
  const ratio = hi / lo;
  if (ratio >= 2.75) return `about ${Math.round(ratio)} times as many`;
  if (ratio >= 1.75) return 'about twice as many';
  return `about ${Math.round((ratio - 1) * 100)}% more`;
}

const RULES: Rule[] = [
  {
    id: 'training-tasks',
    domains: ['training', 'tasks'],
    when: (d) => d.workouts > 0,
    measure: (d) => d.tasksCompleted,
    phrase: (trained, rest) => {
      if (trained <= rest) return null;
      return {
        headline: `You finish ${describeRatio(trained, rest)} tasks on days you train.`,
        detail: `${num(trained)} a day when you train, ${num(rest)} when you do not.`,
      };
    },
  },
  {
    id: 'training-mood',
    domains: ['training', 'mood'],
    when: (d) => d.workouts > 0,
    measure: (d) => d.moodAvg,
    effect: (a, b) => Math.abs(a - b) / 5,
    phrase: (trained, rest) => {
      if (Math.abs(trained - rest) < MIN_MOOD_EFFECT) return null;
      const better = trained > rest;
      return {
        headline: better
          ? 'Your mood runs higher on the days you train.'
          : 'You rate your days lower when you train.',
        detail: `${num(trained)} out of 5 on training days, ${num(rest)} on the rest.`,
      };
    },
  },
  {
    id: 'habits-mood',
    domains: ['habits', 'mood'],
    when: (d) => d.habitChecks > 0,
    measure: (d) => d.moodAvg,
    effect: (a, b) => Math.abs(a - b) / 5,
    phrase: (kept, missed) => {
      if (kept - missed < MIN_MOOD_EFFECT) return null;
      return {
        headline: 'The days you keep your habits are the days you rate highest.',
        detail: `${num(kept)} out of 5 when you check something off, ${num(missed)} when you do not.`,
      };
    },
  },
  {
    id: 'habits-tasks',
    domains: ['habits', 'tasks'],
    when: (d) => d.habitChecks > 0,
    measure: (d) => d.tasksCompleted,
    phrase: (kept, missed) => {
      if (kept <= missed) return null;
      return {
        headline: `Keeping a habit goes with ${describeRatio(kept, missed)} tasks finished.`,
        detail: `${num(kept)} a day when you check one off, ${num(missed)} when you do not.`,
      };
    },
  },
  {
    id: 'mood-money',
    domains: ['mood', 'money'],
    // Only journaled days can answer this one.
    when: (d) => (d.moodAvg === null ? null : d.moodAvg <= 2.5),
    measure: (d) => d.spentMinor,
    phrase: (low, ok) => {
      if (low <= ok) return null;
      return {
        headline: `You spend ${describeRatio(low, ok)} on the days you rate worst.`,
        detail: 'Comparing days you scored 2.5 or below against the rest.',
      };
    },
  },
];

function evaluate(rule: Rule, days: StatsDayDTO[]): Connection | null {
  const withIt: number[] = [];
  const without: number[] = [];

  for (const day of days) {
    // A day with nothing on it at all is missing data, not a day on which you
    // completed zero tasks. Counting the gaps as zeroes drags the "without"
    // average down and manufactures a ratio out of the days the user simply
    // did not open Atlas — found by seeding a real account and reading the
    // card, which said 0.7 for a group every member of which was a 1.
    if (!hasActivity(day)) continue;
    const side = rule.when(day);
    if (side === null) continue;
    const value = rule.measure(day);
    if (value === null) continue;
    (side ? withIt : without).push(value);
  }

  if (withIt.length < MIN_DAYS_EACH_SIDE || without.length < MIN_DAYS_EACH_SIDE) return null;

  const a = mean(withIt);
  const b = mean(without);
  const strength = rule.effect ? rule.effect(a, b) : relativeEffect(a, b);
  if (!rule.effect && strength < MIN_RELATIVE_EFFECT) return null;

  const said = rule.phrase(a, b);
  if (!said) return null;

  return { id: rule.id, domains: rule.domains, strength, ...said };
}

/**
 * Every observation the data actually supports, strongest first.
 *
 * Returns an empty array rather than a weak claim. That is the whole contract:
 * a card that appears only when it has something to say is trusted, and one
 * that always says something is decoration.
 */
export function findConnections(days: StatsDayDTO[]): Connection[] {
  if (days.filter(hasActivity).length < MIN_TOTAL_DAYS) return [];
  return RULES.map((r) => evaluate(r, days))
    .filter((c): c is Connection => c !== null)
    .sort((x, y) => y.strength - x.strength);
}

/**
 * What is missing, when nothing can be said yet.
 *
 * Being concrete matters: "not enough data" tells a new user they did
 * something wrong, while "journal on a few more days" is a next action. Returns
 * null once the data is sufficient and the silence means something else.
 */
export function describeMissingEvidence(days: StatsDayDTO[]): string | null {
  const active = days.filter(hasActivity).length;
  if (active < MIN_TOTAL_DAYS) {
    return `Atlas needs about two weeks of history before it can compare your days. It has ${active}.`;
  }
  const journaled = days.filter((d) => d.moodAvg !== null).length;
  const trained = days.filter((d) => d.workouts > 0).length;
  const missing: string[] = [];
  if (journaled < MIN_DAYS_EACH_SIDE) missing.push('journal on a few more days');
  if (trained < MIN_DAYS_EACH_SIDE) missing.push('log a few more workouts');
  if (missing.length === 0) return null;
  return `To connect more of your days, ${missing.join(' and ')}.`;
}
