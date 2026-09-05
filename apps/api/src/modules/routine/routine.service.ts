import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  ReplaceRoutineInput,
  RoutineBlockDTO,
  RoutineBlockInput,
  RoutineKind,
  UpdateRoutineBlockInput,
} from '@atlas/shared';
import type { RoutineBlock } from '@atlas/db';
import { PrismaService } from '../../core/prisma.service.js';
import { UserTimezoneService } from '../../core/user-timezone.service.js';
import { dayKeyInTz } from '../ai/time.util.js';

function toDto(b: RoutineBlock): RoutineBlockDTO {
  return {
    id: b.id,
    label: b.label,
    kind: b.kind as RoutineKind,
    days: b.days,
    onDate: b.onDate,
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

/** YYYY-MM-DD arithmetic without touching timezones. */
function shiftDay(day: string, delta: number): string {
  const [y, m, d] = day.split('-').map(Number);
  const t = new Date(Date.UTC(y!, m! - 1, d!));
  t.setUTCDate(t.getUTCDate() + delta);
  return t.toISOString().slice(0, 10);
}

@Injectable()
export class RoutineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly timezones: UserTimezoneService,
  ) {}

  private async today(userId: string): Promise<string> {
    return dayKeyInTz(new Date(), await this.timezones.get(userId));
  }

  /**
   * The weekly pattern plus any date-specific blocks from yesterday onward.
   * Past one-offs are deliberately excluded: they are history, and a shift
   * worker would otherwise accumulate an unbounded list of dead rows.
   */
  async list(userId: string): Promise<RoutineBlockDTO[]> {
    const from = shiftDay(await this.today(userId), -1);
    const blocks = await this.prisma.client.routineBlock.findMany({
      where: { userId, OR: [{ onDate: null }, { onDate: { gte: from } }] },
      orderBy: [{ onDate: 'asc' }, { startMin: 'asc' }],
    });
    return blocks.map(toDto);
  }

  /**
   * Replace the WEEKLY pattern atomically. Date-specific blocks survive
   * untouched — they describe particular days, so a change to "my typical week"
   * must not silently delete the shift you already logged for Thursday.
   */
  async replace(userId: string, input: ReplaceRoutineInput): Promise<RoutineBlockDTO[]> {
    await this.prisma.client.$transaction([
      this.prisma.client.routineBlock.deleteMany({ where: { userId, onDate: null } }),
      this.prisma.client.routineBlock.createMany({
        data: input.blocks.map((b) => ({ userId, ...b, onDate: b.onDate ?? null })),
      }),
    ]);
    return this.list(userId);
  }

  async addBlock(userId: string, input: RoutineBlockInput): Promise<RoutineBlockDTO> {
    const created = await this.prisma.client.routineBlock.create({
      data: { userId, ...input, onDate: input.onDate ?? null },
    });
    return toDto(created);
  }

  async updateBlock(
    userId: string,
    id: string,
    input: UpdateRoutineBlockInput,
  ): Promise<RoutineBlockDTO> {
    // userId in the filter is what stops one account editing another's block.
    const owned = await this.prisma.client.routineBlock.findFirst({ where: { id, userId } });
    if (!owned) throw new NotFoundException('Routine block not found');
    const updated = await this.prisma.client.routineBlock.update({ where: { id }, data: input });
    return toDto(updated);
  }

  async removeBlock(userId: string, id: string): Promise<{ ok: true }> {
    const deleted = await this.prisma.client.routineBlock.deleteMany({ where: { id, userId } });
    if (deleted.count === 0) throw new NotFoundException('Routine block not found');
    return { ok: true };
  }

  /** Compact weekly-schedule text for the AI context ("it knows your life"). */
  async summarize(userId: string): Promise<string> {
    const blocks = await this.list(userId);
    if (blocks.length === 0) return 'No routine set. The user has not described their typical week.';

    const weekly = blocks.filter((b) => !b.onDate);
    const dated = blocks.filter((b) => b.onDate);

    const describe = (b: RoutineBlockDTO) => {
      const when = b.onDate
        ? b.onDate
        : b.days === 127
          ? 'daily'
          : DAY_LETTERS.filter((_, i) => b.days & (1 << i)).join('');
      const wrap = b.startMin > b.endMin ? ' (overnight)' : '';
      const off = b.kind === 'off' ? ' — NOT working, this clears the usual block' : '';
      // The id is what makes routine.remove_block addressable.
      return `- [${b.id}] ${b.label}: ${fmt(b.startMin)}–${fmt(b.endMin)} ${when}${wrap}${off}`;
    };

    const parts: string[] = [];
    if (weekly.length > 0) {
      parts.push(
        `Typical week (the user's routine — use this to time suggestions):\n${weekly.map(describe).join('\n')}`,
      );
    }
    if (dated.length > 0) {
      parts.push(`Specific days that differ from the usual week:\n${dated.map(describe).join('\n')}`);
    }
    return parts.join('\n\n');
  }
}
