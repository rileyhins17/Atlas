import { Injectable, type OnModuleInit } from '@nestjs/common';
import { CreateNoteInput, UpdateNoteInput, type AiContextChunk } from '@atlas/shared';
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
import { NotesService } from './notes.service.js';

const NotePatch = withId(UpdateNoteInput);

@Injectable()
export class NotesAiAdapter implements DomainModule, OnModuleInit {
  readonly id = 'notes';
  /** See DEFAULT_CONTEXT_PRIORITY for what this ordering is for. */
  readonly contextPriority = 40;

  constructor(
    private readonly notes: NotesService,
    private readonly registry: ModuleRegistryService,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async aiContext(userId: string): Promise<AiContextChunk> {
    const content = await this.notes.summarize(userId);
    return {
      source: this.id,
      title: 'Notes / known facts',
      content,
      tokensEstimate: estimateTokens(content),
    };
  }

  tools(): DomainTool[] {
    return [
      defineTool(
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
        async (userId, args) => {
          const note = await this.notes.create(userId, CreateNoteInput.parse(args));
          return {
            result: note,
            summary: note.title ? `Saved note "${note.title}"` : 'Saved a note',
            undo: undoDelete(`/notes/${note.id}`, 'Delete that note'),
          };
        },
      ),
      defineTool(
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
        async (userId, args) => {
          const { id, ...patch } = NotePatch.parse(args);
          const before = await this.notes.owned(userId, id);
          const note = await this.notes.update(userId, id, patch);
          return {
            result: note,
            summary: note.title ? `Updated note "${note.title}"` : 'Updated a note',
            undo: undoPatch(`/notes/${id}`, 'Undo that note change', touchedFields(before, patch)),
          };
        },
      ),
      defineTool(
        {
          name: 'notes.delete',
          description: 'Delete a note by its id when the user says it is no longer true or wanted.',
          parameters: {
            type: 'object',
            properties: { id: { type: 'string' } },
            required: ['id'],
          },
        },
        async (userId, args) => {
          const { id } = ByIdInput.parse(args);
          const before = await this.notes.owned(userId, id);
          await this.notes.remove(userId, id);
          return {
            result: { ok: true },
            summary: before.title ? `Deleted note "${before.title}"` : 'Deleted a note',
            undo: undoRecreate('/notes', 'Restore that note', {
              ...(before.title ? { title: before.title } : {}),
              body: before.body,
              pinned: before.pinned,
            }),
          };
        },
      ),
    ];
  }
}
