import { serializeHabit, groupHabitTotals, assembleHabitHistory, type HabitDayTotal, localDayStartUtc } from '@atlas/shared';
import { summarizeHabits } from '@atlas/shared';
import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  CreateHabitInput,
  HabitDTO,
  HabitHistoryDTO,
  LogHabitInput,
  UpdateHabitInput,
} from '@atlas/shared';
import { Prisma, type Habit } from '@atlas/db';
import { PrismaService } from '../../core/prisma.service.js';
import { TimelineService } from '../../core/timeline.service.js';
import { UserTimezoneService } from '../../core/user-timezone.service.js';

/** How far back streak math ever needs to look. */
const STREAK_WINDOW_DAYS = 400;

@Injectable()
export class HabitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly timeline: TimelineService,
    private readonly timezones: UserTimezoneService,
  ) {}

  /** Ownership-scoped read, shared with the AI tool router for undo state. */
  async owned(userId: string, id: string): Promise<Habit> {
    const habit = await this.prisma.client.habit.findFirst({ where: { id, userId } });
    if (!habit) throw new NotFoundException('Habit not found');
    return habit;
  }

  private toDto(habit: Habit, logs: HabitDayTotal[], timezone: string, now = new Date()): HabitDTO {
    return serializeHabit(habit, logs, now, now, timezone);
  }

  /** Aggregate before crossing the database boundary: never truncate check-ins.
   * loggedAt is Prisma's timestamp without timezone, stored as UTC. Convert
   * to the owner's bound timezone before grouping; raw timestamps stay intact.
   */
  private dailyTotals(userId: string, habitIds: string[], since: Date, timezone: string): Promise<HabitDayTotal[]> {
    if (habitIds.length === 0) return Promise.resolve([]);
    return this.prisma.client.$queryRaw<HabitDayTotal[]>(Prisma.sql`
      SELECT "habitId", ((("loggedAt" AT TIME ZONE 'UTC') AT TIME ZONE ${timezone})::date)::text AS day,
             SUM(value)::float AS value
      FROM habit_logs
      WHERE "userId" = ${userId} AND "habitId" IN (${Prisma.join(habitIds)})
        AND "loggedAt" >= ${since}
      GROUP BY 1, 2
      ORDER BY 2 ASC
    `);
  }

  private logsForHabit(userId: string, habitId: string, timezone: string, now: Date): Promise<HabitDayTotal[]> {
    return this.dailyTotals(userId, [habitId], localDayStartUtc(timezone, now, -(STREAK_WINDOW_DAYS - 1)), timezone);
  }

  async list(userId: string): Promise<HabitDTO[]> {
    const habits = await this.prisma.client.habit.findMany({
      where: { userId, active: true },
      orderBy: { createdAt: 'asc' },
      // Active habits are inherently few; cap anyway so this can never go unbounded.
      take: 200,
    });
    if (habits.length === 0) return [];
    const timezone = await this.timezones.get(userId);
    const now = new Date();
    const logs = await this.dailyTotals(userId, habits.map((h) => h.id), localDayStartUtc(timezone, now, -(STREAK_WINDOW_DAYS - 1)), timezone);
    const byHabit = groupHabitTotals(logs);
    return habits.map((h) => this.toDto(h, byHabit.get(h.id) ?? [], timezone, now));
  }

  async create(userId: string, input: CreateHabitInput): Promise<HabitDTO> {
    const habit = await this.prisma.client.habit.create({
      data: { userId, name: input.name, cadence: input.cadence, target: input.target },
    });
    await this.timeline.write({
      userId,
      type: 'habit.created',
      source: 'habits',
      title: `New habit: ${habit.name}`,
      refType: 'habit',
      refId: habit.id,
    });
    return this.toDto(habit, [], await this.timezones.get(userId));
  }

  async update(userId: string, id: string, input: UpdateHabitInput): Promise<HabitDTO> {
    await this.owned(userId, id);
    const habit = await this.prisma.client.habit.update({ where: { id }, data: input });
    const timezone = await this.timezones.get(userId);
    const now = new Date();
    return this.toDto(habit, await this.logsForHabit(userId, id, timezone, now), timezone, now);
  }

  async log(userId: string, id: string, input: LogHabitInput): Promise<HabitDTO> {
    const habit = await this.owned(userId, id);
    await this.prisma.client.habitLog.create({
      data: { userId, habitId: id, value: input.value, note: input.note },
    });
    await this.timeline.write({
      userId,
      type: 'habit.logged',
      source: 'habits',
      title: `Logged habit: ${habit.name}`,
      refType: 'habit',
      refId: habit.id,
      payload: { value: input.value },
    });
    const timezone = await this.timezones.get(userId);
    const now = new Date();
    return this.toDto(habit, await this.logsForHabit(userId, id, timezone, now), timezone, now);
  }

  async remove(userId: string, id: string): Promise<{ ok: true }> {
    const habit = await this.owned(userId, id);
    // Soft-delete: keep history, drop from active lists.
    await this.prisma.client.habit.update({ where: { id }, data: { active: false } });
    await this.timeline.write({
      userId,
      type: 'habit.archived',
      source: 'habits',
      title: `Archived habit: ${habit.name}`,
      refType: 'habit',
      refId: habit.id,
    });
    return { ok: true };
  }

  /**
   * Day-keyed check-in counts for every active habit — feeds the week grids
   * and year heatmaps. One bounded query across all habits; zero-log days are
   * omitted (the client fills gaps).
   */
  async history(userId: string, days: number): Promise<HabitHistoryDTO[]> {
    const habits = await this.prisma.client.habit.findMany({
      where: { userId, active: true },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
      take: 200,
    });
    if (habits.length === 0) return [];
    const timezone = await this.timezones.get(userId);
    const since = localDayStartUtc(timezone, new Date(), -(days - 1));
    const logs = await this.dailyTotals(userId, habits.map((h) => h.id), since, timezone);
    return assembleHabitHistory(habits, logs);
  }

  /** Compact summary for the AI context builder. */
  async summarize(userId: string): Promise<string> {
    const habits = await this.list(userId);
    return summarizeHabits(habits);
  }
}
