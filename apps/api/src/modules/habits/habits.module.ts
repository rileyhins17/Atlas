import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module.js';
import { HabitsService } from './habits.service.js';
import { HabitsController } from './habits.controller.js';
import { HabitsAiAdapter } from './habits.ai.js';

@Module({
  imports: [AuthModule],
  controllers: [HabitsController],
  providers: [HabitsService, HabitsAiAdapter],
  exports: [HabitsService],
})
export class HabitsModule {}
