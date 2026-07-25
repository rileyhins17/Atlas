import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, FitnessApi } from '@/lib/api';

/**
 * The shared `request()` helper, exercised through a real caller.
 *
 * The empty-body case is the one worth pinning: a Nest handler that returns
 * `null` responds 200/201 with NO body (not 204), so `res.json()` throws — and
 * the value has to surface as `null`, because TanStack Query rejects an
 * `undefined` query result outright and would render an error state where the
 * empty state belongs.
 */
function mockFetch(response: { status?: number; body?: string }) {
  const { status = 200, body = '' } = response;
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      statusText: 'x',
      text: () => Promise.resolve(body),
      json: () => (body ? Promise.resolve(JSON.parse(body)) : Promise.reject(new Error('no body'))),
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('request() body handling', () => {
  it('resolves an empty 200 body to null, not undefined', async () => {
    mockFetch({ status: 200, body: '' });
    await expect(FitnessApi.active()).resolves.toBeNull();
  });

  it('parses a normal JSON body', async () => {
    mockFetch({ status: 200, body: '{"id":"w1","title":"Push day"}' });
    await expect(FitnessApi.active()).resolves.toMatchObject({ id: 'w1', title: 'Push day' });
  });

  it('still throws ApiError on a failure status', async () => {
    mockFetch({ status: 404, body: '{"message":"Workout not found"}' });
    await expect(FitnessApi.active()).rejects.toBeInstanceOf(ApiError);
  });

  it('surfaces the server message from a failure body', async () => {
    mockFetch({ status: 400, body: '{"message":"That workout is already finished"}' });
    await expect(FitnessApi.active()).rejects.toThrow('That workout is already finished');
  });
});
