import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('@/lib/api', () => ({ PushApi: { unsubscribe: vi.fn() } }));
import { PushApi } from '@/lib/api';
import { disablePush } from '@/lib/push';
const unsubscribe = vi.fn();
const getSubscription = vi.fn();
const sub = { endpoint: 'https://push.example.test/synthetic', unsubscribe };
beforeEach(() => {
  vi.stubGlobal('PushManager', class {});
  vi.stubGlobal('Notification', class {});
  vi.stubGlobal('navigator', { serviceWorker: { getRegistration: vi.fn().mockResolvedValue({ pushManager: { getSubscription } }) } });
  getSubscription.mockReset().mockResolvedValue(sub);
  unsubscribe.mockReset().mockResolvedValue(true);
  vi.mocked(PushApi.unsubscribe).mockReset().mockResolvedValue({ ok: true });
});
afterEach(() => { vi.unstubAllGlobals(); });
it('does not announce disabled when the server rejects removal', async () => {
  const error = new Error('Synthetic server failure');
  vi.mocked(PushApi.unsubscribe).mockRejectedValueOnce(error);
  await expect(disablePush()).rejects.toBe(error);
  expect(unsubscribe).not.toHaveBeenCalled();
});
it('keeps a browser removal failure visible and permits retry', async () => {
  const error = new Error('Synthetic browser failure');
  unsubscribe.mockRejectedValueOnce(error);
  await expect(disablePush()).rejects.toBe(error);
  await expect(disablePush()).resolves.toBe('disabled');
  expect(PushApi.unsubscribe).toHaveBeenCalledTimes(2);
});
it('accepts an already-deactivated browser subscription', async () => {
  unsubscribe.mockResolvedValue(false);
  await expect(disablePush()).resolves.toBe('disabled');
  expect(PushApi.unsubscribe).toHaveBeenCalledWith(sub.endpoint);
});
it('does not issue a removal request when no browser subscription exists', async () => {
  getSubscription.mockResolvedValue(null);
  await expect(disablePush()).resolves.toBe('disabled');
  expect(PushApi.unsubscribe).not.toHaveBeenCalled();
});
