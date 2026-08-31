import { describe, it, expect } from 'vitest';
import { roleColor } from './roleColor';

describe('roleColor', () => {
  it('returns the same color for the same role name', () => {
    expect(roleColor('Admin')).toBe(roleColor('Admin'));
    expect(roleColor('Dispatcher')).toBe(roleColor('Dispatcher'));
  });

  it('returns a value from the curated palette', () => {
    const result = roleColor('Anything');
    expect(result).toMatch(/^oklch\(/);
  });

  it('handles the empty string without throwing', () => {
    expect(() => roleColor('')).not.toThrow();
    expect(roleColor('')).toMatch(/^oklch\(/);
  });

  it('distributes distinct role names across the palette', () => {
    const names = ['Admin', 'Dispatcher', 'CSR', 'Technician', 'Manager', 'Owner', 'Billing'];
    const colors = new Set(names.map(roleColor));
    expect(colors.size).toBeGreaterThan(1);
  });
});
