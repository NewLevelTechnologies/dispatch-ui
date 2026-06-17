import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { InvoiceAgingBucket } from '../../api';

// URL param carrying the AR aging-bucket filter on the customer Invoices tab. It
// lives in the URL (not local state) so the overview "Billing & AR" boxes can
// deep-link into the filtered list across the tab boundary, and so a refreshed /
// shared URL restores it. Pairs with useUrlTab ('tab') + useUrlPage
// ('invoicesPage').
export const INVOICE_AGING_PARAM = 'invoicesAging';

// Toolbar options for the Aging filter chip. Non-'all' ids ARE the backend enum
// tokens, so an id doubles as the `agingBucket` request value.
export const INVOICE_AGING_FILTERS: { id: string; label: string }[] = [
  { id: 'all', label: 'All ages' },
  { id: InvoiceAgingBucket.CURRENT, label: 'Current' },
  { id: InvoiceAgingBucket.DAYS_1_30, label: '1–30 days' },
  { id: InvoiceAgingBucket.DAYS_31_60, label: '31–60 days' },
  { id: InvoiceAgingBucket.DAYS_61_90, label: '61–90 days' },
  { id: InvoiceAgingBucket.DAYS_91_PLUS, label: '91+ days' },
];

const VALID_AGING_IDS = new Set(INVOICE_AGING_FILTERS.map((f) => f.id));

// Current aging filter id from the URL ('all' when absent/invalid).
export function readAgingId(params: URLSearchParams): string {
  const raw = params.get(INVOICE_AGING_PARAM);
  return raw && VALID_AGING_IDS.has(raw) ? raw : 'all';
}

// Jump to the Invoices tab pre-filtered to one AR aging bucket — sets
// ?tab=invoices&invoicesAging=<bucket> and clears the invoices page param in a
// single history entry. Used by the overview Billing & AR boxes so each box
// deep-links to exactly its bucket (count matches the box).
export function useGoToInvoicesBucket() {
  const [, setSearchParams] = useSearchParams();
  return useCallback(
    (bucket: InvoiceAgingBucket) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set('tab', 'invoices');
        next.set(INVOICE_AGING_PARAM, bucket);
        next.delete('invoicesPage');
        return next;
      });
    },
    [setSearchParams],
  );
}
