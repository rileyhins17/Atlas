import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module.js';
import { TasksService } from './tasks.service.js';
import { TasksController } from './tasks.controller.js';
import { TasksAiAdapter } from './tasks.ai.js';
import { TaskDurationService } from './task-duration.service.js';

@Module({
  imports: [AuthModule],
  controllers: [TasksController],
  providers: [TasksService, TasksAiAdapter, TaskDurationService],
  exports: [TasksService, TaskDurationService],
})
export class TasksModule {}
