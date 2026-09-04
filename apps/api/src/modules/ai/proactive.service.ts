import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import type { InsightDTO } from '@atlas/shared';
import { PrismaService } from '../../core/prisma.service.js';
import { ActivityService } from '../../core/activity.service.js';
import { PushService } from '../push/push.service.js';
import { OrchestratorService } from './orchestrator.service.js';
import { localDayStartUtc, localHour, localWeekStartUtc } from './time.util.js';

/**
 * Phase 4 — proactive engine. Instead of waiting for a button press, this sweep
 * makes Atlas act on its own: for each user who has AI configured and hasn't
 * opted out, once they've reached their preferred `briefHour` (in their own
 * timezone) it generates a daily brief once per local day and a weekly review
 * once per local week — each of which also seeds fresh `ai_questions`.
 *
 * Mirrors EmbeddingService.sweepPending: timer, re-entrancy guard, AND the
 * activity gate. The gate is not decoration — it is the reason that class
 * exists in the shape it does. Two timer sweeps that queried unconditionally
 * kept a serverless Postgres awake around the clock and burned the whole
 * monthly compute quota in about a week, after which it refused every query.
 * This sweep copied the guard and the sentence "mirrors sweepPending" and
 * missed the gate, so an idle Atlas still woke the database every hour.
 *
 * Unlike embeddings this also costs money, so it goes through
 * OrchestratorService (CostGuard-capped) and is bounded per sweep.
 */
const SWEEP_INTERVAL_MS = 60 * 60_000; // hourly; per-period guards limit real generation
const MAX_USERS_PER_SWEEP = 50; // spend + load safety rail

@Injectable()
export class ProactiveService {
  private readonly logger = new Logger(ProactiveService.name);
  private running = false;
  /**
   * Request count at the last sweep. Starts at 0, not -1, so a server that
   * boots and is never used sweeps zero times — the embedding sweep can afford
   * -1 because it pairs it with a deliberate one-off run at bootstrap, and this
   * one has nothing it needs to catch up on: a brief is due at a wall-clock
   * hour, and if nobody has opened Atlas there is nobody to deliver it to.
   */
  private sweptAtCount = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly orchestrator: OrchestratorService,
    private readonly push: PushService,
    private readonly activity: ActivityService,
  ) {}

  @Interval(SWEEP_INTERVAL_MS)
  async sweep(): Promise<void> {
    // Nobody can be due a brief without having used Atlas, so an idle API must
    // not run this query at all. Checked BEFORE the re-entrancy guard is taken
    // so a skipped sweep leaves no state behind.
    if (!this.activity.hasRequestsSince(this.sweptAtCount)) return;
    if (this.running) return;
    this.running = true;
    // Read the counter before the work, not after: a request that arrives
    // during the sweep must still earn the next one.
    const seen = this.activity.count;
    try {
      const users = await this.eligibleUsers();
      const now = new Date();
      let briefs = 0;
      let reviews = 0;

      for (const user of users) {
        // Not yet their chosen hour today — nothing to do for this user.
        if (localHour(user.timezone, now) < user.briefHour) continue;

        if (await this.needs(user.id, 'daily_brief', localDayStartUtc(user.timezone, now))) {
          const insight = await this.run(user.id, 'daily_brief', () =>
            this.orchestrator.generateDailyBrief(user.id),
          );
          if (insight) {
            briefs++;
            await this.notify(user.id, insight);
          }
        }
        if (await this.needs(user.id, 'weekly_review', localWeekStartUtc(user.timezone, now))) {
          const insight = await this.run(user.id, 'weekly_review', () =>
            this.orchestrator.generateWeeklyReview(user.id),
          );
          if (insight) {
            reviews++;
            await this.notify(user.id, insight);
          }
        }
      }

      if (briefs > 0 || reviews > 0) {
        this.logger.log(`Proactive sweep: ${briefs} daily brief(s), ${reviews} weekly review(s)`);
      }
    } catch (err) {
      this.logger.warn(`Proactive sweep errored: ${errText(err)}`);
    } finally {
      this.sweptAtCount = seen;
      this.running = false;
    }
  }

  /** Opted-in users with AI configured (a DeepSeek credential). Bounded. */
  private eligibleUsers(): Promise<Array<{ id: string; timezone: string; briefHour: number }>> {
    return this.prisma.client.user.findMany({
      where: {
        proactiveEnabled: true,
        credentials: { some: { connector: 'deepseek', status: 'active' } },
      },
      select: { id: true, timezone: true, briefHour: true },
      take: MAX_USERS_PER_SWEEP,
    });
  }

  /** True if the user has no `kind` insight created since `since`. */
  private async needs(userId: string, kind: string, since: Date): Promise<boolean> {
    const count = await this.prisma.client.insight.count({
      where: { userId, kind, createdAt: { gte: since } },
    });
    return count === 0;
  }

  /** Run one generation, swallowing per-user failures (over cap / provider error). */
  private async run<T>(userId: string, kind: string, generate: () => Promise<T>): Promise<T | null> {
    try {
      return await generate();
    } catch (err) {
      this.logger.warn(`Proactive ${kind} failed for ${userId}: ${errText(err)}`);
      return null;
    }
  }

  /** Best-effort web-push nudge that the fresh insight is ready. */
  private async notify(userId: string, insight: InsightDTO): Promise<void> {
    try {
      await this.push.sendToUser(userId, {
        title: insight.title || 'Atlas',
        body: truncate(insight.body ?? '', 140),
        url: '/today',
      });
    } catch (err) {
      this.logger.warn(`Proactive push failed for ${userId}: ${errText(err)}`);
    }
  }
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`;
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : 'unknown error';
}
