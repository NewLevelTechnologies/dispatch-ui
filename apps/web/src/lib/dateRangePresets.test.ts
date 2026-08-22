import { describe, it, expect } from 'vitest';
import {
  formatDateRange,
  instantRangeForDays,
  rangeForPreset,
} from './dateRangePresets';

describe('rangeForPreset', () => {
  // Deterministic clock — presets take `today` explicitly.
  const today = new Date(2026, 5, 5); // Jun 5, 2026

  it('lastMonth spans the previous calendar month', () => {
    expect(rangeForPreset('lastMonth', today)).toEqual({ from: '2026-05-01', to: '2026-05-31' });
  });

  it('lastMonth rolls across a year boundary', () => {
    expect(rangeForPreset('lastMonth', new Date(2026, 0, 15))).toEqual({
      from: '2025-12-01',
      to: '2025-12-31',
    });
  });

  it('thisYear spans Jan 1 to Dec 31', () => {
    expect(rangeForPreset('thisYear', today)).toEqual({ from: '2026-01-01', to: '2026-12-31' });
  });
});

describe('instantRangeForDays', () => {
  it('converts inclusive days to half-open local-midnight instants', () => {
    const r = instantRangeForDays('2026-05-01', '2026-05-31');
    // Expected values built with the same constructor → timezone-agnostic.
    expect(r.from).toBe(new Date(2026, 4, 1).toISOString());
    expect(r.to).toBe(new Date(2026, 5, 1).toISOString()); // midnight AFTER the inclusive end
  });

  it('leaves open-ended sides undefined', () => {
    expect(instantRangeForDays(undefined, undefined)).toEqual({ from: undefined, to: undefined });
    expect(instantRangeForDays('2026-05-01', undefined).to).toBeUndefined();
  });
});

describe('formatDateRange', () => {
  const thisYear = new Date().getFullYear();

  it('formats a bounded range, omitting the current year', () => {
    expect(formatDateRange({ from: `${thisYear}-05-01`, to: `${thisYear}-05-31` })).toBe('May 1 – May 31');
  });

  it('keeps the year on non-current years', () => {
    expect(formatDateRange({ from: '2024-05-01', to: '2024-05-31' })).toBe('May 1, 2024 – May 31, 2024');
  });

  it('reads open-ended ranges as After/Before', () => {
    expect(formatDateRange({ from: `${thisYear}-05-01`, to: '' })).toBe('After May 1');
    expect(formatDateRange({ from: '', to: `${thisYear}-05-31` })).toBe('Before May 31');
  });
});
