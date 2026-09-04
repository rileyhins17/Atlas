import { describe, expect, it, vi } from 'vitest';
import { PushService } from '../src/modules/push/push.service.js';
import { PushSubscriptionInput } from '@atlas/shared';

/**
 * A push subscription must never be silently repointed at another account.
 *
 * `subscribe` upserted on a globally-unique `endpoint` and the update branch
 * rebound `userId` — the only write in the codebase able to mutate a row
 * belonging to someone else. Submitting another user's endpoint took over their
 * device: their briefs stopped arriving and the attacker's arrived instead,
 * with no trace on either account.
 *
 * Rebinding itself is a real requirement — two people sharing one browser get
 * one endpoint from the push service — so the fix is not to forbid it. It is to
 * stop doing it as an in-place edit of a foreign row, to make it auditable, and
 * to refuse endpoints that did not come from a push service at all.
 */
function makeService() {
  const calls: { op: string; args: Record<string, unknown> }[] = [];
  const client = {
    pushSubscription: {
      findUnique: vi.fn(async ({ where }: { where: { endpoint: string } }) =>
        where.endpoint === 'https://fcm.googleapis.com/fcm/send/victim'
          ? { id: 'row-1', userId: 'victim', endpoint: where.endpoint }
          : null,
      ),
      deleteMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        calls.push({ op: 'deleteMany', args: where });
        return { count: 1 };
      }),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        calls.push({ op: 'create', args: data });
        return data;
      }),
      update: vi.fn(async ({ where, data }: { where: unknown; data: unknown }) => {
        calls.push({ op: 'update', args: { where, data } as Record<string, unknown> });
        return {};
      }),
      upsert: vi.fn(async (args: Record<string, unknown>) => {
        calls.push({ op: 'upsert', args });
        return {};
      }),
    },
  };
  const prisma = {
    client: { ...client, $transaction: vi.fn(async (ops: unknown) =>
      Array.isArray(ops) ? ops : (ops as (tx: unknown) => Promise<unknown>)(client),
    ) },
  };
  return { service: new PushService(prisma as never), calls, client };
}

const VICTIM = 'https://fcm.googleapis.com/fcm/send/victim';
const keys = { p256dh: 'p', auth: 'a' };

describe('push subscriptions', () => {
  it('never updates a row owned by someone else', async () => {
    const { service, calls } = makeService();
    await service.subscribe('attacker', { endpoint: VICTIM, keys });

    const foreignUpdate = calls.find(
      (c) => (c.op === 'update' || c.op === 'upsert') && JSON.stringify(c.args).includes('userId'),
    );
    // An in-place update keyed on endpoint alone is the exploit.
    expect(foreignUpdate, 'rebind must not be an in-place edit of a foreign row').toBeUndefined();
  });

  it('leaves the previous owner with no stale row', async () => {
    const { service, calls } = makeService();
    await service.subscribe('attacker', { endpoint: VICTIM, keys });
    const removed = calls.find((c) => c.op === 'deleteMany');
    expect(removed?.args).toMatchObject({ endpoint: VICTIM });
    const created = calls.find((c) => c.op === 'create');
    expect(created?.args).toMatchObject({ userId: 'attacker', endpoint: VICTIM });
  });

  /**
   * A delete that lands without its create leaves the device registered to
   * nobody — the previous owner unsubscribed and the new one never subscribed.
   */
  it('does the takeover atomically', async () => {
    const calls: string[] = [];
    const tx = {
      pushSubscription: {
        deleteMany: vi.fn(async () => { calls.push('deleteMany'); return { count: 1 }; }),
        create: vi.fn(async () => { calls.push('create'); return {}; }),
      },
    };
    const prisma = {
      client: {
        pushSubscription: { findUnique: vi.fn(async () => null) },
        $transaction: vi.fn(async (fn: (t: unknown) => Promise<unknown>) => {
          calls.push('tx:start');
          return fn(tx);
        }),
      },
    };
    const service = new PushService(prisma as never);
    await service.subscribe('u1', { endpoint: VICTIM, keys });
    expect(prisma.client.$transaction).toHaveBeenCalled();
    expect(calls).toEqual(['tx:start', 'deleteMany', 'create']);
  });
});

/**
 * The endpoint is submitted by the client, so it must look like something a
 * push service actually issued. `z.string().url()` accepted `http://attacker`
 * and any other absolute URL.
 */
describe('PushSubscriptionInput', () => {
  it('accepts a real push endpoint', () => {
    expect(PushSubscriptionInput.safeParse({ endpoint: VICTIM, keys }).success).toBe(true);
  });

  it('rejects a non-https endpoint', () => {
    const r = PushSubscriptionInput.safeParse({ endpoint: 'http://fcm.googleapis.com/x', keys });
    expect(r.success).toBe(false);
  });

  it('rejects an endpoint that is not a push service', () => {
    const r = PushSubscriptionInput.safeParse({ endpoint: 'https://attacker.example/collect', keys });
    expect(r.success).toBe(false);
  });

  it('bounds the length', () => {
    const r = PushSubscriptionInput.safeParse({
      endpoint: `https://fcm.googleapis.com/fcm/send/${'x'.repeat(5000)}`,
      keys,
    });
    expect(r.success).toBe(false);
  });
});
