import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module.js';
import { TasksService } from './tasks.service.js';
import { TasksController } from './tasks.controller.js';
import { TasksAiAdapter } from './tasks.ai.js';

@Module({
  imports: [AuthModule],
  controllers: [TasksController],
  providers: [TasksService, TasksAiAdapter],
  exports: [TasksService],
})
export class TasksModule {}
