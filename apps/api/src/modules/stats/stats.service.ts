import { Injectable } from '@nestjs/common';
import { Prisma } from '@atlas/db';
import {
  MIN_DAYS_FOR_PATTERNS,
  MOOD_FACTORS,
  PACKED_DAY_EVENTS,
  describeMoodContrast,
  findMoodContrasts,
  type MoodDay,
  type MoodPatternsDTO,
  type StatsDTO,
} from '@atlas/shared';
import { PrismaService } from '../../core/prisma.service.js';
import { dayKeyInTz, localDayStartUtc } from '../ai/time.util.js';
import { assembleStats, type MetricRow, type StatsMetric } from './stats.assemble.js';

/**
 * Cross-domain rollups, bucketed by the USER'S local day (Postgres
 * `AT TIME ZONE`, parameter-bound — never interpolated). Each query spans both
 * the requested window and the one before it; the pure assembler zero-fills
 * and splits totals for the delta chips.
 */
/**
 * How far back a pattern looks. Long enough that a fortnight of logging is not
 * the whole sample, short enough that it is still about how life is NOW —
 * "you were happier in March" is history, not something to act on.
 */
const PATTERN_WINDOW_DAYS = 90;

@Injectable()
export class StatsService {
  constructor(private readonly prisma: PrismaService) {}

  private async timezone(userId: string): Promise<string> {
    const user = await this.prisma.client.user.findUnique({
      where: { id: userId },
      select: { timezone: true },
    });
    return user?.timezone || 'UTC';
  }

  async rollup(userId: string, days: number): Promise<StatsDTO> {
    const tz = await this.timezone(userId);
    const now = new Date();
    const todayStart = localDayStartUtc(tz, now);
    const currentFrom = new Date(todayStart.getTime() - (days - 1) * 86_400_000);
    const prevFrom = new Date(currentFrom.getTime() - days * 86_400_000);
    const currentFromDay = dayKeyInTz(currentFrom, tz);

    // One query per metric — small, indexed, userId-scoped. The `AT TIME ZONE`
    // bucketing expression repeats per query because the column differs and the
    // tz is a BOUND parameter (never string-interpolated).
    const q = <T>(sql: Prisma.Sql) => this.prisma.client.$queryRaw<T[]>(sql);

    const [tasks, habits, mood, money, events, workouts, volume, journal] = await Promise.all([
      q<{ day: string; value: number }>(Prisma.sql`
        SELECT ((("completedAt" AT TIME ZONE 'UTC') AT TIME ZONE ${tz})::date)::text AS day,
               COUNT(*)::int AS value
        FROM tasks
        WHERE "userId" = ${userId} AND "completedAt" IS NOT NULL AND "completedAt" >= ${prevFrom}
        GROUP BY 1`),
      q<{ day: string; value: number }>(Prisma.sql`
        SELECT ((("loggedAt" AT TIME ZONE 'UTC') AT TIME ZONE ${tz})::date)::text AS day,
               COUNT(*)::int AS value
        FROM habit_logs
        WHERE "userId" = ${userId} AND "loggedAt" >= ${prevFrom}
        GROUP BY 1`),
      // Mood keys off entryDate — the day the entry is ABOUT, which is what a
      // mood trend means (backdating a journal entry should move its mood).
      q<{ day: string; value: number }>(Prisma.sql`
        SELECT ((("entryDate" AT TIME ZONE 'UTC') AT TIME ZONE ${tz})::date)::text AS day,
               AVG(mood)::float AS value
        FROM journal_entries
        WHERE "userId" = ${userId} AND mood IS NOT NULL AND "entryDate" >= ${prevFrom}
        GROUP BY 1`),
      q<{ day: string; spent: bigint; earned: bigint }>(Prisma.sql`
        SELECT ((("postedAt" AT TIME ZONE 'UTC') AT TIME ZONE ${tz})::date)::text AS day,
               COALESCE(SUM(CASE WHEN "amountMinor" < 0 THEN -"amountMinor" ELSE 0 END), 0) AS spent,
               COALESCE(SUM(CASE WHEN "amountMinor" > 0 THEN "amountMinor" ELSE 0 END), 0) AS earned
        FROM transactions
        WHERE "userId" = ${userId} AND "postedAt" >= ${prevFrom}
        GROUP BY 1`),
      q<{ day: string; value: number }>(Prisma.sql`
        SELECT ((("occurredAt" AT TIME ZONE 'UTC') AT TIME ZONE ${tz})::date)::text AS day,
               COUNT(*)::int AS value
        FROM timeline_events
        WHERE "userId" = ${userId} AND "occurredAt" >= ${prevFrom}
        GROUP BY 1`),
      // Finished sessions only — an open workout isn't a training day yet.
      q<{ day: string; value: number }>(Prisma.sql`
        SELECT ((("endedAt" AT TIME ZONE 'UTC') AT TIME ZONE ${tz})::date)::text AS day,
               COUNT(*)::int AS value
        FROM workouts
        WHERE "userId" = ${userId} AND "endedAt" IS NOT NULL AND "endedAt" >= ${prevFrom}
        GROUP BY 1`),
      // Volume bucketed by the SESSION's end day, not the set's own timestamp,
      // so a workout spanning local midnight stays one training day. Warm-ups
      // are excluded here exactly as they are in FitnessService.
      q<{ day: string; value: bigint }>(Prisma.sql`
        SELECT ((("endedAt" AT TIME ZONE 'UTC') AT TIME ZONE ${tz})::date)::text AS day,
               COALESCE(SUM(s."weightGrams"::bigint * s.reps), 0) AS value
        FROM workout_sets s
        JOIN workouts w ON w.id = s."workoutId"
        WHERE s."userId" = ${userId}
          AND w."endedAt" IS NOT NULL AND w."endedAt" >= ${prevFrom}
          AND s.warmup = false
          AND s."weightGrams" IS NOT NULL AND s.reps IS NOT NULL
        GROUP BY 1`),
      // Journal entries as a COUNT, separate from the mood average above: an
      // entry with no mood is still something the person did that day, and the
      // activity calendar has to count it.
      q<{ day: string; value: number }>(Prisma.sql`
        SELECT ((("entryDate" AT TIME ZONE 'UTC') AT TIME ZONE ${tz})::date)::text AS day,
               COUNT(*)::int AS value
        FROM journal_entries
        WHERE "userId" = ${userId} AND "entryDate" >= ${prevFrom}
        GROUP BY 1`),
    ]);

    const rows: MetricRow[] = [
      ...tag('tasks', tasks),
      ...tag('habits', habits),
      ...tag('mood', mood),
      ...money.flatMap((m) => [
        { metric: 'spent' as StatsMetric, day: m.day, value: Number(m.spent) },
        { metric: 'earned' as StatsMetric, day: m.day, value: Number(m.earned) },
      ]),
      ...tag('journal', journal),
      ...tag('events', events),
      ...tag('workouts', workouts),
      // Volume arrives as a bigint sum; Number() is safe here because a
      // lifetime of training is nowhere near 2^53 grams.
      ...volume.map((v) => ({ metric: 'volume' as StatsMetric, day: v.day, value: Number(v.value) })),
    ];

    return assembleStats(rows, currentFromDay, days);
  }

