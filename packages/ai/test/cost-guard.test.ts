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
      model: 'deepseek-chat',
      promptTokens: 1000,
      completionTokens: 500,
      purpose: 'chat',
      userId: 'user-1',
    });
    expect(create).toHaveBeenCalledTimes(1);
    const arg = create.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(arg.data.model).toBe('deepseek-chat');
    expect(arg.data.promptTokens).toBe(1000);
    expect(arg.data.completionTokens).toBe(500);
    expect(arg.data.purpose).toBe('chat');
    expect(arg.data.userId).toBe('user-1');
    // deepseek-chat rate: 0.14 in / 0.28 out micros-per-token -> 1000*0.14 + 500*0.28 = 280
    expect(arg.data.costUsdMicros).toBe(280);
  });

  it('record() defaults userId to null when omitted', async () => {
    const guard = new CostGuard(1000);
    await guard.record({ model: 'deepseek-chat', promptTokens: 10, completionTokens: 0, purpose: 'daily_brief' });
    const arg = create.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(arg.data.userId).toBeNull();
  });
});
