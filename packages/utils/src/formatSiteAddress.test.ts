import { describe, it, expect } from 'vitest';
import { formatSiteAddress } from './formatSiteAddress';

// Addresses are stored uppercase, so every expectation here starts from the
// shape the wire actually delivers.
const FULL = {
  street: '1847 PEACHTREE RD NE',
  city: 'ATLANTA',
  state: 'GA',
  zip: '30309',
};

describe('formatSiteAddress', () => {
  it('matches the string customer notifications send verbatim', () => {
    expect(formatSiteAddress(FULL)).toBe('1847 Peachtree Rd NE, Atlanta, GA 30309');
  });

  it('leaves the state code uppercase while title-casing the rest', () => {
    // titleCaseAddress would render "GA" as "Ga", so state must bypass it.
    expect(formatSiteAddress(FULL)).toContain('GA 30309');
    expect(formatSiteAddress(FULL)).not.toContain('Ga');
  });

  it('keeps directionals uppercase', () => {
    expect(formatSiteAddress({ street: '12 SW MAIN ST' })).toBe('12 SW Main St');
  });

  it('omits a missing street entirely — no leading comma', () => {
    expect(formatSiteAddress({ ...FULL, street: null })).toBe('Atlanta, GA 30309');
  });

  it('omits a missing zip without leaving a trailing space', () => {
    expect(formatSiteAddress({ ...FULL, zip: null })).toBe('1847 Peachtree Rd NE, Atlanta, GA');
  });

  it('omits a missing state without leaving a double space before the zip', () => {
    expect(formatSiteAddress({ ...FULL, state: null })).toBe(
      '1847 Peachtree Rd NE, Atlanta, 30309',
    );
  });

  it('drops the whole trailing segment when neither state nor zip is on file', () => {
    expect(formatSiteAddress({ ...FULL, state: null, zip: null })).toBe(
      '1847 Peachtree Rd NE, Atlanta',
    );
  });

  it('never emits a placeholder for an empty address', () => {
    // Null means "no street on file", not "the lookup failed". There is
    // nothing to apologise for, so nothing renders.
    expect(formatSiteAddress({})).toBe('');
    expect(formatSiteAddress({ street: null, city: null, state: null, zip: null })).toBe('');
  });

  it('treats whitespace-only parts as absent', () => {
    expect(formatSiteAddress({ street: '   ', city: 'ATLANTA', state: 'GA', zip: '  ' })).toBe(
      'Atlanta, GA',
    );
  });

  it('renders a street on its own when it is all that is known', () => {
    expect(formatSiteAddress({ street: '1847 PEACHTREE RD NE' })).toBe('1847 Peachtree Rd NE');
  });
});

// The rail card separates street from place with an interpunct because the
// address wraps at 262px and the break has to stay readable. City, state and
// zip never change shape — they are one place.
describe('formatSiteAddress — rail separator', () => {
  it('marks the street/place boundary so a wrapped address still parses', () => {
    expect(formatSiteAddress(FULL, { separator: ' · ' })).toBe(
      '1847 Peachtree Rd NE · Atlanta, GA 30309',
    );
  });

  it('keeps city, state and zip comma-joined regardless of separator', () => {
    expect(formatSiteAddress(FULL, { separator: ' · ' })).toContain('Atlanta, GA 30309');
  });

  it('leaves no dangling separator when the street is absent', () => {
    expect(formatSiteAddress({ ...FULL, street: null }, { separator: ' · ' })).toBe(
      'Atlanta, GA 30309',
    );
  });

  it('leaves no dangling separator when only the street is known', () => {
    expect(
      formatSiteAddress({ street: '1847 PEACHTREE RD NE' }, { separator: ' · ' }),
    ).toBe('1847 Peachtree Rd NE');
  });
});
