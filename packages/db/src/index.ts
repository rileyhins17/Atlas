// Single source of the Prisma client for the whole monorepo.
// Import from `@atlas/db` everywhere; never import `@prisma/client` directly in
// app code, so the client is configured in exactly one place.

import { PrismaClient } from '@prisma/client';

// Re-export all generated types & enums so consumers get them from one package.
export * from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * Shared Prisma client. Reused across hot-reloads in dev to avoid exhausting
 * Postgres connections.
 */
/**
 * Set `PRISMA_LOG_QUERIES=1` to have every statement and its duration logged.
 *
 * Off by default and deliberately opt-in: it is the only way to answer "why
 * does this endpoint take 300ms when the database is 26ms away", and the answer
 * is almost always a count of round trips nobody meant to make. Leaving it on
 * would put user data — task titles, journal snippets — into a log file.
 */
const logQueries = process.env.PRISMA_LOG_QUERIES === '1';

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: logQueries
      ? [{ emit: 'event', level: 'query' }, 'warn', 'error']
      : process.env.NODE_ENV === 'development'
        ? ['warn', 'error']
        : ['error'],
  });

if (logQueries) {
  // Parameters are NOT logged: they are the user's actual data.
  (prisma as unknown as {
    $on: (event: 'query', cb: (e: { duration: number; query: string }) => void) => void;
  }).$on('query', (event) => {
    const statement = event.query.replace(/\s+/g, ' ').slice(0, 160);
    // Diagnostic output behind an explicit opt-in flag; warn/error would
    // misreport its severity, so the rule is disabled rather than dodged.
    // eslint-disable-next-line no-console
    console.log(`[prisma] ${String(event.duration).padStart(5)}ms  ${statement}`);
  });
}

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
