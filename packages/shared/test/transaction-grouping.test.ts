import { describe, expect, it } from 'vitest';
import type { TransactionDTO } from '../src/index.js';
import { groupTransactionsByDay } from '../src/domain-grouping.js';

const txn = (id: string, day: number, hour: number): TransactionDTO => ({
  id, accountId: 'synthetic-account', amountMinor: -100, currency: 'CAD',
  description: 'Synthetic purchase', category: null, merchantName: null,
  postedAt: new Date(2026, 6, day, hour).toISOString(), pending: false,
  source: 'manual', createdAt: new Date(2026, 6, day, hour).toISOString(),
});

describe('transaction day grouping', () => {
  it('orders days and transactions newest first without reordering the input', () => {
    const input = [txn('older', 17, 12), txn('morning', 18, 9), txn('evening', 18, 18)];
    const grouped = groupTransactionsByDay(input);
    expect(grouped.map(([day, rows]) => [day, rows.map(row => row.id)])).toEqual([
      ['2026-07-18', ['evening', 'morning']], ['2026-07-17', ['older']],
    ]);
    expect(input.map(row => row.id)).toEqual(['older', 'morning', 'evening']);
  });

  it('returns no groups for an empty ledger', () => {
    expect(groupTransactionsByDay([])).toEqual([]);
  });
});
