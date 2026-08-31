import { describe, it, expect } from 'vitest';
import { formatCurrency } from './formatCurrency';

describe('formatCurrency', () => {
  it('formats a whole amount with a thousands separator and cents', () => {
    expect(formatCurrency(1234.56)).toBe('$1,234.56');
    expect(formatCurrency(1000)).toBe('$1,000.00');
  });

  it('renders a dash for null and undefined', () => {
    expect(formatCurrency(null)).toBe('-');
    expect(formatCurrency(undefined)).toBe('-');
    expect(formatCurrency()).toBe('-');
  });

  // Zero is a real amount, not a missing one — it must not collapse to the
  // dash the way null does.
  it('formats zero rather than treating it as absent', () => {
    expect(formatCurrency(0)).toBe('$0.00');
  });

  it('formats negatives, as used for credits and refunds', () => {
    expect(formatCurrency(-45.5)).toBe('-$45.50');
  });

  it('rounds to two decimal places', () => {
    expect(formatCurrency(9.999)).toBe('$10.00');
    expect(formatCurrency(0.005)).toBe('$0.01');
  });
});
