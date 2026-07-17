import { Injectable } from '@nestjs/common';
import type { CreateJournalInput, JournalDTO } from '@atlas/shared';
import type { JournalEntry } from '@atlas/db';
import { PrismaService } from '../../core/prisma.service.js';
import { TimelineService } from '../../core/timeline.service.js';
import { MemoryService } from '../../core/memory.service.js';

function toDto(e: JournalEntry): JournalDTO {
  return {
    id: e.id,
    entryDate: e.entryDate.toISOString(),
    body: e.body,
    mood: e.mood,
    tags: e.tags,
    createdAt: e.createdAt.toISOString(),
  };
}

function snippet(text: string, n = 80): string {
  const s = text.trim().replace(/\s+/g, ' ');
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

@Injectable()
export class JournalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly timeline: TimelineService,
    private readonly memory: MemoryService,
  ) {}

  async create(userId: string, input: CreateJournalInput): Promise<JournalDTO> {
    const entry = await this.prisma.client.journalEntry.create({
      data: {
        userId,
        body: input.body,
        mood: input.mood,
        tags: input.tags,
        entryDate: input.entryDate ?? new Date(),
      },
    });

    // 1. Log to the unified timeline (mood travels with it for correlation).
    await this.timeline.write({
      userId,
      type: 'journal.created',
      source: 'journal',
      title: `Journal: ${snippet(entry.body)}`,
      summary: entry.mood ? `mood ${entry.mood}/5` : undefined,
      refType: 'journal',
      refId: entry.id,
      payload: entry.mood ? { mood: entry.mood } : undefined,
      occurredAt: entry.entryDate,
    });

    // 2. Make it AI-retrievable (Phase 2 backfills the vector).
    await this.memory.queueForEmbedding(userId, 'journal', entry.id, entry.body);

    // 3. Self-curation loop: a thin, low-mood entry earns a follow-up question.
    //    (Heuristic now; the AI orchestrator generates these in Phase 2.)
    if (entry.mood != null && entry.mood <= 2 && entry.body.trim().length < 140) {
      await this.memory.askUser({
        userId,
        question: `You logged a low mood (${entry.mood}/5) but kept it short — what was the biggest thing weighing on you?`,
        rationale: 'Understanding low-mood days helps Atlas spot what drains you.',
        relatesTo: 'journal',
      });
    }

    return toDto(entry);
  }

  async list(userId: string, page: { limit: number; offset: number }): Promise<JournalDTO[]> {
    const entries = await this.prisma.client.journalEntry.findMany({
      where: { userId },
      orderBy: { entryDate: 'desc' },
      take: page.limit,
      skip: page.offset,
    });
    return entries.map(toDto);
  }

  /** Compact summary for the AI context builder: recent mood trend + last entry. */
  async summarize(userId: string): Promise<string> {
    const recent = await this.prisma.client.journalEntry.findMany({
      where: { userId },
      orderBy: { entryDate: 'desc' },
      take: 7,
    });
    if (recent.length === 0) return 'No journal entries yet.';
    const moods = recent.map((e) => e.mood).filter((m): m is number => m != null);
    const avg = moods.length ? (moods.reduce((a, b) => a + b, 0) / moods.length).toFixed(1) : 'n/a';
    const last = recent[0];
    return `${recent.length} recent entr(ies). Avg mood: ${avg}/5. Latest (${last!.entryDate
      .toISOString()
      .slice(0, 10)}): "${snippet(last!.body, 120)}"`;
  }
}
