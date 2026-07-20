import { describe, expect, it } from 'vitest';
import {
  CreateAccountInput,
  CreateTransactionInput,
  TransactionQuery,
  UpdateTransactionInput,
} from '@atlas/shared';

describe('finance DTOs', () => {
  it('CreateAccountInput applies sensible defaults', () => {
    const parsed = CreateAccountInput.parse({ name: 'Cash' });
    expect(parsed).toMatchObject({ type: 'checking', currency: 'USD', balanceMinor: 0 });
  });

  it('CreateAccountInput rejects an unknown type', () => {
    expect(() => CreateAccountInput.parse({ name: 'X', type: 'crypto' })).toThrow();
  });

  it('CreateTransactionInput coerces postedAt and keeps the signed amount', () => {
    const parsed = CreateTransactionInput.parse({
      accountId: 'acc_1',
      amountMinor: -1599,
      description: 'Groceries',
      postedAt: '2026-07-18T12:00:00.000Z',
    });
    expect(parsed.amountMinor).toBe(-1599);
    expect(parsed.postedAt).toBeInstanceOf(Date);
  });

  it('CreateTransactionInput requires an account and integer minor units', () => {
    expect(() => CreateTransactionInput.parse({ amountMinor: 100, description: 'x', postedAt: new Date() })).toThrow();
    expect(() =>
      CreateTransactionInput.parse({ accountId: 'a', amountMinor: 1.5, description: 'x', postedAt: new Date() }),
    ).toThrow();
  });

  it('TransactionQuery hard-caps the page size at 100', () => {
    expect(() => TransactionQuery.parse({ limit: 500 })).toThrow();
    expect(TransactionQuery.parse({}).limit).toBe(50);
    expect(TransactionQuery.parse({ accountId: 'a', limit: 25 })).toMatchObject({ accountId: 'a', limit: 25 });
  });

  it('UpdateTransactionInput allows clearing category with null', () => {
    expect(UpdateTransactionInput.parse({ category: null }).category).toBeNull();
  });
});
