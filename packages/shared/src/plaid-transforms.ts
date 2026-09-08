/**
 * Convert a Plaid amount to Atlas's signed minor units.
 *
 * Plaid: amount is POSITIVE when money LEAVES the account (a debit/purchase),
 * negative for money in. Atlas Transaction.amountMinor is the opposite —
 * **negative = money out**. So we invert the sign. Getting this backwards makes
 * every expense look like income; it is unit-tested both directions.
 */
export function plaidAmountToMinor(amount: number): number {
  return Math.round(-amount * 100);
}

/** Map Plaid's type/subtype onto Atlas's coarse account type. */
export function mapPlaidAccountType(type: string, subtype?: string | null): string {
  const t = type.toLowerCase();
  const s = (subtype ?? '').toLowerCase();
  if (t === 'credit') return 'credit';
  if (t === 'investment' || t === 'brokerage') return 'investment';
  if (t === 'loan') return 'credit';
  if (t === 'depository') {
    if (s === 'savings') return 'savings';
    if (s === 'checking') return 'checking';
    return 'checking';
  }
  return 'cash';
}

/** The currency for an account/transaction, defaulting sensibly. */
export function plaidCurrency(
  slot: { iso_currency_code?: string | null; unofficial_currency_code?: string | null },
): string {
  return slot.iso_currency_code ?? slot.unofficial_currency_code ?? 'USD';
}
