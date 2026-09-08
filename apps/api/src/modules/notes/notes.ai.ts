import { notesToolSpecs } from '@atlas/shared';
import { Injectable } from '@nestjs/common';
import type { AiToolSpec } from '@atlas/shared';
import { RegisteredDomainModule, ModuleRegistryService } from '../../core/domain-module.js';
import { NotesService } from './notes.service.js';

@Injectable()
export class NotesAiAdapter extends RegisteredDomainModule {
  readonly id = 'notes';
  readonly contextTitle = 'Notes / known facts';
  /** See DEFAULT_CONTEXT_PRIORITY for what this ordering is for. */
  readonly contextPriority = 40;

  constructor(
    notes: NotesService,
    registry: ModuleRegistryService,
  ) {
    super(registry, notes);
  }

  getToolSpecs(): AiToolSpec[] {
    return notesToolSpecs();
  }
}
