import { Module } from '@nestjs/common';
import { LocalEmbedder } from '@atlas/ai';
import { AuthModule } from '../../auth/auth.module.js';
import { TasksModule } from '../tasks/tasks.module.js';
import { HabitsModule } from '../habits/habits.module.js';
import { JournalModule } from '../journal/journal.module.js';
import { NotesModule } from '../notes/notes.module.js';
import { CalendarModule } from '../calendar/calendar.module.js';
import { AiController } from './ai.controller.js';
import { AiQuestionsService } from './ai-questions.service.js';
import { ToolRouterService } from './tool-router.service.js';
import { OrchestratorService } from './orchestrator.service.js';
import { EmbeddingService } from './embedding.service.js';

/**
 * Phase 2: the AI brain. Imports every domain module for its exported service
 * so ToolRouterService can route tool calls to them directly (getToolSpecs()
 * already declared the tool names each module handles).
 */
@Module({
  imports: [AuthModule, TasksModule, HabitsModule, JournalModule, NotesModule, CalendarModule],
  controllers: [AiController],
  providers: [
    AiQuestionsService,
    ToolRouterService,
    OrchestratorService,
    EmbeddingService,
    // Single instance so the local embedding model is loaded into memory once
    // for the process, not per request.
    { provide: LocalEmbedder, useFactory: () => new LocalEmbedder() },
  ],
})
export class AiModule {}
