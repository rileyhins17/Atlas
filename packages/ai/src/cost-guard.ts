import { prisma } from '@atlas/db';
import { estimateCostMicros } from './pricing.js';

/**
 * Which ceiling was hit. The remedies are different, so the message is too:
 * "you have used your AI for today" is the user's own budget, "Atlas is busy"
 * is the deployment's, and telling someone to raise a cap they do not control
 * is worse than saying nothing.
 */
export type CapScope = 'user' | 'global' | 'disabled';

export class DailyTokenCapError extends Error {
  constructor(
    public readonly usedToday: number,
    public readonly cap: number,
    public readonly scope: CapScope = 'user',
  ) {
    super(DailyTokenCapError.message(usedToday, cap, scope));
    this.name = 'DailyTokenCapError';
  }

  private static message(used: number, cap: number, scope: CapScope): string {
    if (scope === 'disabled') {
      return 'Atlas AI is turned off on this server. Nothing was sent and nothing was charged.';
    }
    if (scope === 'global') {
      return `Atlas has reached its shared daily AI limit for everyone (${used}/${cap}). It resets at midnight UTC.`;
    }
    return `You have used your AI for today (${used}/${cap} tokens). It resets at midnight UTC.`;
  }
}

/**
 * Purposes that estimate a call rather than make one.
 *
 * `/ai/dry-run` reports what a prompt WOULD cost and explicitly returns
 * `wouldCallModel: false`, yet it wrote its estimate to the same ledger the cap
 * reads. Nothing was ever sent to a provider and nothing was ever billed, but
 * the tokens counted — so any signed-in account could exhaust the shared budget
 * in under a minute at the throttle limit, for zero real spend. The row is still
 * written, because knowing what the prompt weighs is the point of the endpoint;
 * it just does not count against money nobody spent.
 */
export const UNBILLED_PURPOSES: string[] = ['dry_run'];

function startOfUtcDay(d = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * Enforces spend limits and records usage. Every AI call must be wrapped:
 *
 *   await costGuard.assertUnderCap(userId);
 *   const res = await provider.chat(...);
 *   await costGuard.record({ ...res.usage, model, purpose, userId });
 *
 * TWO ceilings, and the per-user one is the important half.
 *
 * It used to be a single global sum — `aggregate` over the day with no userId —
 * which meant one person running brain-dumps all morning locked every other
 * account out of AI until UTC midnight. On a deployment where the owner shares
 * his key with friends that is not a hypothetical; it is the normal case. The
 * ledger has carried `userId` and an `@@index([userId, day])` since the first
 * migration, so the data to do this right was always there and simply never
 * queried that way.
 *
 * The global ceiling stays as a second guard, because a hundred accounts each
 * politely under their own limit can still bankrupt whoever owns the key.
 */
export class CostGuard {
  constructor(
    private readonly dailyTokenCap: number,
    /** 0 = no global ceiling beyond the per-user one. */
    private readonly globalDailyTokenCap = 0,
  ) {}

  static fromEnv(): CostGuard {
    return new CostGuard(
      Number(process.env.AI_DAILY_TOKEN_CAP ?? 0),
      Number(process.env.AI_GLOBAL_DAILY_TOKEN_CAP ?? 0),
    );
  }

  get enabled(): boolean {
    return this.dailyTokenCap > 0;
  }

  /**
   * Tokens spent today. Scoped to one user unless `userId` is omitted, which
   * asks for the deployment-wide total.
   */
  async tokensUsedToday(userId?: string): Promise<number> {
    const agg = await prisma.aiUsage.aggregate({
      where: {
        day: startOfUtcDay(),
        ...(userId ? { userId } : {}),
        // Estimates never charged to a provider must not consume a real budget.
        purpose: { notIn: UNBILLED_PURPOSES },
      },
      _sum: { promptTokens: true, completionTokens: true },
    });
    return (agg._sum?.promptTokens ?? 0) + (agg._sum?.completionTokens ?? 0);
  }

  /**
   * Throws DailyTokenCapError if AI is off, this user is out of budget, or the
   * deployment as a whole is.
   *
   * `userId` is required in practice. It is optional in the signature only so
   * the few genuinely user-less callers (a boot-time check) still compile; those
   * fall back to the global total, which is the conservative reading.
   */
  async assertUnderCap(userId?: string): Promise<void> {
    if (!this.enabled) {
      throw new DailyTokenCapError(0, 0, 'disabled');
    }
    if (this.globalDailyTokenCap > 0) {
      const everyone = await this.tokensUsedToday();
      if (everyone >= this.globalDailyTokenCap) {
        throw new DailyTokenCapError(everyone, this.globalDailyTokenCap, 'global');
      }
    }
    const used = await this.tokensUsedToday(userId);
    if (used >= this.dailyTokenCap) {
      throw new DailyTokenCapError(used, this.dailyTokenCap, 'user');
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
        cachedPromptTokens: params.cachedPromptTokens ?? 0,
        costUsdMicros,
        purpose: params.purpose,
        userId: params.userId ?? null,
      },
    });
  }
}
