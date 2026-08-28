import { describe, expect, it, vi } from 'vitest';
import { CONNECT_ATTEMPTS, backoffMs, connectWithRetry } from '../src/core/connect-retry.js';

/**
 * The failure this guards against is not subtle, but it is invisible from
 * outside: a rejected `$connect()` in `onModuleInit` exits the process, so
 * nothing listens on the API port and Caddy 502s every `/api/*` route. Sign-in
 * and sign-up are pure API calls, so the entire product becomes unusable while
 * the landing page and every client route still render — the site looks up.
 *
 * A momentary database hiccup must therefore not be fatal, and "unreachable
 * for good" must still leave the process alive to say so.
 */
const noSleep = () => Promise.resolve();

describe('connectWithRetry', () => {
  it('returns true without waiting when the first attempt works', async () => {
    const connect = vi.fn().mockResolvedValue(undefined);
    const sleep = vi.fn(noSleep);
    await expect(connectWithRetry({ connect, sleep })).resolves.toBe(true);
    expect(connect).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('rides out a database that is merely slow to wake', async () => {
    // Neon suspends when idle. A cold start is seconds, which is exactly the
    // window in which the old code gave up permanently.
    const connect = vi
      .fn()
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockResolvedValue(undefined);
    await expect(connectWithRetry({ connect, sleep: noSleep })).resolves.toBe(true);
    expect(connect).toHaveBeenCalledTimes(3);
  });

  it('gives up by RETURNING false, never by throwing', async () => {
    // The caller boots either way. Throwing here is what killed the process.
    const connect = vi.fn().mockRejectedValue(new Error('down'));
    const onGiveUp = vi.fn();
    await expect(
      connectWithRetry({ connect, sleep: noSleep, attempts: 3, onGiveUp }),
    ).resolves.toBe(false);
    expect(connect).toHaveBeenCalledTimes(3);
    expect(onGiveUp).toHaveBeenCalledTimes(1);
  });

  it('does not sleep after the final attempt', async () => {
    // A trailing wait delays the "starting degraded" log for no reason.
    const connect = vi.fn().mockRejectedValue(new Error('down'));
    const sleep = vi.fn(noSleep);
    await connectWithRetry({ connect, sleep, attempts: 3 });
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it('backs off exponentially and then caps', () => {
    expect(backoffMs(1)).toBe(500);
    expect(backoffMs(2)).toBe(1000);
    expect(backoffMs(3)).toBe(2000);
    // Capped, so attempt 10 is not a four-hour wait.
    expect(backoffMs(9)).toBe(15_000);
    expect(backoffMs(50)).toBe(15_000);
  });

  it('waits long enough to be worth having', () => {
    // The whole point is surviving a cold start; a budget of a few seconds
    // would fail in exactly the case this was written for.
    let total = 0;
    for (let i = 1; i < CONNECT_ATTEMPTS; i++) total += backoffMs(i);
    expect(total).toBeGreaterThan(30_000);
  });
});
