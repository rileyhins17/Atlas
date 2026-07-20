import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the whole web-push module: setVapidDetails is a no-op (skips key
// validation) and sendNotification is a spy we drive per test.
vi.mock('web-push', () => ({
  default: { setVapidDetails: vi.fn(), sendNotification: vi.fn() },
}));
import webpush from 'web-push';
import { PushService } from '../src/modules/push/push.service.js';

// Make the service consider itself configured (presence check only; the mocked
// setVapidDetails doesn't validate the values).
process.env.VAPID_PUBLIC_KEY ??= 'test-public';
process.env.VAPID_PRIVATE_KEY ??= 'test-private';

type Sub = { id: string; endpoint: string; p256dh: string; auth: string };

function makeService(subs: Sub[]) {
  const pushSubscription = {
    findMany: vi.fn().mockResolvedValue(subs),
    delete: vi.fn().mockResolvedValue({}),
  };
  const prisma = { client: { pushSubscription } };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = new PushService(prisma as any);
  return { service, pushSubscription };
}

beforeEach(() => vi.mocked(webpush.sendNotification).mockReset());

describe('PushService.sendToUser', () => {
  it('delivers to every subscription and returns the count', async () => {
    vi.mocked(webpush.sendNotification).mockResolvedValue(undefined as never);
    const { service } = makeService([
      { id: 's1', endpoint: 'https://push/e1', p256dh: 'p1', auth: 'a1' },
      { id: 's2', endpoint: 'https://push/e2', p256dh: 'p2', auth: 'a2' },
    ]);

    const sent = await service.sendToUser('u1', { title: 'Brief', body: 'Hello', url: '/today' });

    expect(sent).toBe(2);
    expect(webpush.sendNotification).toHaveBeenCalledTimes(2);
    const [sub, payload] = vi.mocked(webpush.sendNotification).mock.calls[0]!;
    expect(sub).toMatchObject({ endpoint: 'https://push/e1', keys: { p256dh: 'p1', auth: 'a1' } });
    expect(JSON.parse(payload as string)).toMatchObject({ title: 'Brief', body: 'Hello', url: '/today' });
  });

  it('prunes a subscription that returns 410 Gone', async () => {
    vi.mocked(webpush.sendNotification)
      .mockResolvedValueOnce(undefined as never)
      .mockRejectedValueOnce(Object.assign(new Error('gone'), { statusCode: 410 }));
    const { service, pushSubscription } = makeService([
      { id: 's1', endpoint: 'https://push/e1', p256dh: 'p1', auth: 'a1' },
      { id: 's2', endpoint: 'https://push/e2', p256dh: 'p2', auth: 'a2' },
    ]);

    const sent = await service.sendToUser('u1', { title: 'T', body: 'B' });

    expect(sent).toBe(1);
    expect(pushSubscription.delete).toHaveBeenCalledWith({ where: { id: 's2' } });
  });
});
