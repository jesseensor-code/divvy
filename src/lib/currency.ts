/**
 * currency.ts
 *
 * ZAR formatting utilities.
 * Centralised here so display format is consistent everywhere
 * and trivial to change (e.g. decimal separator, symbol position).
 */

/**
 * Format a number as a ZAR amount.
 *
 * formatRands(120)     → "R 120.00"
 * formatRands(1234.5)  → "R 1 234.50"
 * formatRands(0)       → "R 0.00"
 */
export function formatRands(amount: number): string {
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    currencyDisplay: 'symbol',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
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
