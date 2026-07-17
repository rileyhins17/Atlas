import { pipeline, type FeatureExtractionPipeline } from '@huggingface/transformers';

/**
 * Embedding model run locally, in-process. No API key, no per-call cost, no
 * data leaving the box — which is why Atlas embeds locally rather than paying a
 * second provider just for vectors (DeepSeek, the chat provider, has no
 * embeddings API at all).
 *
 * MUST stay in sync with the `embeddings.embedding vector(768)` column in the
 * Prisma schema: bge-base-en-v1.5 emits 768 dimensions. Changing the model to
 * one with a different width requires a migration of that column.
 */
export const EMBEDDING_MODEL = 'Xenova/bge-base-en-v1.5';
export const EMBEDDING_DIMENSIONS = 768;

export class EmbeddingDimensionError extends Error {
  constructor(expected: number, actual: number) {
    super(
      `Embedding model returned ${actual} dimensions but the database column expects ${expected}. ` +
        'Change EMBEDDING_MODEL back, or migrate the embeddings.embedding column.',
    );
    this.name = 'EmbeddingDimensionError';
  }
}

/**
 * Lazily loads the model on first use (the weights are ~110MB and are fetched
 * once, then cached on disk by transformers.js), and reuses the pipeline for
 * the process lifetime. Concurrent callers share a single load.
 */
export class LocalEmbedder {
  private pipelinePromise?: Promise<FeatureExtractionPipeline>;

  constructor(private readonly model: string = EMBEDDING_MODEL) {}

  private getPipeline(): Promise<FeatureExtractionPipeline> {
    // Cache the promise, not the resolved value, so parallel first-calls don't
    // each kick off their own model load.
    this.pipelinePromise ??= pipeline('feature-extraction', this.model);
    return this.pipelinePromise;
  }

  /** Warm the model up (e.g. at boot) so the first real request isn't slow. */
  async warmup(): Promise<void> {
    await this.getPipeline();
  }

  /**
   * Embed one or more texts. Vectors are mean-pooled and L2-normalized, so
   * cosine similarity is a plain dot product and pgvector's `<->` ordering is
   * meaningful.
   */
  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const extractor = await this.getPipeline();
    const output = await extractor(texts, { pooling: 'mean', normalize: true });
    const vectors = output.tolist() as number[][];
    for (const vector of vectors) {
      if (vector.length !== EMBEDDING_DIMENSIONS) {
        throw new EmbeddingDimensionError(EMBEDDING_DIMENSIONS, vector.length);
      }
    }
    return vectors;
  }
}
