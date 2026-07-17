import { prisma } from '@atlas/db';
import { estimateCostMicros } from './pricing.js';

export class DailyTokenCapError extends Error {
  constructor(
    public readonly usedToday: number,
    public readonly cap: number,
  ) {
    super(`AI daily token cap reached (${usedToday}/${cap}). Try again tomorrow or raise the cap.`);
    this.name = 'DailyTokenCapError';
  }
}

function startOfUtcDay(d = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * Enforces spend limits and records usage. Every AI call must be wrapped:
 *
 *   await costGuard.assertUnderCap();
 *   const res = await provider.chat(...);
 *   await costGuard.record({ ...res.usage, model, purpose, userId });
 *
 * The cap is a hard ceiling on tokens/day (env AI_DAILY_TOKEN_CAP). 0 disables AI.
 */
export class CostGuard {
  constructor(private readonly dailyTokenCap: number) {}

  static fromEnv(): CostGuard {
    return new CostGuard(Number(process.env.AI_DAILY_TOKEN_CAP ?? 0));
  }

  get enabled(): boolean {
    return this.dailyTokenCap > 0;
  }

  async tokensUsedToday(): Promise<number> {
    const agg = await prisma.aiUsage.aggregate({
      where: { day: startOfUtcDay() },
      _sum: { promptTokens: true, completionTokens: true },
    });
    return (agg._sum.promptTokens ?? 0) + (agg._sum.completionTokens ?? 0);
  }

  /** Throws DailyTokenCapError if AI is disabled or the cap is already reached. */
  async assertUnderCap(): Promise<void> {
    if (!this.enabled) {
      throw new DailyTokenCapError(0, 0);
    }
    const used = await this.tokensUsedToday();
    if (used >= this.dailyTokenCap) {
      throw new DailyTokenCapError(used, this.dailyTokenCap);
    }
  }

  async record(params: {
    model: string;
    promptTokens: number;
    completionTokens: number;
    /** Prompt tokens served from the provider's cache (billed cheaper). */
    cachedPromptTokens?: number;
    purpose: string;
    userId?: string | null;
  }): Promise<void> {
    const costUsdMicros = estimateCostMicros(
      params.model,
      params.promptTokens,
      params.completionTokens,
      params.cachedPromptTokens ?? 0,
    );
    await prisma.aiUsage.create({
      data: {
        day: startOfUtcDay(),
        model: params.model,
        promptTokens: params.promptTokens,
        completionTokens: params.completionTokens,
        costUsdMicros,
        purpose: params.purpose,
        userId: params.userId ?? null,
      },
    });
  }
}
