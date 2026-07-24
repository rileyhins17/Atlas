import { Injectable } from '@nestjs/common';
import { Prisma } from '@atlas/db';
import type { StatsDTO } from '@atlas/shared';
import { PrismaService } from '../../core/prisma.service.js';
import { dayKeyInTz, localDayStartUtc } from '../ai/time.util.js';
import { assembleStats, type MetricRow, type StatsMetric } from './stats.assemble.js';

/**
 * Cross-domain rollups, bucketed by the USER'S local day (Postgres
 * `AT TIME ZONE`, parameter-bound — never interpolated). Each query spans both
 * the requested window and the one before it; the pure assembler zero-fills
 * and splits totals for the delta chips.
 */
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

    const [tasks, habits, mood, money, events] = await Promise.all([
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
    ]);

    const rows: MetricRow[] = [
      ...tag('tasks', tasks),
      ...tag('habits', habits),
      ...tag('mood', mood),
      ...money.flatMap((m) => [
        { metric: 'spent' as StatsMetric, day: m.day, value: Number(m.spent) },
        { metric: 'earned' as StatsMetric, day: m.day, value: Number(m.earned) },
      ]),
      ...tag('events', events),
    ];

    return assembleStats(rows, currentFromDay, days);
  }

  /** Compact 30-day summary for the weekly review — the correlation payoff. */
  async summarizeForAi(userId: string): Promise<string> {
    const stats = await this.rollup(userId, 30);
    const { current, previous } = stats.totals;
    const pct = (cur: number, prev: number) =>
      prev === 0 ? (cur > 0 ? '+new' : '±0%') : `${cur >= prev ? '+' : ''}${Math.round(((cur - prev) / prev) * 100)}%`;
    const mood = (v: number | null) => (v === null ? 'n/a' : v.toFixed(1));
    return [
      'Last 30 days vs the 30 before (for spotting cross-domain patterns):',
      `- Tasks completed: ${current.tasksCompleted} (${pct(current.tasksCompleted, previous.tasksCompleted)})`,
      `- Habit check-ins: ${current.habitChecks} (${pct(current.habitChecks, previous.habitChecks)})`,
      `- Avg mood: ${mood(current.moodAvg)} (before: ${mood(previous.moodAvg)})`,
      `- Spent: ${(current.spentMinor / 100).toFixed(2)} (${pct(current.spentMinor, previous.spentMinor)}), earned: ${(current.earnedMinor / 100).toFixed(2)}`,
    ].join('\n');
  }

}

function tag(metric: StatsMetric, rows: { day: string; value: number }[]): MetricRow[] {
  return rows.map((r) => ({ metric, day: r.day, value: Number(r.value) }));
}
