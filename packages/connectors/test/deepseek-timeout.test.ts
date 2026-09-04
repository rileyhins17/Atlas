import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DeepSeekConnector } from '../src/deepseek.js';
import type { ConnectorContext } from '../src/connector.js';

/**
 * Model calls must be able to give up.
 *
 * There was no timeout anywhere. `chat` accepted a `signal` and no production
 * caller ever passed one, so a hung DeepSeek connection held the HTTP request
 * open for as long as Node's defaults allowed — multiplied by up to six
 * tool-loop iterations, with a user watching a spinner the whole time and no
 * way for the app to decide its own failure.
 */
const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

const ctx: ConnectorContext = {
  getSecret: async () => ({ apiKey: 'sk-test' }),
  saveSecret: async () => {},
};

const reply = {
  ok: true,
  status: 200,
  json: async () => ({ choices: [{ message: { content: 'hi' } }] }),
  text: async () => '',
};

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(reply);
});

const chat = (signal?: AbortSignal) =>
  new DeepSeekConnector().chat(ctx, [{ role: 'user', content: 'hi' }], {
    model: 'deepseek-v4-flash',
    ...(signal ? { signal } : {}),
  });

describe('DeepSeek request timeout', () => {
  it('sends an abort signal even when the caller gives none', async () => {
    await chat();
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.signal, 'a request with no signal can hang forever').toBeInstanceOf(AbortSignal);
    expect(init.signal?.aborted).toBe(false);
  });

  /** An abandoned request must not sit waiting out the full timeout. */
  it("honours the caller's own signal as well", async () => {
    const controller = new AbortController();
    await chat(controller.signal);
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    controller.abort();
    expect(init.signal?.aborted, 'the caller must still be able to cancel').toBe(true);
  });

  it('does not abort a request that answers promptly', async () => {
    await chat();
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.signal?.aborted).toBe(false);
  });
});
