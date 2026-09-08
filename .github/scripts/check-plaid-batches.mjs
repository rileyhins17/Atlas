import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const testUrl = 'postgresql://atlas:atlas@localhost:5432/atlas_test';
assert.equal(process.env.CI, 'true', 'Plaid database check is CI-only');
assert.equal(process.env.DATABASE_URL, testUrl, 'Requires disposable CI database');
assert.equal(process.env.DIRECT_DATABASE_URL, testUrl, 'Requires disposable CI direct URL');
const { PrismaClient } = await import('../../packages/db/dist/index.js');
const { PlaidSyncService } = await import('../../apps/api/dist/modules/finance/plaid-sync.service.js');
const db = new PrismaClient({ datasourceUrl: testUrl });
const suffix = randomUUID();
const owner = `plaid-ci-${suffix}`;
const other = `plaid-other-${suffix}`;
const accounts = Array.from({ length: 251 }, (_, i) => ({
  account_id: `bank-${i}`, name: `Synthetic account ${i}`, type: 'depository', subtype: 'checking',
  mask: '1234', balances: { current: 100.50, iso_currency_code: 'CAD' },
}));
const added = accounts.map((a, i) => ({
  transaction_id: `txn-${i}`, account_id: a.account_id, amount: 12.34,
  name: `Synthetic transaction ${i}`, merchant_name: 'Synthetic merchant', category: ['Synthetic'],
  date: '2026-09-01', pending: false, iso_currency_code: 'CAD',
}));
let page = { added, modified: [], removed: [], nextCursor: 'next' };
let writes = 0;
const saved = [];
const service = new PlaidSyncService({ client: {
  credential: {
    findMany: async () => [{ id: 'synthetic-credential', label: 'synthetic-item', meta: {} }],
    findUnique: async () => ({ meta: { cursor: 'old' } }),
  },
  transaction: db.transaction,
  $queryRaw: async query => { writes++; return db.$queryRaw(query); },
} }, { write: async () => {} }, {
  plaid: { getAccounts: async () => ({ accounts }), syncTransactions: async () => page },
  contextFor: () => ({}), saveCredentialMeta: async (_owner, _connector, meta) => { saved.push(meta); },
});

try {
  await db.user.createMany({ data: [owner, other].map(id => ({
    id, email: `${id}@example.invalid`, passwordHash: 'synthetic-no-login',
  })) });
  const foreignAccount = await db.account.create({ data: {
    userId: other, source: 'plaid', externalId: 'bank-0', name: 'Other owner', balanceMinor: 777n,
  } });
  const foreignTxn = await db.transaction.create({ data: {
    userId: other, accountId: foreignAccount.id, source: 'plaid', externalId: 'txn-0',
    amountMinor: 888n, description: 'Other owner', postedAt: new Date('2026-09-01'),
  } });
  const first = await service.sync(owner);
  assert.deepEqual({ imported: first.imported, updated: first.updated, errors: first.errors },
    { imported: 251, updated: 0, errors: [] });
  assert.equal(writes, 4);
  assert.equal(await db.account.count({ where: { userId: owner } }), 251);
  assert.equal(await db.transaction.count({ where: { userId: owner } }), 251);
  const firstRow = await db.transaction.findUniqueOrThrow({
    where: { userId_source_externalId: { userId: owner, source: 'plaid', externalId: 'txn-0' } },
  });
  assert.equal(firstRow.amountMinor, -1234n);
  assert.equal(firstRow.currency, 'CAD');
  assert.equal(firstRow.merchantName, 'Synthetic merchant');
  assert.equal(firstRow.category, 'Synthetic');
  const ownedAccount = await db.account.findUniqueOrThrow({ where: { id: firstRow.accountId, userId: owner } });
  assert.equal(ownedAccount.balanceMinor, 10050n);
  assert.equal(ownedAccount.type, 'checking');
  assert.equal(ownedAccount.mask, '1234');

  // A replay containing both added and modified must update, keep ids and
  // createdAt, and retain the last version without duplicate conflict keys.
  page = { added, modified: [{ ...added[0], amount: 99, pending: true }], removed: [], nextCursor: 'replayed' };
  const second = await service.sync(owner);
  assert.equal(second.imported, 0);
  assert.equal(second.updated, 252);
  assert.deepEqual(second.errors, []);
  assert.equal(writes, 8);
  const changed = await db.transaction.findUniqueOrThrow({ where: { id: firstRow.id, userId: owner } });
  assert.equal(changed.amountMinor, -9900n);
  assert.equal(changed.pending, true);
  assert.equal(changed.createdAt.getTime(), firstRow.createdAt.getTime());
  assert.equal((await db.account.findUniqueOrThrow({ where: { id: foreignAccount.id, userId: other } })).balanceMinor, 777n);
  assert.equal((await db.transaction.findUniqueOrThrow({ where: { id: foreignTxn.id, userId: other } })).amountMinor, 888n);

  page = { added: [{ ...added[0], transaction_id: 'unknown-txn', account_id: 'missing-account' }], modified: [], removed: [], nextCursor: 'must-not-advance' };
  const dropped = await service.sync(owner);
  assert.match(dropped.errors.join(' '), /unknown account/);
  assert.ok(saved.every(meta => meta.cursor !== 'must-not-advance'));
  assert.equal(await db.transaction.count({ where: { userId: owner } }), 251);
  process.stdout.write('Plaid batches verified: 251 accounts + 251 transactions in 4 statements; replay, duplicate ids, tenant isolation and cursor hold passed.\n');
} finally {
  // Rows belong exclusively to this disposable container; no row deletion.
  await db.$disconnect();
}
