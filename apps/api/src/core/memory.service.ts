import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';

/**
 * The bridge that makes any domain "AI-native": text gets queued into semantic
 * memory, and the AI can pose questions back to the user. Journal/Notes use this
 * so their content is retrievable and can drive the self-curation loop — the
 * thing that separates Atlas from a plain notes app.
 */
@Injectable()
export class MemoryService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Register a piece of text for semantic retrieval. In Phase 1 we store the
   * content with a null vector and model="pending"; the Phase 2 embedder
   * backfills the pgvector column. Idempotent per (ownerType, ownerId).
   */
  async queueForEmbedding(
    userId: string,
    ownerType: string,
    ownerId: string,
    content: string,
  ): Promise<void> {
    await this.prisma.client.embedding.upsert({
      where: { ownerType_ownerId: { ownerType, ownerId } },
      create: { userId, ownerType, ownerId, content, model: 'pending' },
      update: { content, model: 'pending' },
    });
  }

  async removeFromEmbeddings(ownerType: string, ownerId: string): Promise<void> {
    await this.prisma.client.embedding.deleteMany({ where: { ownerType, ownerId } });
  }

  /**
   * Record a question Atlas wants to ask the user. Surfaced as a card in the UI;
   * the answer flows back into the data. In Phase 1 callers pass simple
   * heuristic questions; in Phase 2 the AI orchestrator generates these.
   */
  async askUser(params: {
    userId: string;
    question: string;
    rationale?: string;
    relatesTo?: string;
  }): Promise<void> {
    // Avoid piling up duplicates of the same open question.
    const existing = await this.prisma.client.aiQuestion.findFirst({
      where: { userId: params.userId, question: params.question, status: 'OPEN' },
    });
    if (existing) return;
    await this.prisma.client.aiQuestion.create({
      data: {
        userId: params.userId,
        question: params.question,
        rationale: params.rationale,
        relatesTo: params.relatesTo,
      },
    });
  }
}
