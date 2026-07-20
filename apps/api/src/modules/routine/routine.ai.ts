import { Injectable, type OnModuleInit } from '@nestjs/common';
import type { AiContextChunk, AiToolSpec } from '@atlas/shared';
import { estimateTokens } from '@atlas/ai';
import { DomainModule, ModuleRegistryService } from '../../core/domain-module.js';
import { RoutineService } from './routine.service.js';

/**
 * Feeds the user's typical week into every AI call, so briefs and suggestions
 * are timed to their actual life (don't propose deep work at their bedtime).
 * No tools — the routine is edited by the human, not the model.
 */
@Injectable()
export class RoutineAiAdapter implements DomainModule, OnModuleInit {
  readonly id = 'routine';

  constructor(
    private readonly routine: RoutineService,
    private readonly registry: ModuleRegistryService,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async aiContext(userId: string): Promise<AiContextChunk> {
    const content = await this.routine.summarize(userId);
    return { source: this.id, title: 'Routine', content, tokensEstimate: estimateTokens(content) };
  }

  getToolSpecs(): AiToolSpec[] {
    return [];
  }
}
