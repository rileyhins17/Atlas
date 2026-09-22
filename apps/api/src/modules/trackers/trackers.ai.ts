import { Injectable, type OnModuleInit } from '@nestjs/common';
import { z } from 'zod';
import { LogTrackerInput, type AiContextChunk } from '@atlas/shared';
import { estimateTokens } from '@atlas/ai';
import { DomainModule, ModuleRegistryService } from '../../core/domain-module.js';
import { defineTool, type DomainTool } from '../../core/domain-tool.js';
import { TrackersService } from './trackers.service.js';

const TrackerLog = z.object({
  trackerId: z.string().min(1).max(64),
  value: z.number().int().min(1).max(10),
  note: z.string().max(500).nullish(),
});

@Injectable()
export class TrackersAiAdapter implements DomainModule, OnModuleInit {
  readonly id = 'trackers';
  /** See DEFAULT_CONTEXT_PRIORITY for what this ordering is for. */
  readonly contextPriority = 70;

  constructor(
    private readonly trackers: TrackersService,
    private readonly registry: ModuleRegistryService,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async aiContext(userId: string): Promise<AiContextChunk> {
    const content = await this.trackers.summarize(userId);
    return {
      source: this.id,
      title: 'Personal trackers',
      content,
      tokensEstimate: estimateTokens(content),
    };
  }

  tools(): DomainTool[] {
    return [
      defineTool(
        {
          name: 'trackers.log',
          description:
            "Record today's rating for one of the user's personal trackers, by its id. Only for " +
            'trackers that already exist — the id must come from the Personal trackers context. ' +
            'The scale is 1 to 10.',
          parameters: {
            type: 'object',
            properties: {
              trackerId: { type: 'string', description: 'The tracker to rate.' },
              value: { type: 'integer', minimum: 1, maximum: 10 },
              note: { type: 'string', description: 'Optional context in the user\u2019s words.' },
            },
            required: ['trackerId', 'value'],
          },
        },
        async (userId, args) => {
          const { trackerId, ...rest } = TrackerLog.parse(args);
          const entry = await this.trackers.log(userId, trackerId, LogTrackerInput.parse(rest));
          const tracker = await this.trackers.owned(userId, trackerId);
          // Re-rating a day overwrites it, so there is no inverse that restores
          // the previous number — offering one that silently did nothing would be
          // worse than saying it cannot be undone.
          return { result: entry, summary: `Rated ${tracker.name} ${entry.value}/10`, undo: null };
        },
      ),
    ];
  }
}
