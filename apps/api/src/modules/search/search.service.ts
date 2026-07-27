import { Injectable } from '@nestjs/common';
import type { SearchHitDTO, SearchResultDTO } from '@atlas/shared';
import { PrismaService } from '../../core/prisma.service.js';

const PER_DOMAIN = 5;

/**
 * One query across everything the user owns.
 *
 * Atlas's whole pitch is that it remembers; being unable to ask it WHAT it
 * remembers was the largest hole in the product. This is deliberately a
 * straightforward case-insensitive `contains` rather than the pgvector index:
 * semantic recall already exists for the AI, but a person searching for
 * "dentist" wants the row that literally says dentist, ranked by recency, not
 * the three thematically-adjacent notes an embedding would surface.
 *
 * Every query is userId-scoped. `take` is per domain so one noisy domain
 * cannot crowd the others out of the results.
 */
@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(userId: string, rawQuery: string): Promise<SearchResultDTO> {
    const q = rawQuery.trim();
    if (q.length < 2) return { query: q, hits: [] };

    const where = { contains: q, mode: 'insensitive' as const };
    const db = this.prisma.client;

    const [tasks, notes, events, goals, journal] = await Promise.all([
      db.task.findMany({
        where: { userId, OR: [{ title: where }, { notes: where }] },
        orderBy: { updatedAt: 'desc' },
        take: PER_DOMAIN,
        select: { id: true, title: true, status: true, dueAt: true },
      }),
      db.note.findMany({
        where: { userId, OR: [{ title: where }, { body: where }] },
        orderBy: { updatedAt: 'desc' },
        take: PER_DOMAIN,
        select: { id: true, title: true, body: true },
      }),
      db.event.findMany({
        where: { userId, OR: [{ title: where }, { location: where }] },
        orderBy: { startAt: 'desc' },
        take: PER_DOMAIN,
        select: { id: true, title: true, startAt: true, location: true },
      }),
      db.goal.findMany({
        where: { userId, OR: [{ title: where }, { description: where }] },
        orderBy: { updatedAt: 'desc' },
        take: PER_DOMAIN,
        select: { id: true, title: true, horizon: true, status: true },
      }),
      db.journalEntry.findMany({
        where: { userId, body: where },
        orderBy: { createdAt: 'desc' },
        take: PER_DOMAIN,
        select: { id: true, body: true, createdAt: true },
      }),
    ]);

    const hits: SearchHitDTO[] = [
      ...tasks.map((t) => ({
        id: t.id,
        domain: 'task' as const,
        title: t.title,
        subtitle:
          t.status === 'DONE'
            ? 'done'
            : t.dueAt
              ? `due ${t.dueAt.toISOString().slice(0, 10)}`
              : 'no date',
        href: '/tasks',
      })),
      ...events.map((e) => ({
        id: e.id,
        domain: 'event' as const,
        title: e.title,
        subtitle: `${e.startAt.toISOString().slice(0, 10)}${e.location ? ` · ${e.location}` : ''}`,
        href: '/calendar',
      })),
      ...goals.map((g) => ({
        id: g.id,
        domain: 'goal' as const,
        title: g.title,
        subtitle: `${g.horizon}-term · ${g.status}`,
        href: '/goals',
      })),
      ...notes.map((n) => ({
        id: n.id,
        domain: 'note' as const,
        title: n.title ?? 'Note',
        subtitle: n.body.slice(0, 90),
        href: '/notes',
      })),
      ...journal.map((j) => ({
        id: j.id,
        domain: 'journal' as const,
        // A journal entry has no title, so the first line is the title.
        title: j.body.split('\n')[0]!.slice(0, 80),
        subtitle: j.createdAt.toISOString().slice(0, 10),
        href: '/journal',
      })),
    ];

    return { query: q, hits };
  }
}
