import { Injectable } from '@nestjs/common';
import type { ReplaceRoutineInput, RoutineBlockDTO, RoutineKind } from '@atlas/shared';
import type { RoutineBlock } from '@atlas/db';
import { PrismaService } from '../../core/prisma.service.js';

function toDto(b: RoutineBlock): RoutineBlockDTO {
  return {
    id: b.id,
    label: b.label,
    kind: b.kind as RoutineKind,
    days: b.days,
    startMin: b.startMin,
    endMin: b.endMin,
  };
}

function fmt(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

@Injectable()
export class RoutineService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string): Promise<RoutineBlockDTO[]> {
    const blocks = await this.prisma.client.routineBlock.findMany({
      where: { userId },
      orderBy: { startMin: 'asc' },
    });
    return blocks.map(toDto);
  }

  /**
   * Replace the whole schedule atomically — onboarding (and future editors)
   * always submit the full picture, so partial updates can't strand stale blocks.
   */
  async replace(userId: string, input: ReplaceRoutineInput): Promise<RoutineBlockDTO[]> {
    await this.prisma.client.$transaction([
      this.prisma.client.routineBlock.deleteMany({ where: { userId } }),
      this.prisma.client.routineBlock.createMany({
        data: input.blocks.map((b) => ({ userId, ...b })),
      }),
    ]);
    return this.list(userId);
  }

  /** Compact weekly-schedule text for the AI context ("it knows your life"). */
  async summarize(userId: string): Promise<string> {
    const blocks = await this.list(userId);
    if (blocks.length === 0) return 'No routine set. The user has not described their typical week.';
    const lines = blocks.map((b) => {
      const days =
        b.days === 127
          ? 'daily'
          : DAY_LETTERS.filter((_, i) => b.days & (1 << i)).join('');
      const wrap = b.startMin > b.endMin ? ' (overnight)' : '';
      return `- ${b.label}: ${fmt(b.startMin)}–${fmt(b.endMin)} ${days}${wrap}`;
    });
    return `Typical week (the user's routine — use this to time suggestions):\n${lines.join('\n')}`;
  }
}
