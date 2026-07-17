import { Injectable, Logger } from '@nestjs/common';
import { EMBEDDING_MODEL, LocalEmbedder } from '@atlas/ai';
import { PrismaService } from '../../core/prisma.service.js';

const BACKFILL_BATCH_CAP = 50;
const EMBED_CHUNK = 8;
const MAX_SEARCH_LIMIT = 20;

export interface SemanticMatch {
  ownerType: string;
  ownerId: string;
  content: string;
  distance: number;
}

/**
 * Backfills the pgvector column for rows MemoryService queued with
 * model="pending", and runs semantic similarity search over them.
 *
 * Embeddings run on a local in-process model (see LocalEmbedder): no API key,
 * no per-call spend, nothing leaves the machine. That's why — unlike every
 * chat path — this service doesn't touch the CostGuard: there is no cost to
 * guard. It stays separate from MemoryService (core, DB-only) because it owns
 * the model.
 */
@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly embedder: LocalEmbedder,
  ) {}

  private toVectorLiteral(vector: number[]): string {
    return `[${vector.join(',')}]`;
  }

  /** Embed up to `limit` pending rows for this user. Best-effort per chunk. */
  async backfillPending(userId: string, limit = 20): Promise<{ processed: number; failed: number }> {
    const pending = await this.prisma.client.embedding.findMany({
      where: { userId, model: 'pending' },
      take: Math.min(limit, BACKFILL_BATCH_CAP),
    });
    if (pending.length === 0) return { processed: 0, failed: 0 };

    let processed = 0;
    let failed = 0;

    // Batch through the model: one call per chunk rather than per row.
    for (let i = 0; i < pending.length; i += EMBED_CHUNK) {
      const chunk = pending.slice(i, i + EMBED_CHUNK);
      try {
        const vectors = await this.embedder.embed(chunk.map((row) => row.content));
        await Promise.all(
          chunk.map((row, idx) => {
            const vector = vectors[idx];
            if (!vector) throw new Error('Embedder returned no vector for a queued row');
            return this.prisma.client.$executeRaw`
              UPDATE embeddings
              SET embedding = ${this.toVectorLiteral(vector)}::vector, model = ${EMBEDDING_MODEL}
              WHERE id = ${row.id}
            `;
          }),
        );
        processed += chunk.length;
      } catch (err) {
        failed += chunk.length;
        this.logger.warn(
          `Embedding backfill failed for ${chunk.length} row(s): ${
            err instanceof Error ? err.message : 'unknown error'
          }`,
        );
      }
    }
    return { processed, failed };
  }

  /** Semantic search over this user's embedded content, nearest first. */
  async search(userId: string, queryText: string, limit = 5): Promise<SemanticMatch[]> {
    const [vector] = await this.embedder.embed([queryText]);
    if (!vector) return [];
    const literal = this.toVectorLiteral(vector);
    const cappedLimit = Math.min(Math.max(limit, 1), MAX_SEARCH_LIMIT);
    return this.prisma.client.$queryRaw<SemanticMatch[]>`
      SELECT "ownerType", "ownerId", content,
             (embedding <-> ${literal}::vector) AS distance
      FROM embeddings
      WHERE "userId" = ${userId} AND embedding IS NOT NULL
      ORDER BY embedding <-> ${literal}::vector
      LIMIT ${cappedLimit}
    `;
  }
}
