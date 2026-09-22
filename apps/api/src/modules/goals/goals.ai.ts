import { Injectable, type OnModuleInit } from '@nestjs/common';
import { CreateGoalInput, UpdateGoalInput, type AiContextChunk } from '@atlas/shared';
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
import { GoalsService } from './goals.service.js';

const GoalPatch = withId(UpdateGoalInput);

@Injectable()
export class GoalsAiAdapter implements DomainModule, OnModuleInit {
  readonly id = 'goals';
  /** See DEFAULT_CONTEXT_PRIORITY for what this ordering is for. */
  readonly contextPriority = 60;

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

  tools(): DomainTool[] {
    return [
      defineTool(
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
        async (userId, args) => {
          const goal = await this.goals.create(userId, CreateGoalInput.parse(args));
          return {
            result: goal,
            summary: `Added ${goal.horizon}-term goal "${goal.title}"`,
            undo: undoDelete(`/goals/${goal.id}`, `Remove "${goal.title}"`),
          };
        },
      ),
      defineTool(
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
        async (userId, args) => {
          const { id, ...patch } = GoalPatch.parse(args);
          const before = await this.goals.owned(userId, id);
          const goal = await this.goals.update(userId, id, patch);
          return {
            result: goal,
            summary:
              patch.status === 'achieved'
                ? `Marked "${goal.title}" achieved`
                : `Updated "${goal.title}"`,
            undo: undoPatch(
              `/goals/${id}`,
              `Undo the change to "${before.title}"`,
              touchedFields(before, patch),
            ),
          };
        },
      ),
      defineTool(
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
        async (userId, args) => {
          const { id } = ByIdInput.parse(args);
          const before = await this.goals.owned(userId, id);
          await this.goals.remove(userId, id);
          return {
            result: { ok: true },
            summary: `Deleted goal "${before.title}"`,
            undo: undoRecreate('/goals', `Restore "${before.title}"`, {
              title: before.title,
              ...(before.description ? { description: before.description } : {}),
              horizon: before.horizon,
              ...(before.targetDate ? { targetDate: before.targetDate.toISOString() } : {}),
            }),
          };
        },
      ),
    ];
  }
}
