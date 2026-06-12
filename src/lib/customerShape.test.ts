import { describe, it, expect } from 'vitest';
import { resolveCustomerShape } from './customerShape';
import type { Address, Customer, ServiceLocation } from '../api/customerApi';

const addr = (over: Partial<Address> = {}): Address => ({
  streetAddress: '1 Main St',
  city: 'Phoenix',
  state: 'AZ',
  zipCode: '85007',
  ...over,
});

const loc = (over: Partial<ServiceLocation> = {}): ServiceLocation => ({
  id: 'loc',
  customerId: 'c1',
  dispatchRegionId: 'r1',
  address: addr(),
  additionalContacts: [],
  status: 'ACTIVE',
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
  version: 0,
  ...over,
});

const customer = (over: Partial<Customer> = {}): Customer => ({
  id: 'c1',
  name: 'Acme',
  email: 'a@acme.com',
  type: 'STANDARD',
  billingAddress: addr(),
  additionalContacts: [],
  serviceLocations: [],
  paymentTermsDays: 30,
  requiresPurchaseOrder: false,
  taxExempt: false,
  status: 'ACTIVE',
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
  version: 0,
  ...over,
});

describe('resolveCustomerShape', () => {
  it('trusts the server-computed shape when present', () => {
    // Server says MULTI even though the topology would derive SINGLE.
    expect(resolveCustomerShape(customer({ shape: 'MULTI', serviceLocations: [loc()] }))).toBe('MULTI');
    expect(resolveCustomerShape(customer({ shape: 'BILLING_ONLY', serviceLocations: [loc()] }))).toBe('BILLING_ONLY');
  });

  it('classifies a BILLING_ONLY type as a payer regardless of locations', () => {
    expect(resolveCustomerShape(customer({ type: 'BILLING_ONLY', serviceLocations: [loc()] }))).toBe('BILLING_ONLY');
  });

  it('derives BILLING_ONLY when there are zero locations', () => {
    expect(resolveCustomerShape(customer({ serviceLocations: [] }))).toBe('BILLING_ONLY');
  });

  it('derives SINGLE for one location whose address matches billing', () => {
    const billing = addr({ streetAddress: '500 Oak Ave', city: 'Mesa', zipCode: '85201' });
    expect(
      resolveCustomerShape(
        customer({ billingAddress: billing, serviceLocations: [loc({ address: addr({ ...billing }) })] }),
      ),
    ).toBe('SINGLE');
  });

  it('ignores whitespace/case when comparing the single location to billing', () => {
    const billing = addr({ streetAddress: '500 Oak Ave', city: 'Mesa' });
    const service = addr({ streetAddress: '  500 OAK AVE ', city: 'mesa' });
    expect(
      resolveCustomerShape(customer({ billingAddress: billing, serviceLocations: [loc({ address: service })] })),
    ).toBe('SINGLE');
  });

  it('derives MULTI for one location whose address differs from billing', () => {
    const billing = addr({ streetAddress: '500 Oak Ave', city: 'Mesa' });
    const service = addr({ streetAddress: '7150 E Camelback Rd', city: 'Scottsdale' });
    expect(
      resolveCustomerShape(customer({ billingAddress: billing, serviceLocations: [loc({ address: service })] })),
    ).toBe('MULTI');
  });

  it('derives MULTI for more than one location', () => {
    expect(
      resolveCustomerShape(customer({ serviceLocations: [loc({ id: 'a' }), loc({ id: 'b' })] })),
    ).toBe('MULTI');
  });
});
