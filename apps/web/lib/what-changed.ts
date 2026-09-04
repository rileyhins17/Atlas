import type { PeriodTotalsDTO, StatsDayDTO, StatsDTO } from '@atlas/shared';

/**
 * What actually changed, as sentences a person can read.
 *
 * The page used to lead with six unlabelled sparklines and "193 things
 * happened". Every one of those answers "how much did you do?", which is not
 * the question anyone opens this page with. The question is "am I doing better
 * or worse, and what should I change?" — and that is answered in sentences with
 * numbers in them, not in a shape with no axis.
 *
 * Counted, never written by a model. A model asked "how is he doing?" always
 * produces a confident paragraph, including for an account with four days of
 * data; arithmetic can only say what happened. Same discipline as the mood
 * patterns card, for the same reason.
 *
 * Three rules keep it honest:
 *   - Nothing is mentioned unless it MOVED, or its absence is itself the news.
 *   - The bad news is not filtered out. A page that only reports improvement is
 *     a page nobody believes twice.
 *   - Percentages are never quoted against a tiny base. "Up 300%" from one to
 *     four is technically true and useless.
 */

/** Whether this is good news, bad news, or neither. Drives colour. */
export type ChangeTone = 'good' | 'bad' | 'flat' | 'warn';
/** Which way the number literally moved. Drives the arrow. */
export type ChangeDirection = 'up' | 'down' | 'flat';

export interface Change {
  /** Stable key, for React and for tests that should not depend on wording. */
  id: string;
  /** The sentence, with its number already in it. */
  text: string;
  /**
   * Tone and direction are separate on purpose. Spending less is GOOD news that
   * points DOWN, and drawing a green up-arrow beside the words "down 31%" is
   * the kind of small contradiction that makes a reader stop trusting a page.
   */
  tone: ChangeTone;
  direction: ChangeDirection;
  /** Rank only, never shown. */
  weight: number;
}

/**
 * Not everything that moved matters equally.
 *
 * Ranking on magnitude alone put "you spent 31% less" above "you kept a habit
 * on 93% of days", because percentages on money are simply bigger numbers.
 * Atlas is a life OS: what it uniquely knows about you outranks what a bank app
 * would also have told you.
 */
const IMPORTANCE: Record<string, number> = {
  gap: 2,
  habits: 1.6,
  mood: 1.5,
  training: 1.2,
  tasks: 1,
  spend: 0.7,
};

/** Below this, a percentage says more about the base than about the change. */
const MIN_BASE_FOR_PERCENT = 5;
/** Smaller than this is noise in a 30-day window, not a trend. */
const MIN_RELATIVE_MOVE = 0.15;

const pct = (now: number, before: number) => (before === 0 ? 1 : (now - before) / before);

function movement(
  now: number,
  before: number,
): { moved: boolean; text: string; direction: ChangeDirection } {
  if (before < MIN_BASE_FOR_PERCENT) {
    // Too small a base to speak in percentages — state the counts instead.
    return {
      moved: now !== before,
      text: before === 0 ? `up from none` : `up from ${before}`,
      direction: now === before ? 'flat' : now > before ? 'up' : 'down',
    };
  }
  const change = pct(now, before);
  if (Math.abs(change) < MIN_RELATIVE_MOVE) {
    return { moved: false, text: 'about the same', direction: 'flat' };
  }
  return {
    moved: true,
    text: `${change > 0 ? 'up' : 'down'} ${Math.round(Math.abs(change) * 100)}% on the previous period`,
    direction: change > 0 ? 'up' : 'down',
  };
}

/** Days since the most recent day with any check-in, or null if never. */
export function daysSinceLastHabit(days: StatsDayDTO[]): number | null {
  for (let i = days.length - 1; i >= 0; i--) {
    if ((days[i]?.habitChecks ?? 0) > 0) return days.length - 1 - i;
  }
  return null;
}

/** The longest run of consecutive days with at least one check-in. */
export function longestHabitStreak(days: StatsDayDTO[]): number {
  let best = 0;
  let run = 0;
  for (const d of days) {
    if (d.habitChecks > 0) {
      run += 1;
      best = Math.max(best, run);
    } else {
      run = 0;
    }
  }
  return best;
}

/**
 * How much you actually did on a day.
 *
 * Deliberately NOT `d.events`, which counts rows Atlas wrote to its own
 * timeline. That number is a measure of the app's logging, not of a life: a
 * feature that writes one row per sync rather than one per item makes a busy
 * day look empty, and an account with ninety days of history was shown "your
 * long arc starts now" because of exactly that. These four are things the
 * person did, and each is countable and explainable.
 */
export function dayActivity(d: StatsDayDTO): number {
  return d.tasksCompleted + d.habitChecks + d.workouts + d.journalEntries;
}

