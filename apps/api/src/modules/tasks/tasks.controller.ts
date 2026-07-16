import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CreateTaskInput, UpdateTaskInput, type TaskDTO } from '@atlas/shared';
import { ZodValidationPipe } from '../../common/zod.pipe.js';
import { SessionGuard } from '../../auth/session.guard.js';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import type { AuthedUser } from '../../auth/auth.service.js';
import { TasksService } from './tasks.service.js';

@Controller('tasks')
@UseGuards(SessionGuard)
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get()
  list(@CurrentUser() user: AuthedUser): Promise<TaskDTO[]> {
    return this.tasks.list(user.id);
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
