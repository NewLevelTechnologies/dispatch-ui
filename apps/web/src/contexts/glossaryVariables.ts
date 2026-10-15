import type { GlossaryEntry } from '../api/setup';

/**
 * Default entity names (English).
 *
 * IMPORTANT: These should match backend EntityType enum exactly.
 * This is hardcoded (not fetched) for optimal performance.
 *
 * When adding a new entity:
 * 1. Backend adds to EntityType enum
 * 2. Add here with defaults
 * 3. Add to i18n (en_us.json entities section)
 * 4. Deploy together
 *
 * Exported for test mocking (DRY - single source of truth).
 */
export const GLOSSARY_DEFAULTS: Record<string, GlossaryEntry> = {
  agreement: { singular: 'Agreement', plural: 'Agreements' },
  customer: { singular: 'Customer', plural: 'Customers' },
  dispatch: { singular: 'Dispatch', plural: 'Dispatches' },
  dispatch_region: { singular: 'Region', plural: 'Regions' },
  division: { singular: 'Division', plural: 'Divisions' },
  equipment: { singular: 'Equipment', plural: 'Equipment' },
  equipment_component: { singular: 'Unit', plural: 'Units' },
  invoice: { singular: 'Invoice', plural: 'Invoices' },
  payer: { singular: 'Payer', plural: 'Payers' },
  payment: { singular: 'Payment', plural: 'Payments' },
  quote: { singular: 'Quote', plural: 'Quotes' },
  route: { singular: 'Route', plural: 'Routes' },
  schedule: { singular: 'Schedule', plural: 'Schedules' },
  service_location: { singular: 'Location', plural: 'Locations' },
  technician: { singular: 'Technician', plural: 'Technicians' },
  work_item: { singular: 'Work Item', plural: 'Work Items', abbreviation: 'WI' },
  work_order: { singular: 'Work Order', plural: 'Work Orders', abbreviation: 'WO' },
};

/**
 * Entity names as i18n variables, singular and plural: `{{customer}}`,
 * `{{workOrders, lowercase}}`. Keys are camelCase codes; equipment's plural
 * is the same word, so it has only `equipment`.
 */
export function glossaryVariables(glossary: Record<string, Pick<GlossaryEntry, 'singular' | 'plural'>>) {
  const one = (code: string) => glossary[code]?.singular || GLOSSARY_DEFAULTS[code].singular;
  const many = (code: string) => glossary[code]?.plural || GLOSSARY_DEFAULTS[code].plural;
  return {
    agreement: one('agreement'),
    agreements: many('agreement'),
    customer: one('customer'),
    customers: many('customer'),
    dispatch: one('dispatch'),
    dispatches: many('dispatch'),
    division: one('division'),
    divisions: many('division'),
    equipment: one('equipment'),
    invoice: one('invoice'),
    invoices: many('invoice'),
    location: one('service_location'),
    locations: many('service_location'),
    payer: one('payer'),
    payers: many('payer'),
    payment: one('payment'),
    payments: many('payment'),
    quote: one('quote'),
    quotes: many('quote'),
    region: one('dispatch_region'),
    regions: many('dispatch_region'),
    technician: one('technician'),
    technicians: many('technician'),
    workItem: one('work_item'),
    workItems: many('work_item'),
    workOrder: one('work_order'),
    workOrders: many('work_order'),
  };
}
