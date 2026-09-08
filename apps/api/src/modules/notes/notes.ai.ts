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
    return [
      {
        name: 'notes.remember',
        description: 'Save a durable fact about the user (pin it to keep it always in context).',
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            body: { type: 'string' },
            pinned: { type: 'boolean' },
          },
          required: ['body'],
        },
      },
      {
        name: 'notes.update',
        description: 'Correct or extend an existing note. Use the id from the Notes context.',
        parameters: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            title: { type: 'string' },
            body: { type: 'string' },
            pinned: { type: 'boolean', description: 'Pinned notes stay in Atlas context' },
          },
          required: ['id'],
        },
      },
      {
        name: 'notes.delete',
        description: 'Delete a note by its id when the user says it is no longer true or wanted.',
        parameters: {
          type: 'object',
          properties: { id: { type: 'string' } },
          required: ['id'],
        },
      },
    ];
  }
}
