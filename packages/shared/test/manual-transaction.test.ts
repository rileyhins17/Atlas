import { expect, it } from 'vitest';
import { manualTransactionInput } from '../src/money.js';
import { localDayKey } from '../src/local-dates.js';
import type { AccountDTO } from '../src/dto/finance.js';
const account = { id: 'cash', currency: 'CAD' } as AccountDTO;
const draft = { amount: '18.29', direction: 'expense' as const, description: ' Groceries ', date: '2026-09-08' };

it('keeps exact cents, direction, account currency and the entered calendar day', () => {
  const expense = manualTransactionInput(account, draft)!;
  expect(expense).toMatchObject({ accountId: 'cash', currency: 'CAD', amountMinor: -1829, description: 'Groceries' });
  expect(localDayKey(expense.postedAt)).toBe('2026-09-08');
  expect(manualTransactionInput(account, { ...draft, direction: 'income' })?.amountMinor).toBe(1829);
});

it('rejects missing accounts, incomplete or signed amounts and impossible dates', () => {
  expect(manualTransactionInput(undefined, draft)).toBeNull();
  for (const amount of ['', '0', '-18', '18.', '18.291', '1e2', '90071992547409.92']) {
    expect(manualTransactionInput(account, { ...draft, amount })).toBeNull();
  }
  for (const date of ['', '2026-02-30', '2026-13-01']) {
    expect(manualTransactionInput(account, { ...draft, date })).toBeNull();
  }
  expect(manualTransactionInput(account, { ...draft, description: ' ' })).toBeNull();
});
