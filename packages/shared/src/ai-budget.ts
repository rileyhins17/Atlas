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

export function startOfUtcDayAt(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
