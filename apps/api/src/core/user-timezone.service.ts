import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';
import { safeTz } from '../modules/ai/time.util.js';

/**
 * The user's timezone, without a round trip for it on every request.
 *
 * Six services were each running `SELECT timezone FROM users WHERE id = $1`
 * before doing their real work — routine, tasks, calendar, stats, trackers and
 * the orchestrator. Measured against ca-central-1 that is 26ms, on endpoints
 * whose entire useful work is 56ms, so a third of several responses was spent
 * re-reading one short string that had not changed.
 *
 * It is already on the request. `SessionGuard` loads it with the session and
 * puts it on `AuthedUser`, so the honest fix is to pass it down from the
 * controllers — but that is six services and every call site, and it makes the
 * signature of every internal method carry a parameter that only exists for
 * performance. This cache buys the same round trip back for one small class.
 *
 * A timezone changes when someone edits it in Settings, which is rare and
 * which this app can see happen — so the cache is invalidated on write rather
 * than relying on the TTL. The TTL is the backstop for a change that arrives
 * some other way (a direct database edit, another process), not the mechanism.
 */
const TTL_MS = 5 * 60_000;

@Injectable()
export class UserTimezoneService {
  private readonly cache = new Map<string, { tz: string; at: number }>();

  constructor(private readonly prisma: PrismaService) {}

  async get(userId: string): Promise<string> {
    const hit = this.cache.get(userId);
    if (hit && Date.now() - hit.at < TTL_MS) return hit.tz;

    const user = await this.prisma.client.user.findUnique({
      where: { id: userId },
      select: { timezone: true },
    });
    const tz = safeTz(user?.timezone || 'UTC');
    this.cache.set(userId, { tz, at: Date.now() });
    return tz;
  }

  /**
   * Called by whatever writes `users.timezone`.
   *
   * Without this, changing your timezone in Settings would appear to do nothing
   * for up to five minutes — and "I changed it and the app ignored me" is a
   * worse bug than the round trip this class exists to avoid.
   */
  forget(userId: string): void {
    this.cache.delete(userId);
  }

  /** Seed from a request's already-loaded user, so the first read is free too. */
  prime(userId: string, timezone: string): void {
    this.cache.set(userId, { tz: safeTz(timezone), at: Date.now() });
  }
}
