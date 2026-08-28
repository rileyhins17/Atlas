import { Controller, Get } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';

interface HealthReport {
  status: 'ok' | 'degraded';
  db: 'ok' | 'down';
  /** False when the database was still unreachable after the boot retries. */
  dbAtBoot: boolean;
  time: string;
}

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Deliberately 200 even when the database is down.
   *
   * The only consumer is `infra/atlas-health.ps1`, which restarts the API when
   * this returns >=400. Restarting cannot fix a database on the other side of
   * the internet, so answering 503 would just spin the process while Neon wakes
   * — and a restarting API is worse than a degraded one, because it 502s every
   * route instead of failing only the ones that need data. The status field is
   * where the truth goes; the code answers "is this process alive".
   *
   * Prisma reconnects lazily on the next query, so `db` flips back to `ok` on
   * its own once the database returns. No restart, no intervention.
   */
  @Get()
  async check(): Promise<HealthReport> {
    let db: 'ok' | 'down' = 'ok';
    try {
      await this.prisma.client.$queryRaw`SELECT 1`;
    } catch {
      db = 'down';
    }
    return {
      status: db === 'ok' ? 'ok' : 'degraded',
      db,
      dbAtBoot: this.prisma.dbReachableAtBoot,
      time: new Date().toISOString(),
    };
  }
}
