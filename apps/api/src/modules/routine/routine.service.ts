import { summarizeRoutine } from '@atlas/shared';
import { shiftCalendarDayKey as shiftDay } from '@atlas/shared';
import { serializeRoutineBlock as toDto } from '@atlas/shared';
import { readCollection } from '../../core/collection-pages.js';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  ReplaceRoutineInput,
  RoutineBlockDTO,
  RoutineBlockInput,
  UpdateRoutineBlockInput,
} from '@atlas/shared';
import { PrismaService } from '../../core/prisma.service.js';
import { UserTimezoneService } from '../../core/user-timezone.service.js';
import { dayKeyInTz } from '../ai/time.util.js';

/**
 * A week has 168 hours in it. Two hundred blocks is far more than anyone
 * describes and still small enough that reading them all is free.
 */
const MAX_ROUTINE_BLOCKS = 200;

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
    const blocks = await readCollection((page) => this.prisma.client.routineBlock.findMany({
      take: page.take, cursor: page.cursor, skip: page.skip,
      where: { userId, OR: [{ onDate: null }, { onDate: { gte: from } }] },
      orderBy: [{ onDate: 'asc' }, { startMin: 'asc' }, { id: 'asc' }],
    }));
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
    // Capped, and this one matters more than a typical quota: `routine.add_block`
    // is a tool the MODEL can call, and the routine is part of the context the
    // model is given on the next call. Uncapped, a chatty brain-dump can inflate
    // its own future context without limit, which costs tokens on every request
    // afterwards and slowly crowds every other domain out of the budget.
    const count = await this.prisma.client.routineBlock.count({ where: { userId } });
    if (count >= MAX_ROUTINE_BLOCKS) {
      throw new BadRequestException(
        `Your week already has ${MAX_ROUTINE_BLOCKS} blocks in it. Remove one to add another.`,
      );
    }
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
    return summarizeRoutine(blocks);
  }
}
