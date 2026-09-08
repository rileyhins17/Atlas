import { describe, expect, it } from 'vitest';
import { plaidAmountToMinor, mapPlaidAccountType, plaidCurrency } from '../src/plaid-transforms.js';

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
