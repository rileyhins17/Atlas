import { Injectable, type OnModuleInit } from '@nestjs/common';
import type { AiContextChunk, AiToolSpec } from '@atlas/shared';
import { estimateTokens } from '@atlas/ai';
import { DomainModule, ModuleRegistryService } from '../../core/domain-module.js';
import { HabitsService } from './habits.service.js';

@Injectable()
export class HabitsAiAdapter implements DomainModule, OnModuleInit {
  readonly id = 'habits';

  constructor(
    private readonly habits: HabitsService,
    private readonly registry: ModuleRegistryService,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async aiContext(userId: string): Promise<AiContextChunk> {
    const content = await this.habits.summarize(userId);
    return { source: this.id, title: 'Habits', content, tokensEstimate: estimateTokens(content) };
  }

  getToolSpecs(): AiToolSpec[] {
    return [
      {
        name: 'habits.log',
        description: "Record a check-in for one of the user's habits by its id.",
        parameters: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            value: { type: 'number', description: 'Amount to log (default 1)' },
          },
          required: ['id'],
        },
      },
    ];
  }
}
