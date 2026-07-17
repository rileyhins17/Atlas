import { beforeEach, describe, expect, it, vi } from 'vitest';

const pipelineMock = vi.fn();

vi.mock('@huggingface/transformers', () => ({
  pipeline: (...args: unknown[]) => pipelineMock(...args),
}));

const { LocalEmbedder, EmbeddingDimensionError, EMBEDDING_DIMENSIONS, EMBEDDING_MODEL } =
  await import('../src/local-embedder.js');

/** Fake extractor returning `count` vectors of the given width. */
function fakeExtractor(width: number) {
  return vi.fn(async (texts: string[]) => ({
    tolist: () => texts.map(() => Array.from({ length: width }, () => 0.1)),
  }));
}

beforeEach(() => {
  pipelineMock.mockReset();
});

describe('LocalEmbedder', () => {
  it('embeds texts and returns one vector per input', async () => {
    pipelineMock.mockResolvedValue(fakeExtractor(EMBEDDING_DIMENSIONS));
    const embedder = new LocalEmbedder();
    const vectors = await embedder.embed(['a', 'b']);
    expect(vectors).toHaveLength(2);
    expect(vectors[0]).toHaveLength(EMBEDDING_DIMENSIONS);
  });

  it('mean-pools and normalizes so cosine similarity is a plain dot product', async () => {
    const extractor = fakeExtractor(EMBEDDING_DIMENSIONS);
    pipelineMock.mockResolvedValue(extractor);
    await new LocalEmbedder().embed(['a']);
    expect(extractor).toHaveBeenCalledWith(['a'], { pooling: 'mean', normalize: true });
  });

  it('short-circuits on empty input without loading the model', async () => {
    const embedder = new LocalEmbedder();
    await expect(embedder.embed([])).resolves.toEqual([]);
    expect(pipelineMock).not.toHaveBeenCalled();
  });

  it('loads the model once and reuses it across calls', async () => {
    pipelineMock.mockResolvedValue(fakeExtractor(EMBEDDING_DIMENSIONS));
    const embedder = new LocalEmbedder();
    await embedder.embed(['a']);
    await embedder.embed(['b']);
    expect(pipelineMock).toHaveBeenCalledTimes(1);
    expect(pipelineMock).toHaveBeenCalledWith('feature-extraction', EMBEDDING_MODEL);
  });

  it('shares a single model load between concurrent first calls', async () => {
    pipelineMock.mockResolvedValue(fakeExtractor(EMBEDDING_DIMENSIONS));
    const embedder = new LocalEmbedder();
    await Promise.all([embedder.embed(['a']), embedder.embed(['b']), embedder.warmup()]);
    expect(pipelineMock).toHaveBeenCalledTimes(1);
  });

  it('rejects vectors whose width would not fit the vector(768) column', async () => {
    // A model swap that changes dimensions must fail loudly, not write garbage
    // (or silently fail) against the fixed-width pgvector column.
    pipelineMock.mockResolvedValue(fakeExtractor(384));
    const embedder = new LocalEmbedder('some/384-dim-model');
    await expect(embedder.embed(['a'])).rejects.toBeInstanceOf(EmbeddingDimensionError);
  });
});
