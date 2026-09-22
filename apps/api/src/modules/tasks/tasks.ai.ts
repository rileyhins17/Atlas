import { Injectable, type OnModuleInit } from '@nestjs/common';
import { CreateTaskInput, UpdateTaskInput, type AiContextChunk } from '@atlas/shared';
import { estimateTokens } from '@atlas/ai';
import { DomainModule, ModuleRegistryService } from '../../core/domain-module.js';
import {
  defineTool,
  type DomainTool,
  ByIdInput,
  undoDelete,
  undoPatch,
  undoRecreate,
  touchedFields,
  withId,
} from '../../core/domain-tool.js';
import { TasksService } from './tasks.service.js';

const TaskPatch = withId(UpdateTaskInput);

/**
 * Bridges the Tasks domain into the AI brain. Copy this file's shape when adding
 * any new domain: implement DomainModule, self-register in onModuleInit.
 */
@Injectable()
export class TasksAiAdapter implements DomainModule, OnModuleInit {
  readonly id = 'tasks';
  /** See DEFAULT_CONTEXT_PRIORITY for what this ordering is for. */
  readonly contextPriority = 30;

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

  tools(): DomainTool[] {
    return [
      defineTool(
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
        async (userId, args) => {
          const task = await this.tasks.create(userId, CreateTaskInput.parse(args));
          return {
            result: task,
            summary: `Added task "${task.title}"`,
            undo: undoDelete(`/tasks/${task.id}`, `Remove "${task.title}"`),
          };
        },
      ),
      defineTool(
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
        async (userId, args) => {
          const { id, ...patch } = TaskPatch.parse(args);
          const before = await this.tasks.owned(userId, id);
          const task = await this.tasks.update(userId, id, patch);
          return {
            result: task,
            summary: `Updated "${task.title}"`,
            undo: undoPatch(
              `/tasks/${id}`,
              `Undo the change to "${before.title}"`,
              touchedFields(before, patch),
            ),
          };
        },
      ),
      defineTool(
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
        async (userId, args) => {
          const { id } = ByIdInput.parse(args);
          const before = await this.tasks.owned(userId, id);
          await this.tasks.remove(userId, id);
          return {
            result: { ok: true },
            summary: `Deleted "${before.title}"`,
            undo: undoRecreate('/tasks', `Restore "${before.title}"`, {
              title: before.title,
              ...(before.notes ? { notes: before.notes } : {}),
              priority: before.priority,
              ...(before.dueAt ? { dueAt: before.dueAt.toISOString() } : {}),
            }),
          };
        },
      ),
      defineTool(
        {
          name: 'tasks.complete',
          description: 'Mark a task as done by its id.',
          parameters: {
            type: 'object',
            properties: { id: { type: 'string' } },
            required: ['id'],
          },
        },
        async (userId, args) => {
          const { id } = ByIdInput.parse(args);
          const before = await this.tasks.owned(userId, id);
          const task = await this.tasks.complete(userId, id);
          return {
            result: task,
            summary: `Completed "${task.title}"`,
            undo: undoPatch(`/tasks/${id}`, `Reopen "${task.title}"`, { status: before.status }),
          };
        },
      ),
    ];
  }
}
