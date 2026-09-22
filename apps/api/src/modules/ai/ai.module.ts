import { Module } from '@nestjs/common';
import { LocalEmbedder } from '@atlas/ai';
import { AuthModule } from '../../auth/auth.module.js';
import { TasksModule } from '../tasks/tasks.module.js';
import { PushModule } from '../push/push.module.js';
import { StatsModule } from '../stats/stats.module.js';
import { AiController } from './ai.controller.js';
import { AiQuestionsService } from './ai-questions.service.js';
import { ToolRouterService } from './tool-router.service.js';
import { OrchestratorService } from './orchestrator.service.js';
import { EmbeddingService } from './embedding.service.js';
import { ProactiveService } from './proactive.service.js';

/**
 * The AI brain. It knows no domain by name: context and tools both arrive
 * through the global ModuleRegistryService, which every domain's `*.ai.ts`
 * adapter registers with. The imports here are only for services the
 * orchestrator calls directly — task durations for planning, stats for the
 * weekly review, push for the proactive briefs.
 */
@Module({
  imports: [AuthModule, TasksModule, PushModule, StatsModule],
  controllers: [AiController],
  providers: [
    AiQuestionsService,
    ToolRouterService,
    OrchestratorService,
    EmbeddingService,
    ProactiveService,
    // Single instance so the local embedding model is loaded into memory once
    // for the process, not per request.
    { provide: LocalEmbedder, useFactory: () => new LocalEmbedder() },
  ],
})
export class AiModule {}
