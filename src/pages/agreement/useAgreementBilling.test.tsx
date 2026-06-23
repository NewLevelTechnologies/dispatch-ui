import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { useAgreementBilling } from './useAgreementBilling';
import apiClient from '../../api/client';
import type { BillingInstallmentResponse, InvoiceListItemRow, InvoiceListPage } from '../../api';

vi.mock('../../api/client');

const INSTALLMENTS_URL = '/work-orders/agreements/a-1/billing-schedule/installments';

const installments: BillingInstallmentResponse[] = [
  { sequence: 1, periodKey: '2026-Q1', periodStart: '2026-01-01', periodEnd: '2026-03-31', dueDate: '2026-01-01', amount: 300, status: 'INVOICED' },
  { sequence: 2, periodKey: '2026-Q2', periodStart: '2026-04-01', periodEnd: '2026-06-30', dueDate: '2026-04-01', amount: 300, status: 'INVOICED' },
  { sequence: 3, periodKey: '2026-Q3', periodStart: '2026-07-01', periodEnd: '2026-09-30', dueDate: '2026-07-01', amount: 300, status: 'SCHEDULED' },
  { sequence: 4, periodKey: '2026-Q4', periodStart: '2026-10-01', periodEnd: '2026-12-31', dueDate: '2026-10-01', amount: 300, status: 'SCHEDULED' },
];

function inv(over: Partial<InvoiceListItemRow>): InvoiceListItemRow {
  return {
    id: 'i', invoiceNumber: 'INV', status: 'SENT', customerId: 'c1', customerName: null,
    serviceLocationId: null, workOrderId: null, agreementId: 'a-1', billingPeriodKey: null,
    invoiceDate: '2026-01-01', dueDate: '2026-01-31', totalAmount: 300, amountPaid: 0,
    balanceDue: 300, overdue: false, lastSentAt: null, createdAt: '', updatedAt: '', ...over,
  };
}

const invoicePage: InvoiceListPage = {
  content: [
    inv({ id: 'i1', billingPeriodKey: '2026-Q1', status: 'PAID', balanceDue: 0 }),
    inv({ id: 'i2', billingPeriodKey: '2026-Q2', status: 'SENT', balanceDue: 300, overdue: false }),
  ],
  page: 0, size: 200, totalElements: 2, totalPages: 1, first: true, last: true,
};

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(apiClient.get).mockImplementation((url: string) =>
    url === INSTALLMENTS_URL
      ? Promise.resolve({ data: installments } as never)
      : Promise.resolve({ data: invoicePage } as never),
  );
});

describe('useAgreementBilling', () => {
  it('joins installments to invoices and derives per-row status + next invoice', async () => {
    const { result } = renderHook(() => useAgreementBilling('a-1'), { wrapper });

    await waitFor(() => expect(result.current.installments).toHaveLength(4));

    const statuses = result.current.installments.map((i) => i.displayStatus);
    // Q1 invoice paid → PAID; Q2 invoiced+open → BILLED; Q3 earliest scheduled → NEXT; Q4 → SCHEDULED.
    expect(statuses).toEqual(['PAID', 'BILLED', 'NEXT', 'SCHEDULED']);

    expect(result.current.total).toBe(4);
    expect(result.current.hasBilling).toBe(true);
    expect(result.current.nextInvoice).toEqual({ amount: 300, dueDate: '2026-07-01', n: 3, of: 4 });
    expect(result.current.installments[0].invoiceId).toBe('i1');
  });

  it('reports no billing when the schedule is empty', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: [] } as never);
    const { result } = renderHook(() => useAgreementBilling('a-1'), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.hasBilling).toBe(false);
    expect(result.current.nextInvoice).toBeNull();
  });
});
