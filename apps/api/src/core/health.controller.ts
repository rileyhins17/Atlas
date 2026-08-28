import { Controller, Get, Query } from '@nestjs/common';
import { ActivityService } from './activity.service.js';
import { PrismaService } from './prisma.service.js';

interface HealthReport {
  status: 'ok' | 'degraded';
  db: 'ok' | 'down';
  /** When `db` was last established by a real query. May be stale — see below. */
  dbCheckedAt: string;
  /** False when the database was still unreachable after the boot retries. */
  dbAtBoot: boolean;
  time: string;
}

@Controller('health')
export class HealthController {
  private db: 'ok' | 'down' = 'down';
  private dbCheckedAt = new Date(0);
  private probedAtCount = -1;

  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
  ) {}

  /**
   * Deliberately 200 even when the database is down.
   *
   * The only consumer is `infra/atlas-health.ps1`, which restarts the API when
   * this returns >=400. Restarting cannot fix a database on the other side of
   * the internet, so answering 503 would just spin the process while it wakes
   * — and a restarting API is worse than a degraded one, because it 502s every
   * route instead of failing only the ones that need data. The status field is
   * where the truth goes; the code answers "is this process alive".
   *
   * IT DOES NOT PROBE ON EVERY CALL, and that is the point. This endpoint used
   * to run `SELECT 1` unconditionally, and the watchdog polls it every two
   * minutes forever — which by itself kept a serverless Postgres awake around
   * the clock and burned its monthly compute quota in about a week, taking the
   * whole product down. So the probe is re-run only when somebody has actually
   * used the API since the last one, and otherwise the last known answer is
   * returned with the timestamp that earned it. A stale `db` field is honest;
   * a fresh one that costs an hour of compute a day is not.
   *
   * `?probe=1` forces a live check, for a human debugging by hand. The watchdog
   * must never pass it.
   */
  @Get()
  async check(@Query('probe') probe?: string): Promise<HealthReport> {
    const seen = this.activity.count;
    if (
      probe === '1' ||
      this.probedAtCount < 0 ||
      this.activity.hasRequestsSince(this.probedAtCount)
    ) {
      this.probedAtCount = seen;
      this.db = await this.ping();
      this.dbCheckedAt = new Date();
    }
    return {
      status: this.db === 'ok' ? 'ok' : 'degraded',
      db: this.db,
      dbCheckedAt: this.dbCheckedAt.toISOString(),
      dbAtBoot: this.prisma.dbReachableAtBoot,
      time: new Date().toISOString(),
    };
  }

  private async ping(): Promise<'ok' | 'down'> {
    try {
      await this.prisma.client.$queryRaw`SELECT 1`;
      return 'ok';
    } catch {
      return 'down';
    }
  }
}
