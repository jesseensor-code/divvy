/**
 * currency.ts
 *
 * ZAR formatting utilities.
 * Centralised here so display format is consistent everywhere
 * and trivial to change (e.g. decimal separator, symbol position).
 */

/**
 * Format a number as a ZAR amount — no decimal places.
 *
 * formatRands(120)    → "R 120"
 * formatRands(1234)   → "R 1 234"
 * formatRands(49.5)   → "R 50"  (rounded for display; internal calcs keep precision)
 */
export function formatRands(amount: number): string {
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    currencyDisplay: 'symbol',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

/**
 * Parse a user-entered price string into a number.
 * Handles common input formats:
 *   "R120"   → 120
 *   "120.50" → 120.5
 *   "1 200"  → 1200  (space-separated thousands)
 *   "1,200"  → 1200  (comma-separated thousands)
 *
 * Returns null if the input can't be parsed to a valid positive number.
 */
export function parseRands(input: string): number | null {
  // Strip currency symbol, spaces used as thousands separators, commas
  const cleaned = input.replace(/R/gi, '').replace(/\s/g, '').replace(/,/g, '')
  const value = parseFloat(cleaned)

  if (isNaN(value) || value < 0) return null
  return Math.round(value * 100) / 100
}
