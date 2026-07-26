import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CreateGoalInput, UpdateGoalInput, type GoalDTO } from '@atlas/shared';
import { ZodValidationPipe } from '../../common/zod.pipe.js';
import { SessionGuard } from '../../auth/session.guard.js';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import type { AuthedUser } from '../../auth/auth.service.js';
import { GoalsService } from './goals.service.js';

@Controller('goals')
@UseGuards(SessionGuard)
export class GoalsController {
  constructor(private readonly goals: GoalsService) {}

  @Get()
  list(@CurrentUser() user: AuthedUser): Promise<GoalDTO[]> {
    return this.goals.list(user.id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthedUser,
    @Body(new ZodValidationPipe(CreateGoalInput)) body: CreateGoalInput,
  ): Promise<GoalDTO> {
    return this.goals.create(user.id, body);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateGoalInput)) body: UpdateGoalInput,
  ): Promise<GoalDTO> {
    return this.goals.update(user.id, id, body);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthedUser, @Param('id') id: string): Promise<{ ok: true }> {
    return this.goals.remove(user.id, id);
  }
}
