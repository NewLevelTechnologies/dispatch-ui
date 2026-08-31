/**
 * Format a number as USD currency
 * @param amount - Number or undefined
 * @returns Formatted currency (e.g., "$1,234.56") or "-"
 */
export function formatCurrency(amount?: number | null): string {
  if (amount === undefined || amount === null) return '-';

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
}
