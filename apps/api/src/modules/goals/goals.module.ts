import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module.js';
import { GoalsService } from './goals.service.js';
import { GoalsController } from './goals.controller.js';
import { GoalsAiAdapter } from './goals.ai.js';

@Module({
  imports: [AuthModule],
  controllers: [GoalsController],
  providers: [GoalsService, GoalsAiAdapter],
  exports: [GoalsService],
})
export class GoalsModule {}
