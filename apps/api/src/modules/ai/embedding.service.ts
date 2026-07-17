import { Injectable } from '@nestjs/common';
import { CostGuard } from '@atlas/ai';
import { PrismaService } from '../../core/prisma.service.js';
import { ConnectorsService } from '../../core/connectors.service.js';

const BACKFILL_BATCH_CAP = 50;

export interface SemanticMatch {
  ownerType: string;
  ownerId: string;
  content: string;
  distance: number;
}

/**
 * Backfills the pgvector column for rows MemoryService queued with
 * model="pending", and runs semantic similarity search over them. Kept
 * separate from MemoryService (core, DB-only) because this actually spends
 * AI credits and needs the cost guard + connector.
 */
@Injectable()
export class EmbeddingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly connectors: ConnectorsService,
    private readonly costGuard: CostGuard,
  ) {}

  private ctxFor(userId: string) {
    return this.connectors.contextFor(userId, 'openrouter');
  }

  /** Embed up to `limit` pending rows for this user. Best-effort per row. */
  async backfillPending(userId: string, limit = 20): Promise<{ processed: number; failed: number }> {
    const pending = await this.prisma.client.embedding.findMany({
      where: { userId, model: 'pending' },
      take: Math.min(limit, BACKFILL_BATCH_CAP),
    });
    if (pending.length === 0) return { processed: 0, failed: 0 };

    const ctx = this.ctxFor(userId);
    let processed = 0;
    let failed = 0;

    for (const row of pending) {
      try {
        await this.costGuard.assertUnderCap();
        const res = await this.connectors.openrouter.embed(ctx, [row.content]);
        const vector = res.embeddings[0];
        if (!vector) throw new Error('Provider returned no embedding');
        const vecLiteral = `[${vector.join(',')}]`;
        await this.prisma.client.$executeRaw`
          UPDATE embeddings SET embedding = ${vecLiteral}::vector, model = ${res.model}
          WHERE id = ${row.id}
        `;
        await this.costGuard.record({
          model: res.model,
          promptTokens: res.usage.promptTokens,
          completionTokens: 0,
          purpose: 'embedding_backfill',
          userId,
        });
        processed++;
      } catch {
        failed++;
      }
    }
    return { processed, failed };
  }

  /** Semantic search over this user's embedded content. */
  async search(userId: string, queryText: string, limit = 5): Promise<SemanticMatch[]> {
    await this.costGuard.assertUnderCap();
    const ctx = this.ctxFor(userId);
    const res = await this.connectors.openrouter.embed(ctx, [queryText]);
    const vector = res.embeddings[0];
    if (!vector) return [];
    await this.costGuard.record({
      model: res.model,
      promptTokens: res.usage.promptTokens,
      completionTokens: 0,
      purpose: 'embedding_query',
      userId,
    });
    const vecLiteral = `[${vector.join(',')}]`;
    const cappedLimit = Math.min(limit, 20);
    return this.prisma.client.$queryRaw<SemanticMatch[]>`
      SELECT "ownerType" AS "ownerType", "ownerId" AS "ownerId", content,
             (embedding <-> ${vecLiteral}::vector) AS distance
      FROM embeddings
      WHERE "userId" = ${userId} AND embedding IS NOT NULL
      ORDER BY embedding <-> ${vecLiteral}::vector
      LIMIT ${cappedLimit}
    `;
  }
}
