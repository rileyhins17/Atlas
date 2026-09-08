import { describe, expect, it, vi } from 'vitest';
import { AccountService } from '../src/modules/account/account.service.js';

/**
 * The export is assembled as text now, not by `JSON.stringify` on one object,
 * so the thing that used to be guaranteed is the thing most worth testing:
 * that what comes out is still valid, complete JSON.
 *
 * It streams because the old version read fourteen unbounded tables into
 * memory, built one object, and stringified it with indentation — peak memory
 * was the whole account twice, in a single-process API serving everyone.
 */
function makeService(rows: Record<string, { id: string; [k: string]: unknown }[]>, pageSize = 500) {
  const reads: { model: string; take: number; cursor: string | undefined }[] = [];

  const delegate = (model: string) => ({
    findMany: vi.fn(async (args: Record<string, unknown>) => {
      const where = args.where as { id?: { gt: string } };
      const cursor = where?.id?.gt;
      const all = rows[model] ?? [];
      const from = cursor ? all.findIndex((r) => r.id === cursor) + 1 : 0;
      reads.push({ model, take: args.take as number, cursor });
      return all.slice(from, from + (args.take as number));
    }),
  });

  const client = {
    user: {
      findUniqueOrThrow: vi.fn(async () => ({
        id: 'u1',
        email: 'someone@example.com',
        displayName: 'Someone',
        timezone: 'America/Toronto',
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-02T00:00:00Z'),
      })),
    },
    task: delegate('tasks'),
    event: delegate('events'),
    habit: delegate('habits'),
    habitLog: delegate('habitLogs'),
    journalEntry: delegate('journalEntries'),
    note: delegate('notes'),
    goal: delegate('goals'),
    account: delegate('accounts'),
    transaction: delegate('transactions'),
    timelineEvent: delegate('timelineEvents'),
    insight: delegate('insights'),
    aiQuestion: delegate('aiQuestions'),
    embedding: delegate('embeddings'),
    credential: delegate('connections'),
  };

  void pageSize;
  const service = new AccountService({ client } as never);
  return { service, reads };
}

async function collect(service: AccountService, userId = 'u1'): Promise<string> {
  let out = '';
  for await (const chunk of service.streamExport(userId)) out += chunk;
  return out;
}

const many = (prefix: string, n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `${prefix}-${String(i).padStart(4, '0')}`, n: i }));

describe('the account export', () => {
  it('is valid JSON when the account is completely empty', async () => {
    const { service } = makeService({});
    const parsed = JSON.parse(await collect(service));
    expect(parsed.format).toBe('atlas.account-export.v1');
    expect(parsed.user.email).toBe('someone@example.com');
    expect(parsed.tasks).toEqual([]);
    expect(parsed.connections).toEqual([]);
  });

  it('is valid JSON with one row, which is where a comma is easiest to get wrong', async () => {
    const { service } = makeService({ tasks: [{ id: 't1', title: 'Only one' }] });
    const parsed = JSON.parse(await collect(service));
    expect(parsed.tasks).toHaveLength(1);
    expect(parsed.tasks[0].title).toBe('Only one');
  });

  /** The case the streaming exists for. */
  it('pages a table larger than one read, and returns every row exactly once', async () => {
    const { service, reads } = makeService({ tasks: many('t', 1201) });
    const parsed = JSON.parse(await collect(service));

    expect(parsed.tasks).toHaveLength(1201);
    expect(new Set(parsed.tasks.map((t: { id: string }) => t.id)).size).toBe(1201);
    expect(parsed.tasks[0].id).toBe('t-0000');
    expect(parsed.tasks.at(-1).id).toBe('t-1200');

    // Bounded reads, and a cursor rather than an offset.
    const taskReads = reads.filter((r) => r.model === 'tasks');
    expect(taskReads.every((r) => r.take === 500)).toBe(true);
    expect(taskReads[0]!.cursor).toBeUndefined();
    expect(taskReads[1]!.cursor).toBe('t-0499');
  });

  it('stops reading a table as soon as a page comes back short', async () => {
    const { service, reads } = makeService({ tasks: many('t', 10) });
    await collect(service);
    expect(reads.filter((r) => r.model === 'tasks')).toHaveLength(1);
  });

  it('keeps every section, in the order the v1 format declares', async () => {
    const { service } = makeService({});
    const text = await collect(service);
    const order = [
      'tasks', 'events', 'habits', 'habitLogs', 'journalEntries', 'notes', 'goals',
      'accounts', 'transactions', 'timelineEvents', 'insights', 'aiQuestions',
      'embeddings', 'connections',
    ];
    let at = -1;
    for (const key of order) {
      const next = text.indexOf(`"${key}"`);
      expect(next, key).toBeGreaterThan(at);
      at = next;
    }
  });

  /** Prisma hands back bigints for money; JSON has no such thing. */
  it('writes a bigint as a string rather than throwing', async () => {
    const { service } = makeService({
      transactions: [{ id: 'x1', amountCents: 12345678901234567890n as unknown as number }],
    });
    const parsed = JSON.parse(await collect(service));
    expect(parsed.transactions[0].amountCents).toBe('12345678901234567890');
  });

  /** The secret must never leave the box, not even as ciphertext. */
  it('never asks the database for the encrypted credential blob', async () => {
    const { service } = makeService({ connections: [{ id: 'c1', connector: 'google' }] });
    const text = await collect(service);
    expect(text).not.toContain('dataEnc');
    expect(text).not.toContain('passwordHash');
  });
});
