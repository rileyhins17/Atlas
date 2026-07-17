import { Module } from '@nestjs/common';
import { CoreModule } from './core/core.module.js';
import { AuthModule } from './auth/auth.module.js';
import { TasksModule } from './modules/tasks/tasks.module.js';
import { HabitsModule } from './modules/habits/habits.module.js';
import { AiModule } from './modules/ai/ai.module.js';

@Module({
  imports: [CoreModule, AuthModule, TasksModule, HabitsModule, AiModule],
})
export class AppModule {}
