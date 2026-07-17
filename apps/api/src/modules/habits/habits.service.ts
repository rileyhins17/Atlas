import { Injectable, NotFoundException } from '@nestjs/common';
import type { CreateHabitInput, HabitDTO, LogHabitInput, UpdateHabitInput } from '@atlas/shared';
import type { Habit, HabitLog } from '@atlas/db';
import { PrismaService } from '../../core/prisma.service.js';
import { TimelineService } from '../../core/timeline.service.js';
import { computeStreak, dayKey } from './habits.util.js';

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

  async list(userId: string): Promise<HabitDTO[]> {
    const habits = await this.prisma.client.habit.findMany({
      where: { userId, active: true },
      orderBy: { createdAt: 'asc' },
    });
    if (habits.length === 0) return [];
    const since = new Date();
    since.setUTCDate(since.getUTCDate() - 400);
    const logs = await this.prisma.client.habitLog.findMany({
      where: { userId, loggedAt: { gte: since } },
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
    const logs = await this.prisma.client.habitLog.findMany({ where: { habitId: id } });
    return this.toDto(habit, logs);
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
    const logs = await this.prisma.client.habitLog.findMany({ where: { habitId: id } });
    return this.toDto(habit, logs);
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
