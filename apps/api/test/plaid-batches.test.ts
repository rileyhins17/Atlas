import { describe, expect, it, vi } from 'vitest';
import { PlaidSyncService } from '../src/modules/finance/plaid-sync.service.js';
import { mockPlaidWrites } from './helpers/plaid-writes.js';

export function batchFixture(count = 251) {
  const accounts = Array.from({ length: count }, (_, i) => ({
    account_id: `bank-${i}`, name: `Synthetic bank ${i}`, type: 'depository', subtype: 'checking',
    balances: { current: 10, iso_currency_code: 'CAD' },
  }));
  const added = accounts.map((account, i) => ({
    transaction_id: `txn-${i}`, account_id: account.account_id, amount: 12.34,
    name: `Synthetic transaction ${i}`, date: '2026-09-01', pending: false,
  }));
  const account = { upsert: vi.fn(async (arg) => ({ id: `atlas-${arg.create.externalId}` })) };
  const transaction = {
    findUnique: vi.fn(async () => null), create: vi.fn(async () => ({})),
    update: vi.fn(async () => ({})), deleteMany: vi.fn(async () => ({ count: 0 })),
  };
  const writes = mockPlaidWrites();
  const raw = writes.query;
  const credential = {
    findMany: vi.fn(async () => [{ id: 'credential', label: 'item', meta: {} }]),
    findUnique: vi.fn(async () => ({ meta: { cursor: 'old' } })),
  };
  const connector = {
    getAccounts: vi.fn(async () => ({ accounts })),
    syncTransactions: vi.fn(async () => ({ added, modified: [], removed: [], nextCursor: 'next' })),
  };
  const saveCredentialMeta = vi.fn(async () => {});
  const service = new PlaidSyncService(
    { client: { account, transaction, credential, $queryRaw: raw } } as never,
    { write: vi.fn(async () => {}) } as never,
    { plaid: connector, contextFor: () => ({}), saveCredentialMeta } as never,
  );
  return { service, account, transaction, raw, connector, saveCredentialMeta, accounts, added, writes };
}

describe('Plaid database batches', () => {
  it('does not perform one account upsert and two transaction calls per row', async () => {
    const { service, account, transaction, raw, writes } = batchFixture();
    expect(await service.sync('owner')).toMatchObject({ imported: 251, updated: 0, errors: [] });
    expect(account.upsert.mock.calls.length).toBe(0);
    expect(transaction.findUnique).not.toHaveBeenCalled();
    expect(transaction.create).not.toHaveBeenCalled();
    expect(raw).toHaveBeenCalledTimes(4); // 2 account pages + 2 transaction pages.
    expect(writes.transactions).toHaveLength(251);
    expect(writes.transactions[250]?.externalId).toBe('txn-250');
  });

  it('retains last-write-wins and imported/updated counts for repeated transaction ids', async () => {
    const { service, connector, added, writes } = batchFixture(1);
    connector.syncTransactions.mockResolvedValue({
      added, modified: [{ ...added[0]!, amount: 99, name: 'Final corrected amount' }],
      removed: [], nextCursor: 'next',
    } as never);
    expect(await service.sync('owner')).toMatchObject({ imported: 1, updated: 1, errors: [] });
    expect(writes.transactions).toHaveLength(1);
    expect(writes.transactions[0]).toMatchObject({ amountMinor: -9900n, description: 'Final corrected amount' });
  });

  it('holds the cursor if a database batch fails', async () => {
    const { service, raw, saveCredentialMeta } = batchFixture(1);
    const original = raw.getMockImplementation()!;
    raw.mockImplementation(async sql => {
      if (sql.text.includes('INSERT INTO transactions')) throw new Error('synthetic batch failure');
      return original(sql);
    });
    const result = await service.sync('owner');
    expect(result.errors.join(' ')).toContain('synthetic batch failure');
    expect(saveCredentialMeta).not.toHaveBeenCalled();
  });
});
