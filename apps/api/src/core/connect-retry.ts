/**
 * Boot-time database connect, with backoff.
 *
 * WHY THIS EXISTS: `onModuleInit` used to call `$connect()` once and let it
 * throw. A rejected module init rejects `NestFactory.create`, which rejects
 * `bootstrap()`, which exits the process — so nothing ever listens on the API
 * port. Caddy then 502s **every** `/api/*` route, and because sign-in and
 * sign-up are pure API calls, the whole product is unreachable while the
 * landing page and every client route still load perfectly. The site looks up.
 *
 * That turned any momentary database hiccup — a Neon cold start, a suspended
 * instance waking, a few dropped packets — into a permanent outage needing a
 * human. The watchdog restarts the API, the database is still waking, it dies
 * again, and the loop holds indefinitely.
 *
 * Split out as a pure function so the backoff is testable without a clock.
 */

/** ~45 seconds of trying, which covers a cold start with room to spare. */
export const CONNECT_ATTEMPTS = 8;
const BASE_DELAY_MS = 500;
const MAX_DELAY_MS = 15_000;

/** Exponential, capped. Attempt 1 has already failed when this is asked for. */
export function backoffMs(attempt: number): number {
  return Math.min(BASE_DELAY_MS * 2 ** (attempt - 1), MAX_DELAY_MS);
}

export interface ConnectRetryOptions {
  connect: () => Promise<void>;
  sleep: (ms: number) => Promise<void>;
  /** Called after each failure that will be retried. */
  onRetry?: (attempt: number, delayMs: number, err: unknown) => void;
  /** Called once when every attempt has failed. */
  onGiveUp?: (attempts: number, err: unknown) => void;
  attempts?: number;
}

/**
 * Try to connect, backing off between attempts.
 *
 * Resolves `true` on success and `false` when every attempt failed — it does
 * NOT throw. Refusing to throw is the point: the caller boots either way, so a
 * database that is unreachable right now degrades the data routes instead of
 * taking down the origin. `/health` is what reports which of the two it is.
 */
export async function connectWithRetry({
  connect,
  sleep,
  onRetry,
  onGiveUp,
  attempts = CONNECT_ATTEMPTS,
}: ConnectRetryOptions): Promise<boolean> {
  let last: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      await connect();
      return true;
    } catch (err) {
      last = err;
      if (attempt === attempts) break;
      const delay = backoffMs(attempt);
      onRetry?.(attempt, delay, err);
      await sleep(delay);
    }
  }
  onGiveUp?.(attempts, last);
  return false;
}
