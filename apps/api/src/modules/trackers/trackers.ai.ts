import { Injectable, type OnModuleInit } from '@nestjs/common';
import type { AiContextChunk, AiToolSpec } from '@atlas/shared';
import { estimateTokens } from '@atlas/ai';
import { DomainModule, ModuleRegistryService } from '../../core/domain-module.js';
import { TrackersService } from './trackers.service.js';

@Injectable()
export class TrackersAiAdapter implements DomainModule, OnModuleInit {
  readonly id = 'trackers';

  constructor(
    private readonly trackers: TrackersService,
    private readonly registry: ModuleRegistryService,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async aiContext(userId: string): Promise<AiContextChunk> {
    const content = await this.trackers.summarize(userId);
    return {
      source: this.id,
      title: 'Personal trackers',
      content,
      tokensEstimate: estimateTokens(content),
    };
  }

  getToolSpecs(): AiToolSpec[] {
    return [
      {
        name: 'trackers.log',
        description:
          "Record today's rating for one of the user's personal trackers, by its id. Only for " +
          'trackers that already exist — the id must come from the Personal trackers context. ' +
          'The scale is 1 to 10.',
        parameters: {
          type: 'object',
          properties: {
            trackerId: { type: 'string', description: 'The tracker to rate.' },
            value: { type: 'integer', minimum: 1, maximum: 10 },
            note: { type: 'string', description: 'Optional context in the user\u2019s words.' },
          },
          required: ['trackerId', 'value'],
        },
      },
    ];
  }
}
