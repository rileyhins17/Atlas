import { Injectable, type OnModuleInit } from '@nestjs/common';
import type { AiContextChunk } from '@atlas/shared';
import { estimateTokens } from '@atlas/ai';
import { DomainModule, ModuleRegistryService } from '../../core/domain-module.js';
import type { DomainTool } from '../../core/domain-tool.js';
import { WearablesService } from './wearables.service.js';

/**
 * Hands the model last night's sleep, today's steps, resting heart rate and
 * recent watch workouts — measured facts, so "you slept 5h 40m" can inform a
 * plan without the model having to guess how someone is doing.
 *
 * No tools: the watch is the only writer of this data.
 */
@Injectable()
export class WearablesAiAdapter implements DomainModule, OnModuleInit {
  readonly id = 'wearables';
  /** See DEFAULT_CONTEXT_PRIORITY: after training, before the journal. */
  readonly contextPriority = 85;

  constructor(
    private readonly wearables: WearablesService,
    private readonly registry: ModuleRegistryService,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async aiContext(userId: string): Promise<AiContextChunk> {
    const content = await this.wearables.summarize(userId);
    return { source: this.id, title: 'Watch (sleep, steps, heart)', content, tokensEstimate: estimateTokens(content) };
  }

  tools(): DomainTool[] {
    return [];
  }
}
