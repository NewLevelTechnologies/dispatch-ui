import { describe, it, expect } from 'vitest';
import { titleCaseAddress } from './titleCaseAddress';

describe('titleCaseAddress', () => {
  it('title-cases an uppercase street address', () => {
    expect(titleCaseAddress('2184 CHESHIRE BRIDGE RD')).toBe('2184 Cheshire Bridge Rd');
  });

  it('preserves directionals (NE, SW, etc.)', () => {
    expect(titleCaseAddress('2184 CHESHIRE BRIDGE RD NE')).toBe('2184 Cheshire Bridge Rd NE');
    expect(titleCaseAddress('100 MAIN ST SW')).toBe('100 Main St SW');
  });

  it('preserves single-letter directionals', () => {
    expect(titleCaseAddress('500 N BROAD ST')).toBe('500 N Broad St');
    expect(titleCaseAddress('200 S ELM AVE')).toBe('200 S Elm Ave');
  });

  it('handles possessives', () => {
    expect(titleCaseAddress("BABA'S KITCHEN PLAZA")).toBe("Baba's Kitchen Plaza");
  });

  it('returns empty string for null/undefined/empty', () => {
    expect(titleCaseAddress(null)).toBe('');
    expect(titleCaseAddress(undefined)).toBe('');
    expect(titleCaseAddress('')).toBe('');
  });

  it('title-cases a single word', () => {
    expect(titleCaseAddress('ATLANTA')).toBe('Atlanta');
  });
});
