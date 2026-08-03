import { z } from 'zod';

/**
 * Product analytics, derived rather than tracked.
 *
 * The obvious move is a third-party script and a set of `track()` calls. This
 * does not need one: Atlas already writes a `timeline_events` row for every
 * mutation in every domain, and every user has a `createdAt`. Retention and
 * feature adoption fall straight out of those two facts.
 *
 * That is not only cheaper — it is a materially better product. No third-party
 * script, no cookie banner, nothing about a user's life leaving the server to
 * answer "did anyone come back on day two". For an app whose pitch is that it
 * holds your whole life, shipping a marketing tracker alongside it would be a
 * contradiction worth avoiding.
 *
 * What this cannot answer is anything with no server write behind it — which
 * screens get looked at, where a signup abandons the wizard. Those need real
 * instrumentation, and the honest thing is to say so rather than pretend the
 * derived numbers cover it.
 */

/** One account, and the day it was created (YYYY-MM-DD, UTC). */
export interface SignupRow {
  userId: string;
  day: string;
}

/** One user-day of activity in one domain. Many rows per user. */
export interface ActivityRow {
  userId: string;
  day: string;
  source: string;
}

export const AdoptionDTO = z.object({
  totalUsers: z.number().int(),
  /** Did anything at all after signing up. Below this, nothing else matters. */
  activated: z.number().int(),
  /** Came back on a later calendar day — the single number that predicts a subscription. */
  returnedNextDay: z.number().int(),
  /** Still writing something a week later. */
  returnedAfterWeek: z.number().int(),
  /**
   * Used two or more domains. This is the thesis: if it stays low, people are
   * buying a to-do list from someone who also sells six other things.
   */
  usedTwoDomains: z.number().int(),
  usedFourDomains: z.number().int(),
  /** Accounts touching each domain, most-used first. */
  byDomain: z.array(z.object({ source: z.string(), users: z.number().int() })),
  /** Signups per ISO week, oldest first. */
  signupsByWeek: z.array(z.object({ week: z.string(), count: z.number().int() })),
});
export type AdoptionDTO = z.infer<typeof AdoptionDTO>;

/** Whole days between two YYYY-MM-DD keys. Both are UTC, so this is exact. */
function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** Monday-anchored ISO-ish week key, e.g. "2026-07-27". */
function weekKey(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

export function computeAdoption(signups: SignupRow[], activity: ActivityRow[]): AdoptionDTO {
  const signupDay = new Map(signups.map((s) => [s.userId, s.day]));
  const domains = new Map<string, Set<string>>();
  const byUser = new Map<string, { later: boolean; afterWeek: boolean; sources: Set<string> }>();

  for (const row of activity) {
    const start = signupDay.get(row.userId);
    if (start === undefined) continue;

    let entry = byUser.get(row.userId);
    if (!entry) {
      entry = { later: false, afterWeek: false, sources: new Set() };
      byUser.set(row.userId, entry);
    }
    entry.sources.add(row.source);

    // Activity on the signup day itself is the tour, not a return visit.
    const age = daysBetween(start, row.day);
    if (age >= 1) entry.later = true;
    if (age >= 7) entry.afterWeek = true;

    let users = domains.get(row.source);
    if (!users) {
      users = new Set();
      domains.set(row.source, users);
    }
    users.add(row.userId);
  }

  const entries = [...byUser.values()];
  const weeks = new Map<string, number>();
  for (const s of signups) weeks.set(weekKey(s.day), (weeks.get(weekKey(s.day)) ?? 0) + 1);

  return {
    totalUsers: signups.length,
    activated: byUser.size,
    returnedNextDay: entries.filter((e) => e.later).length,
    returnedAfterWeek: entries.filter((e) => e.afterWeek).length,
    usedTwoDomains: entries.filter((e) => e.sources.size >= 2).length,
    usedFourDomains: entries.filter((e) => e.sources.size >= 4).length,
    byDomain: [...domains.entries()]
      .map(([source, users]) => ({ source, users: users.size }))
      .sort((a, b) => b.users - a.users || a.source.localeCompare(b.source)),
    signupsByWeek: [...weeks.entries()]
      .map(([week, count]) => ({ week, count }))
      .sort((a, b) => a.week.localeCompare(b.week)),
  };
}

/**
 * A percentage, or null when the denominator is too small to mean anything.
 *
 * "50% retention" from two users is noise dressed as a metric, and the whole
 * reason for measuring is to stop guessing.
 */
export function ratePercent(part: number, whole: number, minWhole = 5): number | null {
  if (whole < minWhole) return null;
  return Math.round((part / whole) * 100);
}
