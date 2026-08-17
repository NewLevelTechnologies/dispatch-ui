// ─────────────────────────────────────────────────────────────────
// customerCreateModel.ts — the ONE model for creating a customer.
//
// Two surfaces create customers: the Add Customer page (/customers/new)
// and the Work Order intake page's inline panel. They look different on
// purpose — intake is a condensed panel a CSR fills while on the phone,
// Add Customer is the back-office form with a duplicate guard, address
// verification and terms — but they must MEAN the same thing. Two flows
// that resolve names or billing differently would teach two mental
// models and quietly produce different records from the same keystrokes.
//
// So the markup stays per-surface and the SEMANTICS live here: what the
// customer ends up named, who the on-site contact is, what counts as a
// reachable contact, and how those map onto CreateCustomerRequest.
// ─────────────────────────────────────────────────────────────────
import type { CreateCustomerRequest, PremiseType } from '../api';

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface ApiAddress {
  streetAddress: string;
  city: string;
  state: string;
  zipCode: string;
}

// The fields both surfaces collect. Add Customer carries more (terms, tax
// exemption, account manager, a separate billing address); those are its
// own concern and ride as `extra` on the request builder.
export interface CustomerCreateModel {
  // What the CSR typed at the top. Names the SERVICE LOCATION — and also the
  // customer, unless a separate party is billed.
  name: string;
  // Who a tech asks for at the door. Lands on the location, never the customer
  // (the customer entity has no contact-name field).
  contactName: string;
  phone: string;
  email: string;
  premise: PremiseType;
  // false = someone else is invoiced (franchise owner, property manager, AP).
  sameBilling: boolean;
  // The account we invoice when billing is separate. Becomes customer.name.
  billingName: string;
  // Where the invoice goes. When billing is separate the customer IS the payer,
  // so these become the customer's own phone/email.
  billingContactPhone: string;
  billingContactEmail: string;
}

// Premise decides what "Name" means, so the field is explained by it. Residence:
// the household ("Avila"). Business: the store/building, never the parent company
// (that distinction is the one genuinely useful thing to say here).
export function nameGuidance(premise: PremiseType): { placeholder: string; hint: string | null } {
  return premise === 'RESIDENCE'
    ? { placeholder: 'Avila', hint: 'the household — a surname is plenty' }
    : { placeholder: 'Red Lobster #123', hint: 'this site, not the parent company' };
}

// customer.name is the account we invoice: the billing name when billing is
// separate, otherwise the top name. The top name always names the location.
export function resolveCustomerName(m: Pick<CustomerCreateModel, 'name' | 'sameBilling' | 'billingName'>): string {
  return (m.sameBilling ? m.name : m.billingName.trim() || m.name).trim();
}

// Residence: the household name IS the contact, so it mirrors until someone
// personalizes it — one name typed once.
export function resolveContactName(
  m: Pick<CustomerCreateModel, 'name' | 'contactName' | 'premise'>,
  contactNameTouched: boolean
): string {
  return contactNameTouched || m.premise !== 'RESIDENCE' ? m.contactName : m.contactName || m.name;
}

// At least one channel — we send confirmations and invoices through them.
// Neither is individually required; having none is what's invalid.
export function contactChannelError(phone: string, email: string): string | null {
  if (!phone.trim() && !email.trim()) return 'Add a phone or email — we send confirmations through them.';
  if (email.trim() && !EMAIL_RE.test(email.trim())) return 'Enter a valid email address.';
  return null;
}

/**
 * Map the model onto the wire. The name/contact/billing routing here is the
 * whole point of sharing this: when a separate party pays, the billing name
 * becomes the CUSTOMER and the typed name demotes to the location, taking the
 * on-site contact with it.
 */
export function buildCustomerCreateRequest(
  m: CustomerCreateModel,
  opts: {
    serviceAddress: ApiAddress;
    // Defaults to the service address when billing isn't split off.
    billingAddress?: ApiAddress;
    dispatchRegionId: string;
    contactNameTouched?: boolean;
    extra?: Partial<CreateCustomerRequest>;
  }
): CreateCustomerRequest {
  const separate = !m.sameBilling;
  const contactName = resolveContactName(m, opts.contactNameTouched ?? false);
  return {
    name: resolveCustomerName(m),
    // Optional on the wire (only name is required). Send null, not "".
    email: (separate ? m.billingContactEmail : m.email).trim() || null,
    phone: (separate ? m.billingContactPhone : m.phone).trim() || null,
    billingAddress: separate ? (opts.billingAddress ?? opts.serviceAddress) : opts.serviceAddress,
    billingAddressSameAsService: m.sameBilling,
    serviceLocations: [
      {
        dispatchRegionId: opts.dispatchRegionId,
        // Seed the site's name from the typed name so it isn't left unlabeled.
        locationName: m.name.trim(),
        premiseType: m.premise,
        siteContactName: contactName.trim() || null,
        // When a separate party is billed, the top contact is the SITE's only
        // contact — the customer's own channels belong to the payer.
        siteContactPhone: separate ? m.phone.trim() || null : null,
        siteContactEmail: separate ? m.email.trim() || null : null,
        address: opts.serviceAddress,
      },
    ],
    ...opts.extra,
  };
}
