import { Injectable, type OnModuleInit } from '@nestjs/common';
import { RoutineBlockInput, type AiContextChunk } from '@atlas/shared';
import { estimateTokens } from '@atlas/ai';
import { DomainModule, ModuleRegistryService } from '../../core/domain-module.js';
import {
  defineTool,
  type DomainTool,
  ByIdInput,
  undoDelete,
  undoRecreate,
} from '../../core/domain-tool.js';
import { RoutineService } from './routine.service.js';

/**
 * Feeds the user's typical week into every AI call, so briefs and suggestions
 * are timed to their actual life (don't propose deep work at their bedtime).
 * The model can add and remove blocks ("I work 9 to 5"), each with an undo.
 */
@Injectable()
export class RoutineAiAdapter implements DomainModule, OnModuleInit {
  readonly id = 'routine';
  /** See DEFAULT_CONTEXT_PRIORITY for what this ordering is for. */
  readonly contextPriority = 10;

  constructor(
    private readonly routine: RoutineService,
    private readonly registry: ModuleRegistryService,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async aiContext(userId: string): Promise<AiContextChunk> {
    const content = await this.routine.summarize(userId);
    return { source: this.id, title: 'Routine', content, tokensEstimate: estimateTokens(content) };
  }

  tools(): DomainTool[] {
    return [
      // The routine is what makes Today's free time correct — it is the
      // difference between "2pm is open" and "2pm is open because you are
      // not at work". It was previously only reachable through the Settings
      // editor, so "I work 9 to 5" did nothing.
      defineTool(
        {
          name: 'routine.add_block',
          description:
            "Add a recurring block to the user's typical week — work, school, sleep, a standing " +
            'commitment. This is what stops Atlas offering time the user does not actually have. ' +
            'Times are MINUTES FROM LOCAL MIDNIGHT (9am = 540, 5pm = 1020). `days` is a 7-bit ' +
            'mask where bit 0 = Monday: weekdays = 31, weekends = 96, every day = 127. ' +
            'startMin greater than endMin means it wraps past midnight, which is how sleep works. ' +
            'Set onDate to pin it to one date instead (a one-off shift, a day off).',
          parameters: {
            type: 'object',
            properties: {
              label: { type: 'string', description: 'What it is, e.g. "Work"' },
              kind: {
                type: 'string',
                enum: ['sleep', 'work', 'school', 'meal', 'exercise', 'winddown', 'off', 'custom'],
                description: 'Use "off" to clear the weekly pattern for a window (a day off)',
              },
              days: { type: 'integer', description: '7-bit mask, bit 0 = Monday. Weekdays = 31.' },
              startMin: { type: 'integer', description: 'Minutes from local midnight' },
              endMin: { type: 'integer', description: 'Minutes from local midnight' },
              onDate: { type: 'string', description: 'YYYY-MM-DD to pin this to a single date' },
            },
            required: ['label', 'days', 'startMin', 'endMin'],
          },
        },
        async (userId, args) => {
          const block = await this.routine.addBlock(userId, RoutineBlockInput.parse(args));
          return {
            result: block,
            summary: `Added "${block.label}" to your week`,
            undo: undoDelete(`/routine/blocks/${block.id}`, `Remove "${block.label}"`),
          };
        },
      ),
      defineTool(
        {
          name: 'routine.remove_block',
          description:
            'Remove a block from the typical week ("I do not work Fridays any more"). Use the id ' +
            'from the routine context.',
          parameters: {
            type: 'object',
            properties: { id: { type: 'string' } },
            required: ['id'],
          },
        },
        async (userId, args) => {
          const { id } = ByIdInput.parse(args);
          const blocks = await this.routine.list(userId);
          const before = blocks.find((b) => b.id === id);
          if (!before) throw new Error('Routine block not found');
          await this.routine.removeBlock(userId, id);
          return {
            result: { ok: true },
            summary: `Removed "${before.label}" from your week`,
            undo: undoRecreate('/routine/blocks', `Put "${before.label}" back`, {
              label: before.label,
              kind: before.kind,
              days: before.days,
              startMin: before.startMin,
              endMin: before.endMin,
              ...(before.onDate ? { onDate: before.onDate } : {}),
            }),
          };
        },
      ),
    ];
  }
}
