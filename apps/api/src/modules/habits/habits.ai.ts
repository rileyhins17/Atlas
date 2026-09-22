import { Injectable, type OnModuleInit } from '@nestjs/common';
import { z } from 'zod';
import {
  CreateHabitInput,
  LogHabitInput,
  UpdateHabitInput,
  type AiContextChunk,
} from '@atlas/shared';
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
import { HabitsService } from './habits.service.js';

const HabitPatch = withId(UpdateHabitInput);

/** A check-in names the habit alongside the log payload. */
const HabitLog = ByIdInput.extend({
  value: z.number().optional(),
  note: z.string().optional(),
});

@Injectable()
export class HabitsAiAdapter implements DomainModule, OnModuleInit {
  readonly id = 'habits';
  /** See DEFAULT_CONTEXT_PRIORITY for what this ordering is for. */
  readonly contextPriority = 50;

  constructor(
    private readonly habits: HabitsService,
    private readonly registry: ModuleRegistryService,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async aiContext(userId: string): Promise<AiContextChunk> {
    const content = await this.habits.summarize(userId);
    return { source: this.id, title: 'Habits', content, tokensEstimate: estimateTokens(content) };
  }

  tools(): DomainTool[] {
    return [
      defineTool(
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
        async (userId, args) => {
          const { id, ...rest } = HabitLog.parse(args);
          const habit = await this.habits.log(userId, id, LogHabitInput.parse(rest));
          // A check-in has no delete endpoint, so it is honestly not undoable
          // rather than offered with an inverse that would not work.
          return { result: habit, summary: `Checked in "${habit.name}"`, undo: null };
        },
      ),
      defineTool(
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
        async (userId, args) => {
          const habit = await this.habits.create(userId, CreateHabitInput.parse(args));
          return {
            result: habit,
            summary: `Started tracking "${habit.name}"`,
            undo: undoDelete(`/habits/${habit.id}`, `Stop tracking "${habit.name}"`),
          };
        },
      ),
      defineTool(
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
        async (userId, args) => {
          const { id, ...patch } = HabitPatch.parse(args);
          const before = await this.habits.owned(userId, id);
          const habit = await this.habits.update(userId, id, patch);
          return {
            result: habit,
            summary: patch.active === false ? `Paused "${habit.name}"` : `Updated "${habit.name}"`,
            undo: undoPatch(
              `/habits/${id}`,
              `Undo the change to "${before.name}"`,
              touchedFields(before, patch),
            ),
          };
        },
      ),
      defineTool(
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
        async (userId, args) => {
          const { id } = ByIdInput.parse(args);
          const before = await this.habits.owned(userId, id);
          await this.habits.remove(userId, id);
          return {
            result: { ok: true },
            summary: `Stopped tracking "${before.name}"`,
            // Recreating gives a fresh habit — the check-in history is gone for
            // good, which is why the tool description steers toward pausing.
            undo: undoRecreate('/habits', `Track "${before.name}" again`, {
              name: before.name,
              cadence: before.cadence,
              target: before.target,
            }),
          };
        },
      ),
    ];
  }
}
