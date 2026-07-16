import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module.js';
import { AiController } from './ai.controller.js';

/**
 * Phase 0: status + dry-run only (no real model calls). The orchestrator, chat,
 * daily brief and tool routing land in Phase 2 and will live here.
 */
@Module({
  imports: [AuthModule],
  controllers: [AiController],
})
export class AiModule {}
