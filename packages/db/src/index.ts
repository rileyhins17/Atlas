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
export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
