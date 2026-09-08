import { Injectable } from '@nestjs/common';
import type { AiToolSpec } from '@atlas/shared';
import { RegisteredDomainModule, ModuleRegistryService } from '../../core/domain-module.js';
import { TrackersService } from './trackers.service.js';

@Injectable()
export class TrackersAiAdapter extends RegisteredDomainModule {
  readonly id = 'trackers';
  readonly contextTitle = 'Personal trackers';
  /** See DEFAULT_CONTEXT_PRIORITY for what this ordering is for. */
  readonly contextPriority = 70;

  constructor(
    trackers: TrackersService,
    registry: ModuleRegistryService,
  ) {
    super(registry, trackers);
  }

  getToolSpecs(): AiToolSpec[] {
    return [
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
    ];
  }
}
