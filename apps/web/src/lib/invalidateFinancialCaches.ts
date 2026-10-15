import type { QueryClient } from '@tanstack/react-query';

/**
 * Invalidate caches that derive from invoice / payment state but live OUTSIDE
 * the work-order-scoped financial queries:
 *   - `['documents', scope]`                 — Location and customer detail Quotes & invoices tab
 *                                              list, counts and tab-count badge
 *   - `['service-location', locId]`          — Location detail overview "Billed to" card
 *                                              (openInvoiceAmount/Count + customerOutstandingBalance
 *                                              ride the detail payload)
 *   - `['invoices']`                         — global Invoices page list
 *   - `['customer-ar-summary', custId]`      — customer detail Billing & AR card + attention strip
 *                                              (FIN-1 outstanding / aging / LTV rollup)
 *
 * Invoice/payment mutations (void, status change, send→SENT, create, record/
 * void payment) fire from work-order-scoped surfaces (the financial drawer,
 * the invoices/payments pages) that don't know the affected service location or
 * customer, so these are invalidated by key PREFIX — every cached location /
 * customer refreshes, same approach as the dispatch invalidations in
 * DispatchesSection.
 *
 * Call ALONGSIDE the existing `['workOrderInvoices', woId]` / `['financialSummary',
 * woId]` invalidations, not instead of them.
 */
export function invalidateLocationInvoiceCaches(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ['documents'] });
  queryClient.invalidateQueries({ queryKey: ['service-location'] });
  queryClient.invalidateQueries({ queryKey: ['invoices'] });
  queryClient.invalidateQueries({ queryKey: ['customer-ar-summary'] });
}
