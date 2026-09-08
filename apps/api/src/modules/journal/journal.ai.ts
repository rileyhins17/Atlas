import { journalToolSpecs } from '@atlas/shared';
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
    return journalToolSpecs();
  }
}
