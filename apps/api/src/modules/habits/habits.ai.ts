import { Injectable } from '@nestjs/common';
import type { AiToolSpec } from '@atlas/shared';
import { RegisteredDomainModule, ModuleRegistryService } from '../../core/domain-module.js';
import { HabitsService } from './habits.service.js';

@Injectable()
export class HabitsAiAdapter extends RegisteredDomainModule {
  readonly id = 'habits';
  readonly contextTitle = 'Habits';
  /** See DEFAULT_CONTEXT_PRIORITY for what this ordering is for. */
  readonly contextPriority = 50;

  constructor(
    habits: HabitsService,
    registry: ModuleRegistryService,
  ) {
    super(registry, habits);
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
      {
        name: 'habits.create',
        description:
          'Start tracking a new habit. Use when the user says they want to start doing something ' +
          'regularly ("I want to read every day").',
        parameters: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            cadence: { type: 'string', enum: ['daily', 'weekly'] },
            target: { type: 'integer', description: 'Times per period, default 1' },
          },
          required: ['name'],
        },
      },
      {
        name: 'habits.update',
        description:
          'Rename a habit, change how often it is meant to happen, or pause it by setting ' +
          'active=false. Use the id from the Habits context.',
        parameters: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            cadence: { type: 'string', enum: ['daily', 'weekly'] },
            target: { type: 'integer' },
            active: { type: 'boolean', description: 'false pauses it without losing history' },
          },
          required: ['id'],
        },
      },
      {
        name: 'habits.delete',
        description:
          'Stop tracking a habit entirely and remove it from the checklist. This also removes ' +
          'its check-in history — prefer habits.update with active=false when the user just ' +
          'wants it off their plate for now.',
        parameters: {
          type: 'object',
          properties: { id: { type: 'string' } },
          required: ['id'],
        },
      },
    ];
  }
}
