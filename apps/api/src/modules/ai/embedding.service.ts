import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { EMBEDDING_MODEL, LocalEmbedder } from '@atlas/ai';
import { PrismaService } from '../../core/prisma.service.js';

const BACKFILL_BATCH_CAP = 50;
const EMBED_CHUNK = 8;
const MAX_SEARCH_LIMIT = 20;
const BACKFILL_INTERVAL_MS = 60_000;

export interface SemanticMatch {
  ownerType: string;
  ownerId: string;
  content: string;
  distance: number;
}

/**
 * Backfills the pgvector column for rows MemoryService queued with
 * model="pending" (on a timer, plus on demand), and runs semantic similarity
 * search over them.
 *
 * Embeddings run on a local in-process model (see LocalEmbedder): no API key,
 * no per-call spend, nothing leaves the machine. That's why — unlike every
 * chat path — this service doesn't touch the CostGuard: there is no cost to
 * guard. It stays separate from MemoryService (core, DB-only) because it owns
 * the model, and because core must not depend on a feature module.
 */
@Injectable()
export class EmbeddingService implements OnApplicationBootstrap {
  private readonly logger = new Logger(EmbeddingService.name);
  private sweeping = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly embedder: LocalEmbedder,
  ) {}

  /**
   * Load the model at boot instead of making the first user wait ~7s for it
   * (and, on a fresh box, for a ~110MB download). Deliberately not awaited: the
   * API must come up and serve non-AI routes even if the model is slow or the
   * download fails.
   */
  onApplicationBootstrap(): void {
    const startedAt = Date.now();
    void this.embedder
      .warmup()
      .then(() => this.logger.log(`Embedding model ready in ${Date.now() - startedAt}ms`))
      .catch((err: unknown) =>
        this.logger.warn(
          `Embedding model warmup failed; it will retry on first use: ${
            err instanceof Error ? err.message : 'unknown error'
          }`,
        ),
      );
  }

  private toVectorLiteral(vector: number[]): string {
    return `[${vector.join(',')}]`;
  }

  /**
   * Periodically embed whatever's queued, for every user. MemoryService marks
   * new journal/note/Q&A rows `model="pending"` on write but deliberately
   * doesn't embed inline — that would put ~100ms of model time on the user's
   * write request. This sweep keeps writes fast while making content
   * searchable shortly after.
   *
   * Scanning across users is safe: it only fills in each row's own vector and
   * returns nothing, so no data crosses a tenant boundary.
   */
  @Interval(BACKFILL_INTERVAL_MS)
  async sweepPending(): Promise<void> {
    // Embedding is CPU-bound and single-threaded here; overlapping runs would
    // just queue up behind each other and pile on memory.
    if (this.sweeping) return;
    this.sweeping = true;
    try {
      const { processed, failed } = await this.backfill({ model: 'pending' }, BACKFILL_BATCH_CAP);
      if (processed || failed) {
        this.logger.log(`Embedding sweep: ${processed} embedded, ${failed} failed`);
      }
    } catch (err) {
      this.logger.warn(
        `Embedding sweep errored: ${err instanceof Error ? err.message : 'unknown error'}`,
      );
    } finally {
      this.sweeping = false;
    }
  }

  /** Embed up to `limit` pending rows for this user. Best-effort per chunk. */
  backfillPending(userId: string, limit = 20): Promise<{ processed: number; failed: number }> {
    return this.backfill({ userId, model: 'pending' }, limit);
  }

  private async backfill(
    where: { userId?: string; model: string },
    limit: number,
  ): Promise<{ processed: number; failed: number }> {
    const pending = await this.prisma.client.embedding.findMany({
      where,
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
