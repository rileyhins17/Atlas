/**
 * Money formatting. Amounts are always signed MINOR units (cents) end to end —
 * negative means money out — so every display path converts here rather than
 * dividing by 100 in a component.
 */

/** Absolute major units, e.g. -1234 → 12.34. */
function major(minor: number): number {
  return Math.abs(minor) / 100;
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
