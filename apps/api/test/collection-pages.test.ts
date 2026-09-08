import { describe, expect, it, vi } from 'vitest';
import { AiQuestionsService } from '../src/modules/ai/ai-questions.service.js';
import { readCollection } from '../src/core/collection-pages.js';

const fixture = (count: number) => Array.from({ length: count }, (_, i) => ({
  id: `question-${String(i).padStart(5, '0')}`, userId: 'owner', status: 'OPEN',
  question: `Synthetic question ${i}`, rationale: null, answer: null,
  createdAt: new Date('2026-01-01T00:00:00Z'), answeredAt: null,
}));

function serviceWith(count: number) {
  const rows = fixture(count);
  const findMany = vi.fn(async (args: {
    take?: number; cursor?: { id: string }; skip?: number; where: { userId: string };
  }) => {
    const start = args.cursor ? rows.findIndex((row) => row.id === args.cursor!.id) + (args.skip ?? 0) : 0;
    return rows.slice(start, args.take === undefined ? undefined : start + args.take);
  });
  const service = new AiQuestionsService({ client: { aiQuestion: { findMany } } } as never, {} as never, {} as never);
  return { service, findMany };
}

describe('complete collection reads', () => {
  it('returns empty collections and an exact full-page boundary without duplicates', async () => {
    expect(await serviceWith(0).service.listOpen('owner')).toEqual([]);
    expect(await serviceWith(250).service.listOpen('owner')).toHaveLength(250);
  });

  it('rejects a repeated cursor instead of looping or returning duplicate records', async () => {
    const page = fixture(250);
    const fetchPage = vi.fn(async () => page);
    await expect(readCollection(fetchPage)).rejects.toThrow('Collection changed during pagination');
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });

  it('also limits bytes when a few unusually large rows would exhaust memory', async () => {
    await expect(readCollection(async () => [{ id: 'large', text: 'x'.repeat(8 * 1024 * 1024) }]))
      .rejects.toThrow('Collection exceeds the safe read limit');
  });

  it.each([251, 500, 511])('returns all %i historical questions through bounded pages', async (count) => {
    const { service, findMany } = serviceWith(count);
    const rows = await service.listOpen('owner');
    expect(rows).toHaveLength(count);
    expect(new Set(rows.map((row) => row.id)).size).toBe(count);
    expect(rows.at(-1)?.id).toBe(`question-${String(count - 1).padStart(5, '0')}`);
    for (const [query] of findMany.mock.calls) {
      expect(query.take).toBeGreaterThan(0);
      expect(query.take).toBeLessThanOrEqual(250);
      expect(query.where.userId).toBe('owner');
    }
    expect(findMany.mock.calls.length).toBeGreaterThan(1);
  });

  it('fails explicitly instead of returning a truncated oversized collection', async () => {
    const { service } = serviceWith(10_001);
    await expect(service.listOpen('owner')).rejects.toThrow('Collection exceeds the safe read limit');
  });
});
