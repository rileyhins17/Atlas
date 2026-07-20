import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module.js';
import { RoutineService } from './routine.service.js';
import { RoutineController } from './routine.controller.js';
import { RoutineAiAdapter } from './routine.ai.js';

@Module({
  imports: [AuthModule],
  controllers: [RoutineController],
  providers: [RoutineService, RoutineAiAdapter],
  exports: [RoutineService],
})
export class RoutineModule {}
