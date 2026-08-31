import { describe, it, expect } from 'vitest';
import { dense, withDensity } from './dense';

describe('dense presets', () => {
  it('exposes className tokens for every form primitive', () => {
    expect(dense.field).toContain('mb-2');
    expect(dense.label).toContain('uppercase');
    expect(dense.input).toContain('[&_input]:h-8');
    expect(dense.select).toContain('[&_select]:h-8');
    expect(dense.textarea).toContain('[&_textarea]:');
    expect(dense.switch).toContain('h-[18px]');
    expect(dense.checkbox).toContain('h-3.5');
    expect(dense.hint).toContain('text-fg-dim');
    expect(dense.error).toContain('text-danger-500');
    expect(dense.row).toContain('flex');
  });
});

describe('withDensity()', () => {
  it('returns the base utility set when no parent class is given', () => {
    const result = withDensity();
    expect(result).toContain('[&_label]:uppercase');
    expect(result).toContain('[&_input]:h-8');
    expect(result).toContain('[&_select]:h-8');
    expect(result).toContain('[&_textarea]:text-[12.5px]');
    expect(result.startsWith(' ')).toBe(false);
  });

  it('prepends a parent class when provided', () => {
    const result = withDensity('my-form');
    expect(result.startsWith('my-form ')).toBe(true);
    expect(result).toContain('[&_input]:h-8');
  });

  it('filters out empty parent strings', () => {
    const result = withDensity('');
    expect(result.startsWith(' ')).toBe(false);
    expect(result.split(' ').filter(Boolean).length).toBeGreaterThan(0);
  });
});
