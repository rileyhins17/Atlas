import { describe, expect, it } from 'vitest';
import { formatMinorCompact, formatMoney } from '@/lib/money';

/**
 * `formatMoney` delegates the symbol/placement to Intl, which varies by the
 * runtime's locale (CI and dev machines differ). These assert the parts we
 * actually control — direction sign and magnitude — not Intl's styling.
 */
describe('formatMoney (ledger)', () => {
  it('signs the direction of money and renders the magnitude', () => {
    const out = formatMoney(-1234, 'USD');
    expect(out.startsWith('-')).toBe(true);
    expect(out).toContain('12.34');

    const income = formatMoney(500, 'USD');
    expect(income.startsWith('+')).toBe(true);
    expect(income).toContain('5.00');
  });

  it('always includes the currency for a non-default code', () => {
    expect(formatMoney(-1234, 'CAD')).toContain('12.34');
    expect(formatMoney(1234, 'JPY')).toMatch(/^\+/);
  });
});

describe('formatMinorCompact (stat tiles)', () => {
  it('keeps cents under $1000 and rounds past it', () => {
    expect(formatMinorCompact(-1599)).toBe('-$15.99');
    expect(formatMinorCompact(250)).toBe('$2.50');
    expect(formatMinorCompact(-1234567)).toBe('-$12,346');
  });
});
