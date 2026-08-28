import { Injectable } from '@nestjs/common';

/**
 * Counts real API requests, so the background work can tell "nobody is using
 * Atlas" from "somebody is".
 *
 * WHY THIS EXISTS: a managed Postgres bills for the time its compute is awake,
 * and suspends itself after a few minutes with no queries. Two timers in this
 * API queried unconditionally — `/health` on every watchdog poll (every two
 * minutes, forever) and the embedding backfill every sixty seconds whether or
 * not anything was queued. Neither ever let the database go idle, so a single
 * personal account with three users kept a compute awake 24 hours a day and
 * burned a monthly quota in about a week. The database then refused every
 * query, including reads, and the whole product went down with it.
 *
 * The rule those two now follow: AN IDLE API MAKES NO DATABASE CALLS. Work that
 * only exists to serve user activity must be triggered by user activity.
 *
 * A counter, not a clock. Two events in the same millisecond are indistinguish-
 * able by timestamp, and the loser is a queued row that never gets embedded
 * because the sweep believes it already covered it.
 */
@Injectable()
export class ActivityService {
  private requests = 0;

  /** Called once per request that is not itself a liveness poll. */
  mark(): void {
    this.requests += 1;
  }

  /** Monotonic; the only meaningful operation on it is comparison. */
  get count(): number {
    return this.requests;
  }

  /** True when at least one request has arrived since `seen` was taken. */
  hasRequestsSince(seen: number): boolean {
    return this.requests !== seen;
  }
}
