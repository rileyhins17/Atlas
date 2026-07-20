import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { ReplaceRoutineInput, type RoutineBlockDTO } from '@atlas/shared';
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

  @Put()
  replace(
    @CurrentUser() user: AuthedUser,
    @Body(new ZodValidationPipe(ReplaceRoutineInput)) body: ReplaceRoutineInput,
  ): Promise<RoutineBlockDTO[]> {
    return this.routine.replace(user.id, body);
  }
}
