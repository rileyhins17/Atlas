import { CreateTransactionInput, type AccountDTO } from './dto/finance.js';
import { localDayKey } from './local-dates.js';

/**
 * Money formatting. Amounts are always signed MINOR units (cents) end to end —
 * negative means money out — so every display path converts here rather than
 * dividing by 100 in a component.
 */

/** Absolute major units, e.g. -1234 → 12.34. */
function major(minor: number): number {
  return Math.abs(minor) / 100;
}

/** Parse a complete decimal amount without floating-point multiplication. */
export function parseMoneyInput(value: string): number | null {
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;
  const cents = BigInt(match[2]!) * 100n + BigInt((match[3] ?? '').padEnd(2, '0'));
  const signed = match[1] ? -cents : cents;
  const result = Number(signed);
  return Number.isSafeInteger(result) ? result : null;
}

/** Manual ledger entry uses a date in the device calendar, like ledger grouping. */
export function manualTransactionInput(account: AccountDTO | undefined, draft: {
  amount: string; direction: 'expense' | 'income'; description: string; date: string;
}): CreateTransactionInput | null {
  const amount = parseMoneyInput(draft.amount);
  if (!account || amount === null || amount <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(draft.date)) return null;
  const postedAt = new Date(`${draft.date}T12:00:00`);
  if (!Number.isFinite(postedAt.getTime()) || localDayKey(postedAt) !== draft.date) return null;
  const parsed = CreateTransactionInput.safeParse({
    accountId: account.id, currency: account.currency,
    amountMinor: draft.direction === 'expense' ? -amount : amount,
    description: draft.description.trim(), postedAt,
  });
  return parsed.success ? parsed.data : null;
}

/**
 * Full ledger formatting with an explicit sign and the row's own currency:
 * -1234 (USD) → "-$12.34", 500 (CAD) → "+CA$5.00". Used where the direction of
 * money matters (the Finance ledger).
 */
export function formatMoney(minor: number, currency: string): string {
  const abs = major(minor);
  let body: string;
  try {
    body = new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(abs);
  } catch {
    // Unknown/invalid currency code — show the number with the raw code.
    body = `${abs.toFixed(2)} ${currency}`;
  }
  return `${minor < 0 ? '-' : '+'}${body}`;
}

/**
 * Compact headline formatting for stat tiles: whole dollars once past $1000 so
 * a number stays glanceable (-1234567 → "-$12,346"). Assumes the display
 * currency, which the Progress tiles present as a single blended total.
 */
export function formatMinorCompact(minor: number): string {
  const abs = major(minor);
  const body = abs >= 1000 ? `$${Math.round(abs).toLocaleString()}` : `$${abs.toFixed(2)}`;
  return `${minor < 0 ? '-' : ''}${body}`;
}