  /** Compact 30-day summary for the weekly review — the correlation payoff. */
  /**
   * What the user's better days have in common.
   *
   * The one thing a single-purpose app cannot do. A habit tracker knows you
   * trained; a journal knows you felt like a 2; only something holding both can
   * notice the 2s cluster on the days you did not.
   *
   * Every factor is a by-product of using Atlas, so the whole feature costs the
   * user one tap a day. A domain nobody uses never reaches MIN_DAYS_PER_SIDE and
   * drops out by itself, which is why there is no "does this user do fitness?"
   * branch anywhere here.
   *
   * Bucketing is the user's local day, in SQL, with the timezone BOUND — the
   * same rule as the rollup. A UTC comparison would file an evening workout
   * under tomorrow for anyone east of Greenwich and shuffle the two sides of
   * every contrast.
   */
  async moodPatterns(userId: string): Promise<MoodPatternsDTO> {
    const tz = await this.timezone(userId);
    const from = new Date(localDayStartUtc(tz, new Date()).getTime() - PATTERN_WINDOW_DAYS * 86_400_000);
    const q = <T>(sql: Prisma.Sql) => this.prisma.client.$queryRaw<T[]>(sql);

    const [moods, trained, habits, tasks, packed] = await Promise.all([
      // Mood keys off entryDate — the day the entry is ABOUT, matching the rollup.
      q<{ day: string; value: number }>(Prisma.sql`
        SELECT ((("entryDate" AT TIME ZONE 'UTC') AT TIME ZONE ${tz})::date)::text AS day,
               AVG(mood)::float AS value
        FROM journal_entries
        WHERE "userId" = ${userId} AND mood IS NOT NULL AND "entryDate" >= ${from}
        GROUP BY 1`),
      q<{ day: string }>(Prisma.sql`
        SELECT DISTINCT ((("endedAt" AT TIME ZONE 'UTC') AT TIME ZONE ${tz})::date)::text AS day
        FROM workouts
        WHERE "userId" = ${userId} AND "endedAt" IS NOT NULL AND "endedAt" >= ${from}`),
      q<{ day: string }>(Prisma.sql`
        SELECT DISTINCT ((("loggedAt" AT TIME ZONE 'UTC') AT TIME ZONE ${tz})::date)::text AS day
        FROM habit_logs
        WHERE "userId" = ${userId} AND "loggedAt" >= ${from}`),
      q<{ day: string }>(Prisma.sql`
        SELECT DISTINCT ((("completedAt" AT TIME ZONE 'UTC') AT TIME ZONE ${tz})::date)::text AS day
        FROM tasks
        WHERE "userId" = ${userId} AND "completedAt" IS NOT NULL AND "completedAt" >= ${from}`),
      // All-day rows are excluded: a birthday reminder is not a day with four
      // things in it, and counting it would make "packed" mean "has a calendar".
      q<{ day: string }>(Prisma.sql`
        SELECT ((("startAt" AT TIME ZONE 'UTC') AT TIME ZONE ${tz})::date)::text AS day
        FROM events
        WHERE "userId" = ${userId} AND "allDay" = false AND "startAt" >= ${from}
        GROUP BY 1
        HAVING COUNT(*) >= ${PACKED_DAY_EVENTS}`),
    ]);

    const set = (rows: { day: string }[]) => new Set(rows.map((r) => r.day));
    const trainedDays = set(trained);
    const habitDays = set(habits);
    const taskDays = set(tasks);
    const packedDays = set(packed);

    // Only days with a mood take part: a day nobody rated says nothing about
    // how the day felt, and filling it with an average would invent the answer.
    const days: MoodDay[] = moods.map((m) => ({
      dayKey: m.day,
      mood: m.value,
      factors: {
        trained: trainedDays.has(m.day),
        keptAHabit: habitDays.has(m.day),
        finishedTasks: taskDays.has(m.day),
        packedDay: packedDays.has(m.day),
      },
    }));

    return {
      daysLogged: days.length,
      daysNeeded: MIN_DAYS_FOR_PATTERNS,
      patterns: findMoodContrasts(days).map((c) => ({
        factor: c.factor,
        line: describeMoodContrast(c, MOOD_FACTORS),
        withMean: c.withMean,
        withoutMean: c.withoutMean,
        withDays: c.withDays,
        withoutDays: c.withoutDays,
        delta: c.delta,
      })),
    };
  }

