import { useGlossary } from '../contexts/GlossaryContext';

/**
 * The tenant's names for the billing entities, as i18n params: spread into
 * `t()` so copy can say `{{quotes, lowercase}}` instead of a hardcoded
 * "quotes". Keys are singular/plural pairs.
 */
export function useEntityNames() {
  const { getName } = useGlossary();
  return {
    agreement: getName('agreement'),
    agreements: getName('agreement', true),
    customer: getName('customer'),
    customers: getName('customer', true),
    invoice: getName('invoice'),
    invoices: getName('invoice', true),
    location: getName('service_location'),
    locations: getName('service_location', true),
    payer: getName('payer'),
    quote: getName('quote'),
    quotes: getName('quote', true),
  };
}
