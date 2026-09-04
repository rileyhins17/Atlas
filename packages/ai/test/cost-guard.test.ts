import { beforeEach, describe, expect, it, vi } from 'vitest';

const aggregate = vi.fn();
const create = vi.fn();

vi.mock('@atlas/db', () => ({
  prisma: {
    aiUsage: {
      aggregate: (...args: unknown[]) => aggregate(...args),
      create: (...args: unknown[]) => create(...args),
    },
  },
}));

const { CostGuard, DailyTokenCapError } = await import('../src/cost-guard.js');

beforeEach(() => {
  aggregate.mockReset();
  create.mockReset();
  aggregate.mockResolvedValue({ _sum: { promptTokens: 0, completionTokens: 0 } });
  create.mockResolvedValue(undefined);
});

describe('CostGuard', () => {
  it('is disabled when the cap is 0', () => {
    const guard = new CostGuard(0);
    expect(guard.enabled).toBe(false);
  });

  it('assertUnderCap throws DailyTokenCapError when disabled', async () => {
    const guard = new CostGuard(0);
    await expect(guard.assertUnderCap()).rejects.toThrow(DailyTokenCapError);
  });

  it('assertUnderCap passes when under the cap', async () => {
    aggregate.mockResolvedValue({ _sum: { promptTokens: 100, completionTokens: 50 } });
    const guard = new CostGuard(1000);
    await expect(guard.assertUnderCap()).resolves.toBeUndefined();
  });

  it('assertUnderCap throws once usage reaches the cap', async () => {
    aggregate.mockResolvedValue({ _sum: { promptTokens: 900, completionTokens: 100 } });
    const guard = new CostGuard(1000);
    await expect(guard.assertUnderCap()).rejects.toThrow(DailyTokenCapError);
  });

  it('throws with the used/cap figures attached', async () => {
    aggregate.mockResolvedValue({ _sum: { promptTokens: 1000, completionTokens: 0 } });
    const guard = new CostGuard(1000);
    try {
      await guard.assertUnderCap();
      throw new Error('expected assertUnderCap to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(DailyTokenCapError);
      const capErr = err as InstanceType<typeof DailyTokenCapError>;
      expect(capErr.usedToday).toBe(1000);
      expect(capErr.cap).toBe(1000);
    }
  });

  it('tokensUsedToday sums prompt + completion tokens, treating nulls as 0', async () => {
    aggregate.mockResolvedValue({ _sum: { promptTokens: null, completionTokens: 42 } });
    const guard = new CostGuard(1000);
    await expect(guard.tokensUsedToday()).resolves.toBe(42);
  });

  it('record() writes a usage row with an estimated cost and the given purpose/userId', async () => {
    const guard = new CostGuard(1000);
    await guard.record({
      model: 'deepseek-v4-flash',
      promptTokens: 1000,
      completionTokens: 500,
      purpose: 'chat',
      userId: 'user-1',
    });
    expect(create).toHaveBeenCalledTimes(1);
    const arg = create.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(arg.data.model).toBe('deepseek-v4-flash');
    expect(arg.data.promptTokens).toBe(1000);
    expect(arg.data.completionTokens).toBe(500);
    expect(arg.data.purpose).toBe('chat');
    expect(arg.data.userId).toBe('user-1');
    // deepseek-v4-flash: 0.14 in / 0.28 out micros-per-token -> 1000*0.14 + 500*0.28 = 280
    expect(arg.data.costUsdMicros).toBe(280);
  });

  it('record() prices cache-hit prompt tokens cheaply when the provider reports them', async () => {
    const guard = new CostGuard(1000);
    await guard.record({
      model: 'deepseek-v4-flash',
      promptTokens: 1000,
      completionTokens: 0,
      cachedPromptTokens: 1000,
      purpose: 'chat',
    });
    const arg = create.mock.calls[0]![0] as { data: Record<string, unknown> };
    // 1000 * 0.0028 = 2.8 -> ceil -> 3, vs 140 if cache hits were ignored.
    expect(arg.data.costUsdMicros).toBe(3);
    // Also persisted: a cache regression is otherwise invisible, and deriving
    // the hit rate back out of cost breaks as soon as prices change.
    expect(arg.data.cachedPromptTokens).toBe(1000);
  });

  it('record() defaults cachedPromptTokens to 0 when the provider reports none', async () => {
    const guard = new CostGuard(1000);
    await guard.record({ model: 'deepseek-v4-flash', promptTokens: 10, completionTokens: 0, purpose: 'chat' });
    const arg = create.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(arg.data.cachedPromptTokens).toBe(0);
  });

  it('record() defaults userId to null when omitted', async () => {
    const guard = new CostGuard(1000);
    await guard.record({ model: 'deepseek-v4-flash', promptTokens: 10, completionTokens: 0, purpose: 'daily_brief' });
    const arg = create.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(arg.data.userId).toBeNull();
  });
});

/**
 * The cap has to be PER USER.
 *
 * It was a single global sum: `aggregate` ran with `where: { day }` and no
 * userId, so one person's spending locked every other account out of AI until
 * UTC midnight. The ledger has carried `userId` and an `@@index([userId, day])`
 * from the first migration — it was simply never queried that way.
 */
describe('CostGuard — the cap is per user', () => {
  it('counts only the asking user towards their cap', async () => {
    const guard = new CostGuard(1000);
    await guard.assertUnderCap('user-a');
    const where = aggregate.mock.calls[0]?.[0]?.where as Record<string, unknown>;
    expect(where.userId).toBe('user-a');
  });

  it('lets one user through while another is over', async () => {
    // The ledger answers per user: A has spent everything, B has spent nothing.
    aggregate.mockImplementation(({ where }: { where: { userId?: string } }) =>
      Promise.resolve(
        where.userId === 'heavy'
          ? { _sum: { promptTokens: 5000, completionTokens: 0 } }
          : { _sum: { promptTokens: 0, completionTokens: 0 } },
      ),
    );
    const guard = new CostGuard(1000);
    await expect(guard.assertUnderCap('heavy')).rejects.toThrow(DailyTokenCapError);
    await expect(guard.assertUnderCap('light')).resolves.toBeUndefined();
  });

  /**
   * A second ceiling above the per-user one, so a hundred accounts cannot
   * bankrupt the owner between them even while each stays polite.
   */
  it('still enforces a global ceiling when one is set', async () => {
    aggregate.mockImplementation(({ where }: { where: { userId?: string } }) =>
      Promise.resolve(
        where.userId === undefined
          ? { _sum: { promptTokens: 99_000, completionTokens: 0 } }
          : { _sum: { promptTokens: 10, completionTokens: 0 } },
      ),
    );
    const guard = new CostGuard(1000, 50_000);
    await expect(guard.assertUnderCap('anyone')).rejects.toThrow(DailyTokenCapError);
  });

  it('says which limit was hit, because the remedies differ', async () => {
    aggregate.mockImplementation(({ where }: { where: { userId?: string } }) =>
      Promise.resolve(
        where.userId === undefined
          ? { _sum: { promptTokens: 99_000, completionTokens: 0 } }
          : { _sum: { promptTokens: 10, completionTokens: 0 } },
      ),
    );
    const guard = new CostGuard(1000, 50_000);
    // "Atlas is busy" is not the same instruction as "you are out of budget".
    await expect(guard.assertUnderCap('anyone')).rejects.toThrow(/everyone|shared|server/i);
  });
});
