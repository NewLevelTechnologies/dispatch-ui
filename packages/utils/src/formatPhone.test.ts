import { describe, it, expect } from 'vitest';
import { formatPhone } from './formatPhone';

describe('formatPhone', () => {
  it('formats a bare 10-digit number', () => {
    expect(formatPhone('5551234567')).toBe('(555) 123-4567');
  });

  it('strips existing punctuation before formatting', () => {
    expect(formatPhone('(555) 123-4567')).toBe('(555) 123-4567');
    expect(formatPhone('555.123.4567')).toBe('(555) 123-4567');
    expect(formatPhone('555 123 4567')).toBe('(555) 123-4567');
  });

  it('returns an empty string for null, undefined or empty input', () => {
    expect(formatPhone(null)).toBe('');
    expect(formatPhone(undefined)).toBe('');
    expect(formatPhone('')).toBe('');
  });

  // Anything that is not exactly 10 digits is passed through untouched rather
  // than mangled — extensions, country codes and partial entry all reach the
  // UI as the user typed them.
  it('passes through input that is not exactly 10 digits', () => {
    expect(formatPhone('15551234567')).toBe('15551234567');
    expect(formatPhone('555123')).toBe('555123');
    expect(formatPhone('+1 (555) 123-4567')).toBe('+1 (555) 123-4567');
    expect(formatPhone('5551234567 x89')).toBe('5551234567 x89');
  });

  it('formats when the 10 digits are surrounded by letters', () => {
    // The digit filter ignores non-digits entirely, so a labelled number
    // still reaches the 10-digit branch.
    expect(formatPhone('tel:5551234567')).toBe('(555) 123-4567');
  });
});
