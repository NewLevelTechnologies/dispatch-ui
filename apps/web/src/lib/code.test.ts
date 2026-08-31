import { describe, expect, it } from 'vitest';
import { toUpperSnake } from './code';

describe('toUpperSnake', () => {
  it('uppercases a single word', () => {
    expect(toUpperSnake('service')).toBe('SERVICE');
  });

  it('joins multi-word names with underscores', () => {
    expect(toUpperSnake('Service Call')).toBe('SERVICE_CALL');
  });

  it('collapses runs of whitespace and punctuation', () => {
    expect(toUpperSnake('  HVAC / Plumbing  ')).toBe('HVAC_PLUMBING');
  });

  it('strips non-ASCII characters', () => {
    expect(toUpperSnake('café')).toBe('CAF');
  });

  it('trims leading and trailing underscores after substitution', () => {
    expect(toUpperSnake('—Maintenance—')).toBe('MAINTENANCE');
  });

  it('preserves embedded digits', () => {
    expect(toUpperSnake('Service 24/7')).toBe('SERVICE_24_7');
  });

  it('caps the output at 50 characters', () => {
    const long = 'a'.repeat(80);
    expect(toUpperSnake(long)).toHaveLength(50);
  });

  it('returns an empty string for empty or pure-punctuation input', () => {
    expect(toUpperSnake('')).toBe('');
    expect(toUpperSnake('  —  ')).toBe('');
  });
});
