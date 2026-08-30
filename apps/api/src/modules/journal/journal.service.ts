import { Injectable, NotFoundException } from '@nestjs/common';
import type { CreateJournalInput, JournalDTO, UpdateJournalInput } from '@atlas/shared';
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

    // 2. Make it AI-retrievable (embedding backfill runs async via /ai/embeddings/backfill).
    await this.memory.queueForEmbedding(userId, 'journal', entry.id, entry.body);

    // 3. Self-curation loop: the AI orchestrator reviews context (including this
    //    entry) and decides whether a follow-up question is worth asking — see
    //    OrchestratorService.generateQuestions, called from the daily brief and
    //    from POST /ai/questions/generate.

    return toDto(entry);
  }

  /** Ownership-scoped read. Every mutation goes through this first, so one
   *  user can never reach another's entry by guessing an id. */
  async owned(userId: string, id: string): Promise<JournalEntry> {
    const entry = await this.prisma.client.journalEntry.findFirst({ where: { id, userId } });
    if (!entry) throw new NotFoundException('Journal entry not found');
    return entry;
  }

  /**
   * Edit an existing entry.
   *
   * Journal and notes share one writing surface, so having notes editable and
   * journal not was a product inconsistency rather than a missing function.
   *
   * Two things have to follow the body when it changes, and both are easy to
   * forget because nothing visibly breaks without them: the embedding, or AI
   * recall keeps quoting text the user has already rewritten; and the timeline,
   * which is the compact cross-domain log the model actually reads. The
   * timeline is append-only by design, so an edit adds a row rather than
   * rewriting history — what changed IS part of the story.
   */
  async update(userId: string, id: string, input: UpdateJournalInput): Promise<JournalDTO> {
    const before = await this.owned(userId, id);
    const entry = await this.prisma.client.journalEntry.update({
      where: { id },
      data: {
        body: input.body,
        mood: input.mood,
        tags: input.tags,
        entryDate: input.entryDate,
      },
    });

    if (input.body !== undefined && input.body !== before.body) {
      await this.memory.queueForEmbedding(userId, 'journal', entry.id, entry.body);
    }

    await this.timeline.write({
      userId,
      type: 'journal.updated',
      source: 'journal',
      title: `Journal edited: ${snippet(entry.body)}`,
      summary: entry.mood ? `mood ${entry.mood}/5` : undefined,
      refType: 'journal',
      refId: entry.id,
      payload: entry.mood ? { mood: entry.mood } : undefined,
      occurredAt: new Date(),
    });

    return toDto(entry);
  }

  async list(userId: string, page: { limit: number; offset: number }): Promise<JournalDTO[]> {
    const entries = await this.prisma.client.journalEntry.findMany({
      where: { userId },
      // entryDate alone is not a total order: every entry written today shares
      // one date, so Postgres was free to return same-day entries in any order
      // and they shuffled between reloads. createdAt breaks the tie, which is
      // also the order a person expects — the one you just wrote, first.
      orderBy: [{ entryDate: 'desc' }, { createdAt: 'desc' }],
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
