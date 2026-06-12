// CustomerShape — the structural classification that selects the detail-page
// variant. It is NOT a customer "type": there is no commercial/residential
// customer type (that concept is dead); premise (BUSINESS/RESIDENCE) lives on
// each location, not the customer.
//
//   SINGLE       — one location, billing address == that location's address.
//   MULTI        — multiple locations, or billing address != service address.
//   BILLING_ONLY — a payer: zero service locations (warranty co, TPA, …).
//
// The backend computes `customer.shape` at read on the detail endpoint, but the
// field is optional while that rollout lands. `resolveCustomerShape` trusts the
// server value when present and otherwise derives the same classification from
// the address topology already on the payload — so the page picks the right
// variant whether or not the BE flag is deployed.
import type { Address, Customer, CustomerShape } from '../api/customerApi';

function sameAddress(a: Address, b: Address): boolean {
  const norm = (s?: string | null) => (s ?? '').trim().toLowerCase();
  return (
    norm(a.streetAddress) === norm(b.streetAddress) &&
    norm(a.streetAddressLine2) === norm(b.streetAddressLine2) &&
    norm(a.city) === norm(b.city) &&
    norm(a.state) === norm(b.state) &&
    norm(a.zipCode) === norm(b.zipCode)
  );
}

export function resolveCustomerShape(customer: Customer): CustomerShape {
  // Server-computed value wins when present.
  if (customer.shape) return customer.shape;

  // A billing-only type is always a payer, regardless of location count.
  if (customer.type === 'BILLING_ONLY') return 'BILLING_ONLY';

  const locations = customer.serviceLocations ?? [];
  if (locations.length === 0) return 'BILLING_ONLY';
  if (locations.length === 1) {
    return sameAddress(locations[0].address, customer.billingAddress) ? 'SINGLE' : 'MULTI';
  }
  return 'MULTI';
}
