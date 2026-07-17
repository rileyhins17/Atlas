import { Injectable, type OnModuleInit } from '@nestjs/common';
import type { AiContextChunk, AiToolSpec } from '@atlas/shared';
import { estimateTokens } from '@atlas/ai';
import { DomainModule, ModuleRegistryService } from '../../core/domain-module.js';
import { CalendarService } from './calendar.service.js';

@Injectable()
export class CalendarAiAdapter implements DomainModule, OnModuleInit {
  readonly id = 'calendar';

  constructor(
    private readonly calendar: CalendarService,
    private readonly registry: ModuleRegistryService,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async aiContext(userId: string): Promise<AiContextChunk> {
    const content = await this.calendar.summarize(userId);
    return { source: this.id, title: 'Calendar', content, tokensEstimate: estimateTokens(content) };
  }

  getToolSpecs(): AiToolSpec[] {
    return [
      {
        name: 'calendar.add',
        description: 'Create a calendar event for the user.',
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            startAt: { type: 'string', format: 'date-time' },
            endAt: { type: 'string', format: 'date-time' },
            location: { type: 'string' },
          },
          required: ['title', 'startAt', 'endAt'],
        },
      },
    ];
  }
}
