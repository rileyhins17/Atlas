import { describe, expect, it, vi } from 'vitest';
import { PlaidApiError } from '@atlas/connectors';
import { PlaidSyncService } from '../src/modules/finance/plaid-sync.service.js';

function makeService() {
  const account = { upsert: vi.fn().mockResolvedValue({ id: 'atlas-a1' }) };
  const transaction = {
    findUnique: vi.fn(),
    update: vi.fn().mockResolvedValue({}),
    create: vi.fn().mockResolvedValue({}),
    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
  };
  const credential = {
    findUnique: vi.fn().mockResolvedValue({ meta: { cursor: 'c0' } }),
    findMany: vi.fn(),
    count: vi.fn(),
    deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
  };
  const prisma = { client: { account, transaction, credential } };
  const timeline = { write: vi.fn().mockResolvedValue(undefined) };
  const connector = {
    getAccounts: vi.fn(),
    syncTransactions: vi.fn(),
    removeItem: vi.fn().mockResolvedValue(undefined),
  };
  const connectors = {
    plaid: connector,
    contextFor: vi.fn().mockReturnValue({ getSecret: vi.fn(), saveSecret: vi.fn() }),
    saveCredential: vi.fn().mockResolvedValue(undefined),
    saveCredentialMeta: vi.fn().mockResolvedValue(undefined),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = new PlaidSyncService(prisma as any, timeline as any, connectors as any);
  return { service, account, transaction, credential, timeline, connector, connectors };
}

const oneItem = [{ label: 'item-1', meta: { institution: 'Bank', cursor: 'c0' }, createdAt: new Date() }];

function accountsResult() {
  return {
    accounts: [
      {
        account_id: 'a1',
        name: 'Checking',
        official_name: null,
        type: 'depository',
        subtype: 'checking',
        mask: '1234',
        balances: { current: 100.5, iso_currency_code: 'USD' },
      },
    ],
    itemId: 'item-1',
    institutionId: 'ins',
  };
}

describe('PlaidSyncService.sync', () => {
  it('imports new transactions with the correct sign, deletes removed, and persists the cursor', async () => {
    const { service, account, transaction, credential, timeline, connector, connectors } = makeService();
    credential.findMany.mockResolvedValue(oneItem);
    connector.getAccounts.mockResolvedValue(accountsResult());
    transaction.findUnique.mockResolvedValue(null); // new txn
    transaction.deleteMany.mockResolvedValue({ count: 1 });
    connector.syncTransactions.mockResolvedValue({
      added: [
        {
          transaction_id: 't1',
          account_id: 'a1',
          amount: 12.34, // Plaid positive = money out
          name: 'Coffee',
          merchant_name: 'Cafe',
          category: ['Food'],
          date: '2026-07-18',
          pending: false,
          iso_currency_code: 'USD',
        },
      ],
      modified: [],
      removed: ['tGone'],
      nextCursor: 'c1',
    });

    const res = await service.sync('user-1');

    expect(res).toMatchObject({ imported: 1, updated: 0, deleted: 1, errors: [] });

    // Account upsert: balance in minor units, mapped type, institution carried through.
    expect(account.upsert).toHaveBeenCalledTimes(1);
    const upsertArg = account.upsert.mock.calls[0]![0];
    expect(upsertArg.create.balanceMinor).toBe(BigInt(10050));
    expect(upsertArg.create.type).toBe('checking');
    expect(upsertArg.create.institution).toBe('Bank');
    expect(upsertArg.create.mask).toBe('1234');

    // Transaction create: sign inverted (money out → negative), mapped fields.
    const createArg = transaction.create.mock.calls[0]![0];
    expect(createArg.data.amountMinor).toBe(BigInt(-1234));
    expect(createArg.data.source).toBe('plaid');
    expect(createArg.data.externalId).toBe('t1');
    expect(createArg.data.accountId).toBe('atlas-a1');
    expect(createArg.data.merchantName).toBe('Cafe');
    expect(createArg.data.category).toBe('Food');

    // Removed transaction deleted by external id.
    expect(transaction.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ externalId: 'tGone', source: 'plaid' }) }),
    );

    // Cursor from the stored meta was used, and the new cursor persisted for item-1.
    expect(connector.syncTransactions).toHaveBeenCalledWith(expect.anything(), 'c0');
    expect(connectors.saveCredentialMeta).toHaveBeenCalledWith(
      'user-1',
      'plaid',
      expect.objectContaining({ cursor: 'c1' }),
      'item-1',
    );
    expect(timeline.write).toHaveBeenCalledWith(expect.objectContaining({ type: 'finance.synced' }));
  });

  it('updates an existing transaction instead of importing it', async () => {
    const { service, transaction, credential, connector } = makeService();
    credential.findMany.mockResolvedValue(oneItem);
    connector.getAccounts.mockResolvedValue(accountsResult());
    transaction.findUnique.mockResolvedValue({ id: 'existing-1' }); // already present
    connector.syncTransactions.mockResolvedValue({
      added: [],
      modified: [
        { transaction_id: 't1', account_id: 'a1', amount: 9, name: 'X', date: '2026-07-18', pending: true },
      ],
      removed: [],
      nextCursor: 'c1',
    });

    const res = await service.sync('user-1');
    expect(res).toMatchObject({ imported: 0, updated: 1 });
    expect(transaction.update).toHaveBeenCalledTimes(1);
    expect(transaction.create).not.toHaveBeenCalled();
  });

  it('aggregates across multiple linked banks', async () => {
    const { service, connector, credential } = makeService();
    credential.findMany.mockResolvedValue([
      { label: 'item-1', meta: { cursor: 'c0' }, createdAt: new Date() },
      { label: 'item-2', meta: { cursor: 'c0' }, createdAt: new Date() },
    ]);
    connector.getAccounts.mockResolvedValue(accountsResult());
    connector.syncTransactions.mockResolvedValue({ added: [], modified: [], removed: [], nextCursor: 'c1' });

    await service.sync('user-1');
    expect(connector.getAccounts).toHaveBeenCalledTimes(2);
    expect(connector.syncTransactions).toHaveBeenCalledTimes(2);
  });

  it('handles a not-ready item gracefully (no throw)', async () => {
    const { service, connector, credential } = makeService();
    credential.findMany.mockResolvedValue(oneItem);
    connector.getAccounts.mockResolvedValue(accountsResult());
    connector.syncTransactions.mockRejectedValue(new PlaidApiError('not ready', 'PRODUCT_NOT_READY', 400));

    const res = await service.sync('user-1');
    expect(res.errors.join(' ')).toMatch(/not ready/i);
    expect(res.imported).toBe(0);
  });
});
