import { describe, expect, it, vi } from 'vitest';
import { AuthService } from '../src/auth/auth.service.js';

/**
 * Expired sessions used to accumulate forever: `logout` removes the one token it
 * is handed, and `remember` defaults to true so the common path never calls it.
 * The rows are dead weight — `userFromToken` rejects anything past `expiresAt`,
 * so they can never authenticate — but they still cost index and table space.
 *
 * The condition is the whole point of the test. `lt: now` and `lte: now` look
 * identical until you consider the row that expires this instant, and a sweep
 * written as `gt` would delete every LIVE session and sign the whole product
 * out — a one-character mistake with no visible symptom until users complain.
 */
function makeService(deleteMany = vi.fn().mockResolvedValue({ count: 0 })) {
  const client = { session: { deleteMany } };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { service: new AuthService({ client } as any), deleteMany };
}

describe('purgeExpiredSessions', () => {
  it('deletes only sessions whose expiry is already past', async () => {
    const { service, deleteMany } = makeService();
    const before = Date.now();
    await service.purgeExpiredSessions();
    const after = Date.now();

    expect(deleteMany).toHaveBeenCalledTimes(1);
    const where = deleteMany.mock.calls[0]![0]!.where as { expiresAt: { lt: Date } };
    // Strictly "already expired", never a range that could include live rows.
    expect(Object.keys(where.expiresAt)).toEqual(['lt']);
    const cutoff = where.expiresAt.lt.getTime();
    expect(cutoff).toBeGreaterThanOrEqual(before);
    expect(cutoff).toBeLessThanOrEqual(after);
  });

  it('does not run twice at once', async () => {
    let release!: () => void;
    const gate = new Promise<{ count: number }>((res) => {
      release = () => res({ count: 1 });
    });
    const { service, deleteMany } = makeService(vi.fn().mockReturnValue(gate));

    const first = service.purgeExpiredSessions();
    await service.purgeExpiredSessions(); // must be a no-op while the first is in flight
    expect(deleteMany).toHaveBeenCalledTimes(1);

    release();
    await first;

    // …and the guard reopens, so the next scheduled sweep still runs.
    await service.purgeExpiredSessions();
    expect(deleteMany).toHaveBeenCalledTimes(2);
  });

  it('survives a database error so the API stays up', async () => {
    const { service } = makeService(vi.fn().mockRejectedValue(new Error('connection lost')));
    await expect(service.purgeExpiredSessions()).resolves.toBeUndefined();
    // The guard must have reopened, or one failure would stop every later sweep.
    await expect(service.purgeExpiredSessions()).resolves.toBeUndefined();
  });
});
