/* eslint-disable no-console -- a command-line probe; one line of output is the point. */
/**
 * Can we reach this Postgres, and does it accept these credentials?
 *
 * Exists so `supabase-connect.ps1` can find the right pooler host without the
 * password ever reaching a command line: the URL arrives in the environment,
 * the answer comes back as an exit code, and nothing is printed that could
 * echo a credential into a terminal transcript.
 *
 * Exit 0 = connected. Exit 1 = reachable but rejected us, or unreachable.
 * The distinction matters to the caller: "wrong host" should keep probing,
 * "wrong password" should stop and say so rather than trying nine more hosts.
 * Exit 2 signals a credential rejection, which is not worth retrying.
 */
import { PrismaClient } from '@prisma/client';

const url = process.env.PROBE_URL;
if (!url) process.exit(1);

const prisma = new PrismaClient({ datasources: { db: { url } } });
try {
  await prisma.$queryRaw`SELECT 1`;
  console.log('ok');
  process.exit(0);
} catch (err) {
  const message = String(err?.message ?? err);
  // Both patterns are the strings these servers ACTUALLY return, captured by
  // probing a real project. Guessed wordings were wrong twice: the pooler says
  // "tenant/user … not found", not "Tenant or user not found", and Prisma says
  // "Authentication failed against database server", not "password
  // authentication failed". Either miss breaks the search — the first makes it
  // give up on the first wrong region, the second makes it sweep every region
  // after already having found the right one.
  const wrongHost = /tenant\/user .* not found|ENOTFOUND/i.test(message);
  const badCredentials =
    !wrongHost &&
    /authentication failed against database server|password authentication failed/i.test(message);
  process.exit(badCredentials ? 2 : 1);
} finally {
  await prisma.$disconnect().catch(() => {});
}
