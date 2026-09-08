import { Injectable } from '@nestjs/common';
import type { AiToolSpec } from '@atlas/shared';
import { RegisteredDomainModule, ModuleRegistryService } from '../../core/domain-module.js';
import { JournalService } from './journal.service.js';

@Injectable()
export class JournalAiAdapter extends RegisteredDomainModule {
  readonly id = 'journal';
  readonly contextTitle = 'Journal';
  /** See DEFAULT_CONTEXT_PRIORITY for what this ordering is for. */
  readonly contextPriority = 90;

  constructor(
    journal: JournalService,
    registry: ModuleRegistryService,
  ) {
    super(registry, journal);
  }

  getToolSpecs(): AiToolSpec[] {
    return [
      {
        name: 'journal.add',
        description: 'Append a journal entry for the user (optionally with a 1-5 mood).',
        parameters: {
          type: 'object',
          properties: {
            body: { type: 'string' },
            mood: { type: 'number', description: '1 (low) to 5 (great)' },
          },
          required: ['body'],
        },
      },
    ];
  }
}
