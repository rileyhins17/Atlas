import { vi } from 'vitest';
import type { Prisma } from '@atlas/db';

/** Capture parameter mappings; the disposable pgvector CI check executes SQL. */
export function mockPlaidWrites() {
  const accounts: Array<Record<string, unknown>> = [];
  const transactions: Array<Record<string, unknown>> = [];
  const existingTransactions = new Set<string>();
  const query = vi.fn(async (sql: Prisma.Sql) => {
    const isAccount = sql.text.includes('INSERT INTO accounts');
    const fields = isAccount
      ? ['id', 'userId', 'name', 'type', 'currency', 'balanceMinor', 'source', 'externalId', 'mask', 'institution']
      : ['id', 'userId', 'accountId', 'amountMinor', 'currency', 'description', 'merchantName', 'category', 'postedAt', 'pending', 'source', 'externalId'];
    const result = [];
    for (let offset = 0; offset < sql.values.length; offset += fields.length) {
      const row = Object.fromEntries(fields.map((field, index) => [field, sql.values[offset + index]]));
      (isAccount ? accounts : transactions).push(row);
      const externalId = row.externalId as string;
      const id = isAccount ? `atlas-${externalId}` : existingTransactions.has(externalId) ? `existing-${externalId}` : row.id;
      if (!isAccount) existingTransactions.add(externalId);
      result.push({ id, externalId });
    }
    return result;
  });
  return { query, accounts, transactions, existingTransactions };
}
