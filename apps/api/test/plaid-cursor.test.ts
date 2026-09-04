import { describe, expect, it, vi } from 'vitest';
import { PlaidSyncService } from '../src/modules/finance/plaid-sync.service.js';

/**
 * A Plaid cursor must never advance past a transaction that was not written.
 *
 * `syncTransactions` returns a page plus a `nextCursor`, and the cursor is the
 * only record of what has been seen. A transaction whose account was not in
 * `acctMap` was skipped with a bare `continue` — no row, no error, nothing in
 * `result.errors` — and the cursor was then saved anyway. Plaid never sends that
 * transaction again, so the user's ledger is permanently and silently short by
 * however much was in it.
 *
 * That happens for real: a newly-opened account, an account Plaid returns after
 * the accounts call has already been made, or any transient failure in step 1.
 * The money is the whole point of the feature, so a gap in it cannot be quiet.
 */
/** A Plaid transaction with the fields the reconciler actually reads. */
const txn = (id: string, accountId: string) => ({
  transaction_id: id,
  account_id: accountId,
  amount: 12.34,
  name: 'Coffee',
  merchant_name: null,
  category: ['Food and Drink'],
  date: '2026-09-01',
  pending: false,
  iso_currency_code: 'CAD',
});

function makeService(opts: {
  accounts: Record<string, unknown>[];
  added: ReturnType<typeof txn>[];
}) {
  const saved: Record<string, unknown>[] = [];
  const connector = {
    getAccounts: vi.fn(async () => ({ accounts: opts.accounts, institutionId: null })),
    getInstitutionName: vi.fn(async () => 'Test Bank'),
    syncTransactions: vi.fn(async () => ({
      added: opts.added,
      modified: [],
      removed: [],
      nextCursor: 'cursor-2',
    })),
  };
  const prisma = {
    client: {
      credential: {
        findMany: vi.fn(async () => [{ label: 'item-1', meta: { cursor: 'cursor-1' } }]),
        findUnique: vi.fn(async () => ({ meta: { cursor: 'cursor-1' } })),
      },
      account: {
        upsert: vi.fn(async () => ({ id: 'atlas-acc-known' })),
      },
      transaction: {
        findUnique: vi.fn(async () => null),
        create: vi.fn(async () => ({})),
        update: vi.fn(async () => ({})),
        deleteMany: vi.fn(async () => ({ count: 0 })),
      },
    },
  };
  const connectors = {
    plaid: connector,
    contextFor: vi.fn(() => ({})),
    saveCredentialMeta: vi.fn(async (_u: string, _c: string, meta: Record<string, unknown>) => {
      saved.push(meta);
    }),
  };
  const timeline = { write: vi.fn(async () => {}) };
  const service = new PlaidSyncService(
    prisma as never,
    timeline as never,
    connectors as never,
  );
  return { service, saved, connectors };
}

const ACCOUNTS = [
  {
    account_id: 'acc-known',
    name: 'Chequing',
    official_name: null,
    type: 'depository',
    subtype: 'checking',
    mask: '1234',
    balances: { current: 100, available: 100, iso_currency_code: 'CAD' },
  },
];

describe('Plaid sync cursor', () => {
  it('advances the cursor when everything was written', async () => {
    const { service, saved } = makeService({
      accounts: ACCOUNTS,
      added: [txn('t1', 'acc-known')],
    });
    await service.sync('u1');
    expect(saved.some((m) => m.cursor === 'cursor-2')).toBe(true);
  });

  /** The core assertion: a dropped transaction must not be forgotten. */
  it('does NOT advance the cursor when a transaction was dropped', async () => {
    const { service, saved } = makeService({
      accounts: ACCOUNTS,
      added: [txn('t1', 'acc-known'), txn('t2', 'acc-MISSING')],
    });
    await service.sync('u1');
    expect(
      saved.some((m) => m.cursor === 'cursor-2'),
      'cursor advanced past a transaction that was never stored',
    ).toBe(false);
  });

  it('reports the drop instead of swallowing it', async () => {
    const { service } = makeService({
      accounts: ACCOUNTS,
      added: [txn('t2', 'acc-MISSING')],
    });
    const result = await service.sync('u1');
    expect(result.errors.join(' ')).toMatch(/acc-MISSING|unknown account|skipped/i);
  });
});
