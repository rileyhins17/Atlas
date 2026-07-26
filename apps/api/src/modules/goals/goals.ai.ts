import { Injectable, type OnModuleInit } from '@nestjs/common';
import type { AiContextChunk, AiToolSpec } from '@atlas/shared';
import { estimateTokens } from '@atlas/ai';
import { DomainModule, ModuleRegistryService } from '../../core/domain-module.js';
import { GoalsService } from './goals.service.js';

@Injectable()
export class GoalsAiAdapter implements DomainModule, OnModuleInit {
  readonly id = 'goals';

  constructor(
    private readonly goals: GoalsService,
    private readonly registry: ModuleRegistryService,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async aiContext(userId: string): Promise<AiContextChunk> {
    const content = await this.goals.summarize(userId);
    return { source: this.id, title: 'Goals', content, tokensEstimate: estimateTokens(content) };
  }

  getToolSpecs(): AiToolSpec[] {
    return [
      {
        name: 'goals.create',
        description:
          'Record something the user is working toward. horizon "short" is an active push they ' +
          'expect progress on soon; "long" is direction they are steering by. When the user ' +
          'does not say which, infer from ambition rather than from any date: "run a marathon ' +
          'next spring" is short, "be financially independent" is long.',
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            description: { type: 'string' },
            horizon: { type: 'string', enum: ['short', 'long'] },
            targetDate: { type: 'string', format: 'date-time' },
          },
          required: ['title'],
        },
      },
      {
        name: 'goals.update',
        description:
          'Change a goal, move it between short and long term, or mark it achieved/paused/' +
          'dropped. Use the id from the Goals context.',
        parameters: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            title: { type: 'string' },
            description: { type: 'string' },
            horizon: { type: 'string', enum: ['short', 'long'] },
            targetDate: { type: 'string', format: 'date-time' },
            status: { type: 'string', enum: ['active', 'achieved', 'paused', 'dropped'] },
          },
          required: ['id'],
        },
      },
      {
        name: 'goals.delete',
        description:
          'Delete a goal outright. Prefer goals.update with status "achieved" or "dropped" — ' +
          'those keep it in the record, which is the point of having goals at all.',
        parameters: {
          type: 'object',
          properties: { id: { type: 'string' } },
          required: ['id'],
        },
      },
    ];
  }
}
