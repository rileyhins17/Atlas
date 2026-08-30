import { describe, expect, it, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { JournalService } from '../src/modules/journal/journal.service.js';

/**
 * Journal entries became editable, and the interesting parts of an edit are the
 * three things that are NOT the row itself:
 *
 *   1. Ownership. An update takes an id from the client, so without a scoped
 *      read first, `prisma.update({ where: { id } })` happily edits another
 *      user's entry. Nothing about the response would look wrong.
 *   2. The embedding. Change the text and the stored vector still describes the
 *      old text, so AI recall keeps quoting sentences the user has rewritten —
 *      silently, and only in the model's answers.
 *   3. The timeline. Every mutation writes a row; that log is what the model
 *      reads across domains, and an edit that skips it leaves the log claiming
 *      the entry still says what it said when first written.
 */

const entry = {
  id: 'j1',
  userId: 'u1',
  body: 'original body',
  mood: 3,
  tags: [],
  entryDate: new Date('2026-08-20T00:00:00.000Z'),
  createdAt: new Date('2026-08-20T10:00:00.000Z'),
};

function makeService(found: typeof entry | null = entry) {
  const findFirst = vi.fn().mockResolvedValue(found);
  // Prisma treats an `undefined` field as "leave this column alone"; a naive
  // spread instead overwrites the column with undefined, which made every test
  // here fail on a bug that exists only in the fake.
  const update = vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => {
    const applied = Object.fromEntries(
      Object.entries(data).filter(([, value]) => value !== undefined),
    );
    return Promise.resolve({ ...entry, ...applied });
  });
  const write = vi.fn().mockResolvedValue(undefined);
  const queueForEmbedding = vi.fn().mockResolvedValue(undefined);
  const prisma = { client: { journalEntry: { findFirst, update } } };
  const service = new JournalService(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prisma as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { write } as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { queueForEmbedding } as any,
  );
  return { service, findFirst, update, write, queueForEmbedding };
}

describe('JournalService.update', () => {
  it('scopes the lookup to the owner before writing anything', async () => {
    const { service, findFirst, update } = makeService();
    await service.update('u1', 'j1', { body: 'edited' });

    expect(findFirst).toHaveBeenCalledWith({ where: { id: 'j1', userId: 'u1' } });
    // The ownership check must precede the write, or it proves nothing.
    expect(findFirst.mock.invocationCallOrder[0]).toBeLessThan(
      update.mock.invocationCallOrder[0]!,
    );
  });

  it("refuses an entry that is not the caller's, and writes nothing", async () => {
    const { service, update, write, queueForEmbedding } = makeService(null);
    await expect(service.update('attacker', 'j1', { body: 'edited' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(update).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
    expect(queueForEmbedding).not.toHaveBeenCalled();
  });

  it('re-embeds when the text changed, so recall stops quoting the old wording', async () => {
    const { service, queueForEmbedding } = makeService();
    await service.update('u1', 'j1', { body: 'a genuinely different sentence' });
    expect(queueForEmbedding).toHaveBeenCalledWith(
      'u1',
      'journal',
      'j1',
      'a genuinely different sentence',
    );
  });

  it('does not re-embed when only the mood changed', async () => {
    const { service, queueForEmbedding } = makeService();
    await service.update('u1', 'j1', { mood: 5 });
    // Embedding is CPU work and the vector is still correct — the text is the
    // same. Re-queueing every edit would make a mood tap cost a model run.
    expect(queueForEmbedding).not.toHaveBeenCalled();
  });

  it('does not re-embed when the body is resent unchanged', async () => {
    const { service, queueForEmbedding } = makeService();
    await service.update('u1', 'j1', { body: 'original body' });
    expect(queueForEmbedding).not.toHaveBeenCalled();
  });

  it('records the edit on the timeline rather than rewriting history', async () => {
    const { service, write } = makeService();
    await service.update('u1', 'j1', { body: 'edited text' });

    expect(write).toHaveBeenCalledTimes(1);
    const event = write.mock.calls[0]![0] as Record<string, unknown>;
    expect(event.type).toBe('journal.updated');
    expect(event.refType).toBe('journal');
    expect(event.refId).toBe('j1');
    expect(event.userId).toBe('u1');
    // The new text, not the old — the log is what the model reads.
    expect(String(event.title)).toContain('edited text');
  });

  it('clears the mood when it is explicitly set to null', async () => {
    const { service, update } = makeService();
    await service.update('u1', 'j1', { mood: null });
    // undefined would mean "leave it"; null has to survive as null all the way
    // to Prisma or a mood can be set but never removed.
    expect(update.mock.calls[0]![0].data.mood).toBeNull();
  });
});
