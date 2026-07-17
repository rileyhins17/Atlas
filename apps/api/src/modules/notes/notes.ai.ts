import { Injectable, type OnModuleInit } from '@nestjs/common';
import type { AiContextChunk, AiToolSpec } from '@atlas/shared';
import { estimateTokens } from '@atlas/ai';
import { DomainModule, ModuleRegistryService } from '../../core/domain-module.js';
import { NotesService } from './notes.service.js';

@Injectable()
export class NotesAiAdapter implements DomainModule, OnModuleInit {
  readonly id = 'notes';

  constructor(
    private readonly notes: NotesService,
    private readonly registry: ModuleRegistryService,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async aiContext(userId: string): Promise<AiContextChunk> {
    const content = await this.notes.summarize(userId);
    return { source: this.id, title: 'Notes / known facts', content, tokensEstimate: estimateTokens(content) };
  }

  getToolSpecs(): AiToolSpec[] {
    return [
      {
        name: 'notes.remember',
        description: 'Save a durable fact about the user (pin it to keep it always in context).',
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            body: { type: 'string' },
            pinned: { type: 'boolean' },
          },
          required: ['body'],
        },
      },
    ];
  }
}
