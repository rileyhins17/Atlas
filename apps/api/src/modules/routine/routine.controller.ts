import { Body, Controller, Delete, Get, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';
import {
  ReplaceRoutineInput,
  RoutineBlockInput,
  UpdateRoutineBlockInput,
  type RoutineBlockDTO,
} from '@atlas/shared';
import { ZodValidationPipe } from '../../common/zod.pipe.js';
import { SessionGuard } from '../../auth/session.guard.js';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import type { AuthedUser } from '../../auth/auth.service.js';
import { RoutineService } from './routine.service.js';

@Controller('routine')
@UseGuards(SessionGuard)
export class RoutineController {
  constructor(private readonly routine: RoutineService) {}

  @Get()
  list(@CurrentUser() user: AuthedUser): Promise<RoutineBlockDTO[]> {
    return this.routine.list(user.id);
  }

  /**
   * Replace the WEEKLY pattern. Onboarding submits the whole week at once;
   * date-specific blocks are untouched (see the service note).
   */
  @Put()
  replace(
    @CurrentUser() user: AuthedUser,
    @Body(new ZodValidationPipe(ReplaceRoutineInput)) body: ReplaceRoutineInput,
  ): Promise<RoutineBlockDTO[]> {
    return this.routine.replace(user.id, body);
  }

  @Post('blocks')
  add(
    @CurrentUser() user: AuthedUser,
    @Body(new ZodValidationPipe(RoutineBlockInput)) body: RoutineBlockInput,
  ): Promise<RoutineBlockDTO> {
    return this.routine.addBlock(user.id, body);
  }

  @Patch('blocks/:id')
  update(
    @CurrentUser() user: AuthedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateRoutineBlockInput)) body: UpdateRoutineBlockInput,
  ): Promise<RoutineBlockDTO> {
    return this.routine.updateBlock(user.id, id, body);
  }

  @Delete('blocks/:id')
  remove(@CurrentUser() user: AuthedUser, @Param('id') id: string): Promise<{ ok: true }> {
    return this.routine.removeBlock(user.id, id);
  }
}
