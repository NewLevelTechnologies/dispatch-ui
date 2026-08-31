import { describe, it, expect } from 'vitest';
import { validateEmail } from './validation';

describe('validateEmail', () => {
  it('accepts a standard email', () => {
    expect(validateEmail('user@example.com')).toBe(true);
  });

  it('accepts subdomains and plus-addressing', () => {
    expect(validateEmail('user+tag@mail.example.co.uk')).toBe(true);
  });

  it('rejects missing @', () => {
    expect(validateEmail('userexample.com')).toBe(false);
  });

  it('rejects missing domain', () => {
    expect(validateEmail('user@')).toBe(false);
  });

  it('rejects missing local part', () => {
    expect(validateEmail('@example.com')).toBe(false);
  });

  it('rejects spaces', () => {
    expect(validateEmail('user @example.com')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(validateEmail('')).toBe(false);
  });
});
