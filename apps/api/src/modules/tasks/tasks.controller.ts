import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  CreateTaskInput,
  PaginationQuery,
  UpdateTaskInput,
  type DurationEstimate,
  type TaskDTO,
} from '@atlas/shared';
import { ZodValidationPipe } from '../../common/zod.pipe.js';
import { SessionGuard } from '../../auth/session.guard.js';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import type { AuthedUser } from '../../auth/auth.service.js';
import { TasksService } from './tasks.service.js';
import { TaskDurationService } from './task-duration.service.js';

@Controller('tasks')
@UseGuards(SessionGuard)
export class TasksController {
  constructor(
    private readonly tasks: TasksService,
    private readonly durations: TaskDurationService,
  ) {}

  /**
   * What the user's own history says about how long their work takes.
   *
   * Deliberately not folded into TaskDTO: it is derived, it is the same answer
   * for every row with the same title, and keeping it separate means the task
   * list stays one query. Declared before the parameterised routes so
   * "durations" is never read as a task id.
   */
  @Get('durations')
  async durationEstimates(@CurrentUser() user: AuthedUser): Promise<DurationEstimate[]> {
    return [...(await this.durations.estimates(user.id)).values()];
  }

  @Get()
  list(
    @CurrentUser() user: AuthedUser,
    @Query(new ZodValidationPipe(PaginationQuery)) page: PaginationQuery,
  ): Promise<TaskDTO[]> {
    return this.tasks.list(user.id, page);
  }

  @Post()
  create(
    @CurrentUser() user: AuthedUser,
    @Body(new ZodValidationPipe(CreateTaskInput)) body: CreateTaskInput,
  ): Promise<TaskDTO> {
    return this.tasks.create(user.id, body);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateTaskInput)) body: UpdateTaskInput,
  ): Promise<TaskDTO> {
    return this.tasks.update(user.id, id, body);
  }

  @Post(':id/complete')
  complete(@CurrentUser() user: AuthedUser, @Param('id') id: string): Promise<TaskDTO> {
    return this.tasks.complete(user.id, id);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthedUser, @Param('id') id: string): Promise<{ ok: true }> {
    return this.tasks.remove(user.id, id);
  }
}
