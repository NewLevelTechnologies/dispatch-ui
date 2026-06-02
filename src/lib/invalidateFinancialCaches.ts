import type { QueryClient } from '@tanstack/react-query';

/**
 * Invalidate caches that derive from invoice / payment state but live OUTSIDE
 * the work-order-scoped financial queries:
 *   - `['location-invoices', locId]`         — Location detail Invoices tab list + tab-count badge
 *   - `['location-invoice-summary', locId]`  — Location detail Invoices tab summary strip
 *   - `['service-location', locId]`          — Location detail overview "Billed to" card
 *                                              (openInvoiceAmount/Count + customerOutstandingBalance
 *                                              ride the detail payload)
 *
 * Invoice/payment mutations (void, status change, send→SENT, create, record/
 * void payment) fire from work-order-scoped surfaces (the financial drawer,
 * the invoices/payments pages) that don't know the affected service location,
 * so these are invalidated by key PREFIX — every cached location refreshes,
 * same approach as the dispatch invalidations in DispatchesSection.
 *
 * Call ALONGSIDE the existing `['workOrderInvoices', woId]` / `['financialSummary',
 * woId]` invalidations, not instead of them.
 */
export function invalidateLocationInvoiceCaches(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ['location-invoices'] });
  queryClient.invalidateQueries({ queryKey: ['location-invoice-summary'] });
  queryClient.invalidateQueries({ queryKey: ['service-location'] });
}
