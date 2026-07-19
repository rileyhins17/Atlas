import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  CreateHabitInput,
  HabitDTO,
  HabitHistoryDTO,
  LogHabitInput,
  UpdateHabitInput,
} from '@atlas/shared';
import type { Habit, HabitLog } from '@atlas/db';
import { PrismaService } from '../../core/prisma.service.js';
import { TimelineService } from '../../core/timeline.service.js';
import { computeStreak, dayKey } from './habits.util.js';

/** How far back streak math ever needs to look. */
const STREAK_WINDOW_DAYS = 400;

@Injectable()
export class HabitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly timeline: TimelineService,
  ) {}

  private async owned(userId: string, id: string): Promise<Habit> {
    const habit = await this.prisma.client.habit.findFirst({ where: { id, userId } });
    if (!habit) throw new NotFoundException('Habit not found');
    return habit;
  }

  private toDto(habit: Habit, logs: HabitLog[]): HabitDTO {
    const perDay = new Map<string, number>();
    for (const log of logs) {
      const k = dayKey(log.loggedAt);
      perDay.set(k, (perDay.get(k) ?? 0) + log.value);
    }
    const todayCount = perDay.get(dayKey(new Date())) ?? 0;
    return {
      id: habit.id,
      name: habit.name,
      cadence: habit.cadence,
      target: habit.target,
      active: habit.active,
      todayCount,
      doneToday: todayCount >= habit.target,
      streak: computeStreak(perDay, habit.target),
      createdAt: habit.createdAt.toISOString(),
    };
  }

  /**
   * Streaks only ever look back over recent history, so bound every log read to
   * the same window. Without this, a long-lived habit's log query grows without
   * limit and gets slower every day it's used.
   */
  private static streakWindowStart(): Date {
    const since = new Date();
    since.setUTCDate(since.getUTCDate() - STREAK_WINDOW_DAYS);
    return since;
  }

  /** Logs for one habit, userId-scoped and time-bounded. */
  private logsForHabit(userId: string, habitId: string): Promise<HabitLog[]> {
    return this.prisma.client.habitLog.findMany({
      where: { userId, habitId, loggedAt: { gte: HabitsService.streakWindowStart() } },
    });
  }

  async list(userId: string): Promise<HabitDTO[]> {
    const habits = await this.prisma.client.habit.findMany({
      where: { userId, active: true },
      orderBy: { createdAt: 'asc' },
      // Active habits are inherently few; cap anyway so this can never go unbounded.
      take: 200,
    });
    if (habits.length === 0) return [];
    const logs = await this.prisma.client.habitLog.findMany({
      where: { userId, loggedAt: { gte: HabitsService.streakWindowStart() } },
    });
    const byHabit = new Map<string, HabitLog[]>();
    for (const log of logs) {
      const arr = byHabit.get(log.habitId) ?? [];
      arr.push(log);
      byHabit.set(log.habitId, arr);
    }
    return habits.map((h) => this.toDto(h, byHabit.get(h.id) ?? []));
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
    return this.toDto(habit, []);
  }

  async update(userId: string, id: string, input: UpdateHabitInput): Promise<HabitDTO> {
    await this.owned(userId, id);
    const habit = await this.prisma.client.habit.update({ where: { id }, data: input });
    return this.toDto(habit, await this.logsForHabit(userId, id));
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
    return this.toDto(habit, await this.logsForHabit(userId, id));
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
    const since = new Date();
    since.setUTCDate(since.getUTCDate() - days);
    const logs = await this.prisma.client.habitLog.findMany({
      where: { userId, loggedAt: { gte: since } },
      select: { habitId: true, loggedAt: true, value: true },
    });
    const perHabit = new Map<string, Map<string, number>>(habits.map((h) => [h.id, new Map()]));
    for (const log of logs) {
      const dayMap = perHabit.get(log.habitId);
      if (!dayMap) continue; // log for an archived habit
      const k = dayKey(log.loggedAt);
      dayMap.set(k, (dayMap.get(k) ?? 0) + log.value);
    }
    return habits.map((h) => ({
      habitId: h.id,
      days: [...(perHabit.get(h.id) ?? new Map<string, number>())].map(([day, count]) => ({
        day,
        count,
      })),
    }));
  }

  /** Compact summary for the AI context builder. */
  async summarize(userId: string): Promise<string> {
    const habits = await this.list(userId);
    if (habits.length === 0) return 'No habits tracked.';
    const lines = habits.map(
      (h) => `- ${h.name}: ${h.doneToday ? 'done today' : 'not yet today'}, streak ${h.streak}d`,
    );
    return `${habits.length} habit(s):\n${lines.join('\n')}`;
  }
}
