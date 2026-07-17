import { Injectable, NotFoundException } from '@nestjs/common';
import type { CreateNoteInput, NoteDTO, UpdateNoteInput } from '@atlas/shared';
import type { Note } from '@atlas/db';
import { PrismaService } from '../../core/prisma.service.js';
import { TimelineService } from '../../core/timeline.service.js';
import { MemoryService } from '../../core/memory.service.js';

function toDto(n: Note): NoteDTO {
  return {
    id: n.id,
    title: n.title,
    body: n.body,
    tags: n.tags,
    pinned: n.pinned,
    createdAt: n.createdAt.toISOString(),
    updatedAt: n.updatedAt.toISOString(),
  };
}

function embedText(n: Note): string {
  return n.title ? `${n.title}\n${n.body}` : n.body;
}

@Injectable()
export class NotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly timeline: TimelineService,
    private readonly memory: MemoryService,
  ) {}

  private async owned(userId: string, id: string): Promise<Note> {
    const note = await this.prisma.client.note.findFirst({ where: { id, userId } });
    if (!note) throw new NotFoundException('Note not found');
    return note;
  }

  async list(userId: string, page: { limit: number; offset: number }): Promise<NoteDTO[]> {
    const notes = await this.prisma.client.note.findMany({
      where: { userId },
      orderBy: [{ pinned: 'desc' }, { updatedAt: 'desc' }],
      take: page.limit,
      skip: page.offset,
    });
    return notes.map(toDto);
  }

  async create(userId: string, input: CreateNoteInput): Promise<NoteDTO> {
    const note = await this.prisma.client.note.create({
      data: {
        userId,
        title: input.title,
        body: input.body,
        tags: input.tags,
        pinned: input.pinned,
      },
    });
    await this.timeline.write({
      userId,
      type: 'note.created',
      source: 'notes',
      title: `Note: ${note.title ?? note.body.slice(0, 60)}`,
      refType: 'note',
      refId: note.id,
    });
    await this.memory.queueForEmbedding(userId, 'note', note.id, embedText(note));
    return toDto(note);
  }

  async update(userId: string, id: string, input: UpdateNoteInput): Promise<NoteDTO> {
    await this.owned(userId, id);
    const note = await this.prisma.client.note.update({ where: { id }, data: input });
    await this.memory.queueForEmbedding(userId, 'note', note.id, embedText(note));
    return toDto(note);
  }

  async remove(userId: string, id: string): Promise<{ ok: true }> {
    const note = await this.owned(userId, id);
    await this.prisma.client.note.delete({ where: { id } });
    await this.memory.removeFromEmbeddings('note', id);
    await this.timeline.write({
      userId,
      type: 'note.deleted',
      source: 'notes',
      title: `Deleted note: ${note.title ?? note.body.slice(0, 60)}`,
      refType: 'note',
      refId: id,
    });
    return { ok: true };
  }

  /** Compact summary for the AI: the pinned facts Atlas should always know. */
  async summarize(userId: string): Promise<string> {
    const pinned = await this.prisma.client.note.findMany({
      where: { userId, pinned: true },
      orderBy: { updatedAt: 'desc' },
      take: 10,
    });
    const total = await this.prisma.client.note.count({ where: { userId } });
    if (total === 0) return 'No notes yet.';
    if (pinned.length === 0) return `${total} note(s), none pinned as key facts.`;
    const lines = pinned.map((n) => `- ${n.title ? `${n.title}: ` : ''}${n.body.slice(0, 100)}`);
    return `Key facts about the user (pinned notes):\n${lines.join('\n')}`;
  }
}
