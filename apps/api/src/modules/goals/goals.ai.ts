import { Injectable } from '@nestjs/common';
import type { AiToolSpec } from '@atlas/shared';
import { RegisteredDomainModule, ModuleRegistryService } from '../../core/domain-module.js';
import { GoalsService } from './goals.service.js';

@Injectable()
export class GoalsAiAdapter extends RegisteredDomainModule {
  readonly id = 'goals';
  readonly contextTitle = 'Goals';
  /** See DEFAULT_CONTEXT_PRIORITY for what this ordering is for. */
  readonly contextPriority = 60;

  constructor(
    goals: GoalsService,
    registry: ModuleRegistryService,
  ) {
    super(registry, goals);
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
