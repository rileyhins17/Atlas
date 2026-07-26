import { Injectable, type OnModuleInit } from '@nestjs/common';
import type { AiContextChunk, AiToolSpec } from '@atlas/shared';
import { estimateTokens } from '@atlas/ai';
import { DomainModule, ModuleRegistryService } from '../../core/domain-module.js';
import { RoutineService } from './routine.service.js';

/**
 * Feeds the user's typical week into every AI call, so briefs and suggestions
 * are timed to their actual life (don't propose deep work at their bedtime).
 * No tools — the routine is edited by the human, not the model.
 */
@Injectable()
export class RoutineAiAdapter implements DomainModule, OnModuleInit {
  readonly id = 'routine';

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

  getToolSpecs(): AiToolSpec[] {
    return [
      {
        // The routine is what makes Today's free time correct — it is the
        // difference between "2pm is open" and "2pm is open because you are
        // not at work". It was previously only reachable through the Settings
        // editor, so "I work 9 to 5" did nothing.
        name: 'routine.add_block',
        description:
          'Add a recurring block to the user\'s typical week — work, school, sleep, a standing ' +
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
    ];
  }
}
