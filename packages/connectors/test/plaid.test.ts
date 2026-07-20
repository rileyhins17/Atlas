import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PlaidApiError,
  PlaidConnector,
  mapPlaidAccountType,
  plaidAmountToMinor,
  plaidCurrency,
  type ConnectorContext,
} from '../src/index.js';

function makeConnector(env: 'sandbox' | 'production' = 'sandbox') {
  return new PlaidConnector({
    clientId: 'cid',
    secret: 'sec',
    env,
    countryCodes: ['US', 'CA'],
    products: ['transactions'],
  });
}

const ctx: ConnectorContext = {
  getSecret: async () => ({ accessToken: 'access-tok', itemId: 'item-1' }),
  saveSecret: async () => {},
};

/** Queue fetch responses in order. */
function mockFetch(responses: Array<{ ok?: boolean; status?: number; body: unknown }>) {
  const fn = vi.fn();
  for (const r of responses) {
    fn.mockResolvedValueOnce({
      ok: r.ok ?? true,
      status: r.status ?? 200,
      json: async () => r.body,
    });
  }
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('plaidAmountToMinor (sign convention)', () => {
  it('turns a Plaid debit (positive) into Atlas money-out (negative)', () => {
    expect(plaidAmountToMinor(12.34)).toBe(-1234);
  });
  it('turns a Plaid credit (negative) into Atlas money-in (positive)', () => {
    expect(plaidAmountToMinor(-50)).toBe(5000);
  });
  it('rounds to whole minor units without float drift', () => {
    expect(plaidAmountToMinor(0.1)).toBe(-10);
    expect(plaidAmountToMinor(19.99)).toBe(-1999);
  });
});

describe('mapPlaidAccountType', () => {
  it('maps depository subtypes', () => {
    expect(mapPlaidAccountType('depository', 'checking')).toBe('checking');
    expect(mapPlaidAccountType('depository', 'savings')).toBe('savings');
    expect(mapPlaidAccountType('depository', null)).toBe('checking');
  });
  it('maps credit and loan to credit, investment to investment', () => {
    expect(mapPlaidAccountType('credit', 'credit card')).toBe('credit');
    expect(mapPlaidAccountType('loan', 'student')).toBe('credit');
    expect(mapPlaidAccountType('investment', 'brokerage')).toBe('investment');
  });
  it('falls back to cash for unknown types', () => {
    expect(mapPlaidAccountType('other', null)).toBe('cash');
  });
});

describe('plaidCurrency', () => {
  it('prefers ISO, falls back to unofficial, then USD', () => {
    expect(plaidCurrency({ iso_currency_code: 'CAD' })).toBe('CAD');
    expect(plaidCurrency({ unofficial_currency_code: 'BTC' })).toBe('BTC');
    expect(plaidCurrency({})).toBe('USD');
  });
});

describe('PlaidConnector.exchangePublicToken', () => {
  it('returns the access token + item id', async () => {
    mockFetch([{ body: { access_token: 'tok', item_id: 'item-9' } }]);
    const cred = await makeConnector().exchangePublicToken('public-tok');
    expect(cred).toEqual({ accessToken: 'tok', itemId: 'item-9' });
  });
});

describe('PlaidConnector.syncTransactions', () => {
  it('walks every page and returns the final cursor', async () => {
    const fetchFn = mockFetch([
      {
        body: {
          added: [{ transaction_id: 't1', account_id: 'a1', amount: 5, name: 'A', date: '2026-07-18', pending: false }],
          modified: [],
          removed: [],
          next_cursor: 'cur1',
          has_more: true,
        },
      },
      {
        body: {
          added: [{ transaction_id: 't2', account_id: 'a1', amount: 6, name: 'B', date: '2026-07-19', pending: false }],
          modified: [],
          removed: [{ transaction_id: 'gone' }],
          next_cursor: 'cur2',
          has_more: false,
        },
      },
    ]);

    const res = await makeConnector().syncTransactions(ctx);
    expect(res.added.map((t) => t.transaction_id)).toEqual(['t1', 't2']);
    expect(res.removed).toEqual(['gone']);
    expect(res.nextCursor).toBe('cur2');

    // Second call must carry the cursor returned by the first page.
    const secondBody = JSON.parse((fetchFn.mock.calls[1]![1] as { body: string }).body);
    expect(secondBody.cursor).toBe('cur1');
  });

  it('starts from a provided cursor', async () => {
    const fetchFn = mockFetch([
      { body: { added: [], modified: [], removed: [], next_cursor: 'z', has_more: false } },
    ]);
    await makeConnector().syncTransactions(ctx, 'start-cursor');
    const firstBody = JSON.parse((fetchFn.mock.calls[0]![1] as { body: string }).body);
    expect(firstBody.cursor).toBe('start-cursor');
  });
});

describe('PlaidConnector error handling', () => {
  it('throws a typed PlaidApiError carrying error_code', async () => {
    mockFetch([{ ok: false, status: 400, body: { error_code: 'PRODUCT_NOT_READY', error_message: 'not ready' } }]);
    const err = await makeConnector().getAccounts(ctx).catch((e) => e);
    expect(err).toBeInstanceOf(PlaidApiError);
    expect(err.errorCode).toBe('PRODUCT_NOT_READY');
    expect(err.status).toBe(400);
  });
});

describe('PlaidConnector.sandboxCreatePublicToken', () => {
  it('is refused outside the sandbox', async () => {
    await expect(makeConnector('production').sandboxCreatePublicToken()).rejects.toThrow(/sandbox/i);
  });
  it('returns a public token in sandbox', async () => {
    mockFetch([{ body: { public_token: 'public-sandbox-tok' } }]);
    expect(await makeConnector('sandbox').sandboxCreatePublicToken()).toBe('public-sandbox-tok');
  });
});
