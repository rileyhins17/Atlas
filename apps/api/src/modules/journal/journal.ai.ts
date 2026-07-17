import { Injectable, type OnModuleInit } from '@nestjs/common';
import type { AiContextChunk, AiToolSpec } from '@atlas/shared';
import { estimateTokens } from '@atlas/ai';
import { DomainModule, ModuleRegistryService } from '../../core/domain-module.js';
import { JournalService } from './journal.service.js';

@Injectable()
export class JournalAiAdapter implements DomainModule, OnModuleInit {
  readonly id = 'journal';

  constructor(
    private readonly journal: JournalService,
    private readonly registry: ModuleRegistryService,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async aiContext(userId: string): Promise<AiContextChunk> {
    const content = await this.journal.summarize(userId);
    return { source: this.id, title: 'Journal', content, tokensEstimate: estimateTokens(content) };
  }

  getToolSpecs(): AiToolSpec[] {
    return [
      {
        name: 'journal.add',
        description: 'Append a journal entry for the user (optionally with a 1-5 mood).',
        parameters: {
          type: 'object',
          properties: {
            body: { type: 'string' },
            mood: { type: 'number', description: '1 (low) to 5 (great)' },
          },
          required: ['body'],
        },
      },
    ];
  }
}
