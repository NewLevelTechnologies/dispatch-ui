import { formatAddress } from './formatAddress';

describe('formatAddress', () => {
  it('formats a full address on one line', () => {
    expect(
      formatAddress({ streetAddress: '123 Main St', city: 'Phoenix', state: 'AZ', zipCode: '85001' })
    ).toBe('123 Main St, Phoenix, AZ 85001');
  });

  it('returns null for a missing address', () => {
    expect(formatAddress(null)).toBeNull();
    expect(formatAddress(undefined)).toBeNull();
  });

  it('omits a missing city/state/zip rather than leaving stray punctuation', () => {
    expect(formatAddress({ streetAddress: '123 Main St', city: '', state: '', zipCode: '' })).toBe('123 Main St');
  });
});
