import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { prisma } from '@atlas/db';
import { connectWithRetry } from './connect-retry.js';

/**
 * Thin Nest wrapper around the shared Prisma client so it participates in the
 * Nest lifecycle (connect on boot, disconnect on shutdown) and can be injected.
 *
 * Boot does NOT fail on an unreachable database — see `connect-retry.ts` for
 * why that rule matters more than it looks. `dbReachableAtBoot` records how it
 * went so `/health` can tell "the API is up and talking to Neon" apart from
 * "the API is up and the database is not", which a bare 502 cannot.
 */
@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  readonly client = prisma;
  private readonly logger = new Logger(PrismaService.name);
  dbReachableAtBoot = false;

  async onModuleInit(): Promise<void> {
    this.dbReachableAtBoot = await connectWithRetry({
      connect: () => this.client.$connect(),
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      onRetry: (attempt, delayMs, err) =>
        this.logger.warn(
          `Database not reachable (attempt ${attempt}): ${String(err)} — retrying in ${delayMs}ms`,
        ),
      onGiveUp: (attempts, err) =>
        this.logger.error(
          `Database unreachable after ${attempts} attempts: ${String(err)}. ` +
            'Starting anyway so /health can report it — data routes will fail until it returns.',
        ),
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect();
  }
}
