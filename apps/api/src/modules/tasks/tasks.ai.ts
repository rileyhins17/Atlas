import { Injectable } from '@nestjs/common';
import type { AiToolSpec } from '@atlas/shared';
import { RegisteredDomainModule, ModuleRegistryService } from '../../core/domain-module.js';
import { TasksService } from './tasks.service.js';

/**
 * Bridges the Tasks domain into the AI brain. Copy this file's shape when adding
 * any new domain: extend RegisteredDomainModule and declare its metadata/tools.
 */
@Injectable()
export class TasksAiAdapter extends RegisteredDomainModule {
  readonly id = 'tasks';
  readonly contextTitle = 'Tasks';
  /** See DEFAULT_CONTEXT_PRIORITY for what this ordering is for. */
  readonly contextPriority = 30;

  constructor(
    tasks: TasksService,
    registry: ModuleRegistryService,
  ) {
    super(registry, tasks);
  }

  getToolSpecs(): AiToolSpec[] {
    return [
      {
        name: 'tasks.create',
        description:
          "Create a task. dueAt is the user's LOCAL time (see the Now block) — do not convert " +
          'to UTC. Set recurrence for anything that repeats.',
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Short task title' },
            notes: { type: 'string' },
            priority: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] },
            dueAt: { type: 'string', format: 'date-time', description: 'Local due date/time' },
            recurrence: {
              type: 'string',
              description:
                'RFC-5545 RRULE for a repeating task, e.g. "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR" ' +
                'for every weekday, or "FREQ=DAILY". Omit for one-off tasks.',
            },
          },
          required: ['title'],
        },
      },
      {
        name: 'tasks.update',
        description:
          'Change an existing task: rename it, move its due date, change priority, or edit its ' +
          'notes. Use the id from the Tasks context. Only send the fields that change.',
        parameters: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            title: { type: 'string' },
            notes: { type: 'string' },
            priority: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] },
            dueAt: { type: 'string', format: 'date-time', description: 'Local due date/time' },
          },
          required: ['id'],
        },
      },
      {
        name: 'tasks.delete',
        description:
          'Delete a task the user no longer wants. Prefer tasks.complete when they actually did ' +
          'it — deleting loses it from their history.',
        parameters: {
          type: 'object',
          properties: { id: { type: 'string' } },
          required: ['id'],
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
