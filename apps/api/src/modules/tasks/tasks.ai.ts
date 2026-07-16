import { Injectable, type OnModuleInit } from '@nestjs/common';
import type { AiContextChunk, AiToolSpec } from '@atlas/shared';
import { estimateTokens } from '@atlas/ai';
import { DomainModule, ModuleRegistryService } from '../../core/domain-module.js';
import { TasksService } from './tasks.service.js';

/**
 * Bridges the Tasks domain into the AI brain. Copy this file's shape when adding
 * any new domain: implement DomainModule, self-register in onModuleInit.
 */
@Injectable()
export class TasksAiAdapter implements DomainModule, OnModuleInit {
  readonly id = 'tasks';

  constructor(
    private readonly tasks: TasksService,
    private readonly registry: ModuleRegistryService,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async aiContext(userId: string): Promise<AiContextChunk> {
    const content = await this.tasks.summarize(userId);
    return { source: this.id, title: 'Tasks', content, tokensEstimate: estimateTokens(content) };
  }

  getToolSpecs(): AiToolSpec[] {
    return [
      {
        name: 'tasks.create',
        description: 'Create a task for the user.',
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Short task title' },
            notes: { type: 'string' },
            priority: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] },
            dueAt: { type: 'string', format: 'date-time' },
          },
          required: ['title'],
        },
      },
      {
        name: 'tasks.complete',
        description: 'Mark a task as done by its id.',
        parameters: {
          type: 'object',
          properties: { id: { type: 'string' } },
          required: ['id'],
        },
      },
    ];
  }
}