  async summarizeForAi(userId: string): Promise<string> {
    const stats = await this.rollup(userId, 30);
    const { current, previous } = stats.totals;

    // Tell the model how thin the data actually is. Without this it sees only
    // totals and will happily narrate a "trend" from two data points.
    const activeDays = stats.days.filter((d) => d.events > 0).length;
    if (activeDays < 5) {
      return [
        `Stats: only ${activeDays} of the last 30 days have any recorded activity.`,
        'This is far too little to support any trend, pattern or correlation.',
        'Say plainly that it is early and what you would need to see, rather than',
        'drawing conclusions from these numbers.',
      ].join('\n');
    }
    const pct = (cur: number, prev: number) =>
      prev === 0 ? (cur > 0 ? '+new' : '±0%') : `${cur >= prev ? '+' : ''}${Math.round(((cur - prev) / prev) * 100)}%`;
    const mood = (v: number | null) => (v === null ? 'n/a' : v.toFixed(1));
    return [
      `Last 30 days vs the 30 before (${activeDays} of 30 days had activity):`,
      `- Tasks completed: ${current.tasksCompleted} (${pct(current.tasksCompleted, previous.tasksCompleted)})`,
      `- Habit check-ins: ${current.habitChecks} (${pct(current.habitChecks, previous.habitChecks)})`,
      `- Avg mood: ${mood(current.moodAvg)} (before: ${mood(previous.moodAvg)})`,
      `- Spent: ${(current.spentMinor / 100).toFixed(2)} (${pct(current.spentMinor, previous.spentMinor)}), earned: ${(current.earnedMinor / 100).toFixed(2)}`,
      // Training only earns a line once there IS training — a zero here would
      // invite the model to comment on a domain the user doesn't use.
      ...(current.workouts > 0 || previous.workouts > 0
        ? [
            `- Workouts: ${current.workouts} (${pct(current.workouts, previous.workouts)}), ` +
              `${Math.round(current.volumeGrams / 1000)} kg total volume`,
          ]
        : []),
    ].join('\n');
  }

}

function tag(metric: StatsMetric, rows: { day: string; value: number }[]): MetricRow[] {
  return rows.map((r) => ({ metric, day: r.day, value: Number(r.value) }));
}
