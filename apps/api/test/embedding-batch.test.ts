import { describe, expect, it, vi } from 'vitest';
import { EmbeddingService } from '../src/modules/ai/embedding.service.js';
import { ActivityService } from '../src/core/activity.service.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anyCast = (value: unknown): any => value;

function make(count = 9) {
  const rows = Array.from({ length: count }, (_, i) => ({
    id: `row-${i}`, userId: 'owner', content: `Synthetic memory ${i}`, model: 'pending',
  }));
  const execute = vi.fn().mockResolvedValue(count);
  const findMany = vi.fn().mockResolvedValue(rows);
  const embed = vi.fn(async (texts: string[]) => texts.map(() => [1, 0, 0]));
  const service = new EmbeddingService(
    anyCast({ client: { embedding: { findMany }, $executeRaw: execute } }),
    anyCast({ embed }), new ActivityService(),
  );
  return { service, rows, execute, findMany, embed };
}

describe('embedding backfill batches', () => {
  it('embeds two CPU chunks but writes nine rows in one database statement', async () => {
    const { service, execute, embed } = make();
    expect(await service.backfillPending('owner')).toEqual({ processed: 9, failed: 0 });
    expect(embed).toHaveBeenCalledTimes(2);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('reports only rows still eligible when the database applies the vectors', async () => {
    const { service, execute } = make(2);
    execute.mockResolvedValue(1); // One row changed while inference was running.
    expect(await service.backfillPending('owner')).toEqual({ processed: 1, failed: 1 });
  });

  it('does not partially write a chunk whose model omitted a vector', async () => {
    const { service, execute, embed } = make(2);
    embed.mockResolvedValue([[1, 0, 0]]);
    expect(await service.backfillPending('owner')).toEqual({ processed: 0, failed: 2 });
    expect(execute).not.toHaveBeenCalled();
  });

  it('retains successful chunks when another inference chunk fails', async () => {
    const { service, execute, embed } = make();
    embed.mockRejectedValueOnce(new Error('synthetic model failure'));
    execute.mockResolvedValue(1);
    expect(await service.backfillPending('owner')).toEqual({ processed: 1, failed: 8 });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('returns all rows as failed if the atomic database write fails', async () => {
    const { service, execute } = make();
    execute.mockRejectedValue(new Error('synthetic write failure'));
    expect(await service.backfillPending('owner')).toEqual({ processed: 0, failed: 9 });
  });

  it('does no model or write work for an empty queue', async () => {
    const { service, execute, embed } = make(0);
    expect(await service.backfillPending('owner')).toEqual({ processed: 0, failed: 0 });
    expect(execute).not.toHaveBeenCalled();
    expect(embed).not.toHaveBeenCalled();
  });
});