/** Is there anything in this window at all? */
export function hasRealActivity(days: StatsDayDTO[]): boolean {
  return days.some((d) => dayActivity(d) > 0);
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * The ranked list that leads the page. Biggest mover first, and at most `limit`
 * of them — a wall of sentences is the same failure as a wall of charts.
 */
export function whatChanged(data: StatsDTO, days: number, limit = 5): Change[] {
  const now: PeriodTotalsDTO = data.totals.current;
  const before: PeriodTotalsDTO = data.totals.previous;
  const out: Change[] = [];

  const add = (
    id: string,
    text: string,
    tone: ChangeTone,
    direction: ChangeDirection,
    weight: number,
  ) => out.push({ id, text, tone, direction, weight: weight * (IMPORTANCE[id] ?? 1) });

  // Tasks
  if (now.tasksCompleted > 0 || before.tasksCompleted > 0) {
    const m = movement(now.tasksCompleted, before.tasksCompleted);
    if (m.moved) {
      add(
        'tasks',
        `You finished ${plural(now.tasksCompleted, 'task')} — ${m.text.replace('the previous period', `the ${days} days before`)}.`,
        m.direction === 'down' ? 'bad' : 'good',
        m.direction,
        Math.abs(pct(now.tasksCompleted, before.tasksCompleted)),
      );
    }
  }

  // Training
  if (now.workouts > 0 || before.workouts > 0) {
    const m = movement(now.workouts, before.workouts);
    const kg = Math.round(now.volumeGrams / 1000);
    const tail = kg > 0 ? `, ${kg.toLocaleString()} kg lifted` : '';
    if (m.moved) {
      add(
        'training',
        `You trained ${plural(now.workouts, 'time')} — ${m.text.replace('the previous period', `the ${days} days before`)}${tail}.`,
        m.direction === 'down' ? 'bad' : 'good',
        m.direction,
        Math.abs(pct(now.workouts, before.workouts)),
      );
    } else if (now.workouts > 0) {
      add(
        'training',
        `You trained ${plural(now.workouts, 'time')}${tail} — about the same as before.`,
        'flat',
        'flat',
        0.05,
      );
    }
  }

  // Mood. Reported in points, not percent: a 12% change on a 1–5 scale is
  // meaningless, and half a point is what a person actually notices.
  if (now.moodAvg !== null) {
    const delta = before.moodAvg === null ? 0 : now.moodAvg - before.moodAvg;
    const shown = Math.round(now.moodAvg * 10) / 10;
    if (Math.abs(delta) >= 0.3) {
      add(
        'mood',
        `Your mood averaged ${shown} out of 5 — ${delta > 0 ? 'up' : 'down'} ${Math.abs(Math.round(delta * 10) / 10)} of a point.`,
        delta > 0 ? 'good' : 'bad',
        delta > 0 ? 'up' : 'down',
        Math.min(1, Math.abs(delta)),
      );
    } else {
      add('mood', `Your mood averaged ${shown} out of 5, steady.`, 'flat', 'flat', 0.04);
    }
  }

  // Habits — the share of days is the number people act on, not the raw count.
  const withHabit = data.days.filter((d) => d.habitChecks > 0).length;
  if (data.days.length > 0 && (withHabit > 0 || before.habitChecks > 0)) {
    const share = Math.round((withHabit / data.days.length) * 100);
    const streak = longestHabitStreak(data.days);
    add(
      'habits',
      `You kept a habit on ${share}% of days — your longest run was ${plural(streak, 'day')}.`,
      share >= 60 ? 'good' : share >= 30 ? 'flat' : 'warn',
      'flat',
      share >= 30 ? 0.35 : 0.6,
    );
  }

  // Money. Spending is the half people can act on, so it leads.
  if (now.spentMinor > 0 || before.spentMinor > 0) {
    const m = movement(now.spentMinor, before.spentMinor);
    if (m.moved) {
      const amount = `$${(now.spentMinor / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
      add(
        'spend',
        `You spent ${amount} — ${m.text.replace('the previous period', `the ${days} days before`)}.`,
        // Spending less is GOOD news pointing DOWN. Colour and arrow disagree
        // here by design, and that is the whole reason they are separate.
        m.direction === 'down' ? 'good' : 'bad',
        m.direction,
        Math.abs(pct(now.spentMinor, before.spentMinor)),
      );
    }
  }

  // The honest negative. A gap is worth saying out loud even when everything
  // else went up, and it is the single most actionable line on the page.
  const gap = daysSinceLastHabit(data.days);
  if (gap !== null && gap >= 3) {
    add('gap', `No habit check-in for ${plural(gap, 'day')}.`, 'warn', 'down', 0.9);
  }

  // Anything actionable leads, whatever else moved. Doubling your task count
  // is pleasant; not having checked in for six days is the line you can do
  // something about tonight, and burying it under good news is how a review
  // page becomes decoration.
  const rank = (c: Change) => (c.tone === 'warn' ? 1 : 0);
  return out
    .sort((a, b) => rank(b) - rank(a) || b.weight - a.weight)
    .slice(0, limit);
}
