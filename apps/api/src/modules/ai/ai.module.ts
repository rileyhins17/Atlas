import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module.js';
import { AiController } from './ai.controller.js';
import { AiQuestionsService } from './ai-questions.service.js';

/**
 * Phase 1: status + dry-run + the AI-questions loop (list/answer/dismiss).
 * The orchestrator, chat, daily brief and tool routing land in Phase 2.
 */
@Module({
  imports: [AuthModule],
  controllers: [AiController],
  providers: [AiQuestionsService],
})
export class AiModule {}
