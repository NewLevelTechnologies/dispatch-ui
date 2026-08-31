import { describe, it, expect } from 'vitest';
import { formatFilterSize } from './formatFilterSize';

describe('formatFilterSize', () => {
  it('formats integer dimensions with × separator', () => {
    expect(formatFilterSize({ lengthIn: 20, widthIn: 25, thicknessIn: 1 })).toBe('20×25×1');
  });

  it('preserves decimal precision', () => {
    expect(formatFilterSize({ lengthIn: 16.5, widthIn: 25, thicknessIn: 4 })).toBe('16.5×25×4');
  });

  it('handles zero dimensions', () => {
    expect(formatFilterSize({ lengthIn: 0, widthIn: 0, thicknessIn: 0 })).toBe('0×0×0');
  });
});
