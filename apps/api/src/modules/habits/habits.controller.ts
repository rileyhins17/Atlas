import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import {
  CreateHabitInput,
  HabitHistoryQuery,
  LogHabitInput,
  UpdateHabitInput,
  type HabitDTO,
  type HabitHistoryDTO,
} from '@atlas/shared';
import { ZodValidationPipe } from '../../common/zod.pipe.js';
import { SessionGuard } from '../../auth/session.guard.js';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import type { AuthedUser } from '../../auth/auth.service.js';
import { HabitsService } from './habits.service.js';

@Controller('habits')
@UseGuards(SessionGuard)
export class HabitsController {
  constructor(private readonly habits: HabitsService) {}

  @Get()
  list(@CurrentUser() user: AuthedUser): Promise<HabitDTO[]> {
    return this.habits.list(user.id);
  }

  @Get('history')
  history(
    @CurrentUser() user: AuthedUser,
    @Query(new ZodValidationPipe(HabitHistoryQuery)) query: HabitHistoryQuery,
  ): Promise<HabitHistoryDTO[]> {
    return this.habits.history(user.id, query.days);
  }

  @Post()
  create(
    @CurrentUser() user: AuthedUser,
    @Body(new ZodValidationPipe(CreateHabitInput)) body: CreateHabitInput,
  ): Promise<HabitDTO> {
    return this.habits.create(user.id, body);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateHabitInput)) body: UpdateHabitInput,
  ): Promise<HabitDTO> {
    return this.habits.update(user.id, id, body);
  }

  @Post(':id/log')
  logHabit(
    @CurrentUser() user: AuthedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(LogHabitInput)) body: LogHabitInput,
  ): Promise<HabitDTO> {
    return this.habits.log(user.id, id, body);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthedUser, @Param('id') id: string): Promise<{ ok: true }> {
    return this.habits.remove(user.id, id);
  }
}
