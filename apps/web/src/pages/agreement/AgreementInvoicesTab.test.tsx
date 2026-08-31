import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen } from '../../test/utils';
import AgreementInvoicesTab from './AgreementInvoicesTab';
import { apiClient } from '../../api/setup';
import type { InvoiceListItemRow, InvoiceListPage } from '../../api/setup';

vi.mock('@dispatch/api/src/client');

function row(over: Partial<InvoiceListItemRow>): InvoiceListItemRow {
  return {
    id: 'i1',
    invoiceNumber: 'INV-2001',
    status: 'SENT',
    customerId: 'c1',
    customerName: 'Acme',
    serviceLocationId: null,
    workOrderId: null,
    agreementId: 'a-1',
    billingPeriodKey: '2026-Q3',
    invoiceDate: '2026-07-01',
    dueDate: '2026-07-31',
    totalAmount: 300,
    amountPaid: 0,
    balanceDue: 300,
    overdue: false,
    lastSentAt: null,
    createdAt: '2026-07-01T00:00:00Z',
    updatedAt: '2026-07-01T00:00:00Z',
    ...over,
  };
}

function page(content: InvoiceListItemRow[]): InvoiceListPage {
  return {
    content,
    page: 0,
    size: 25,
    totalElements: content.length,
    totalPages: content.length ? 1 : 0,
    first: true,
    last: true,
  };
}

// Resolve the invoice search; everything else (glossary, etc.) gets an empty payload.
function mockGet(invoices: InvoiceListItemRow[]) {
  vi.mocked(apiClient.get).mockImplementation((url: string) =>
    url === '/financial/invoices'
      ? Promise.resolve({ data: page(invoices) } as never)
      : Promise.resolve({ data: [] } as never),
  );
}

beforeEach(() => vi.clearAllMocks());

describe('AgreementInvoicesTab', () => {
  it('renders invoice rows with period and status', async () => {
    mockGet([row({ id: 'i1', invoiceNumber: 'INV-2001', billingPeriodKey: '2026-Q3', status: 'PAID', balanceDue: 0 })]);
    renderWithProviders(<AgreementInvoicesTab agreementId="a-1" />);

    expect(await screen.findByText('INV-2001')).toBeInTheDocument();
    expect(screen.getByText('2026-Q3')).toBeInTheDocument();
    expect(apiClient.get).toHaveBeenCalledWith(
      '/financial/invoices',
      expect.objectContaining({ params: expect.objectContaining({ agreementId: 'a-1' }) }),
    );
  });

  it('shows the empty state when the agreement has no invoices', async () => {
    mockGet([]);
    renderWithProviders(<AgreementInvoicesTab agreementId="a-1" />);
    expect(await screen.findByText(/no .* yet/i)).toBeInTheDocument();
  });
});
