import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../../test/utils';
import CustomerInvoicesTab from './CustomerInvoicesTab';
import apiClient from '../../api/client';
import type { InvoiceListPage } from '../../api';

vi.mock('../../api/client');

function page(content: InvoiceListPage['content']): InvoiceListPage {
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

const row = (over: Partial<InvoiceListPage['content'][number]>): InvoiceListPage['content'][number] => ({
  id: 'i1',
  invoiceNumber: 'INV-1001',
  status: 'SENT',
  customerId: 'c1',
  customerName: 'Acme',
  serviceLocationId: null,
  workOrderId: null,
  invoiceDate: '2026-05-01',
  dueDate: '2026-05-31',
  totalAmount: 1250,
  amountPaid: 0,
  balanceDue: 1250,
  overdue: false,
  lastSentAt: null,
  createdAt: '2026-05-01T00:00:00Z',
  updatedAt: '2026-05-01T00:00:00Z',
  ...over,
});

describe('CustomerInvoicesTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the customer invoice rows with formatted amounts', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: page([
        row({ totalAmount: 1250, balanceDue: 500 }),
        row({ id: 'i2', invoiceNumber: 'INV-1002', totalAmount: 90, balanceDue: 0, status: 'PAID' }),
      ]),
    });

    renderWithProviders(<CustomerInvoicesTab customerId="c1" />);

    expect(await screen.findByText('INV-1001')).toBeInTheDocument();
    expect(screen.getByText('INV-1002')).toBeInTheDocument();
    expect(screen.getByText('$1,250.00')).toBeInTheDocument(); // total
    expect(screen.getByText('$500.00')).toBeInTheDocument(); // balance due

    // Scoped to the customer via the list endpoint.
    expect(apiClient.get).toHaveBeenCalledWith(
      '/financial/invoices',
      expect.objectContaining({ params: expect.objectContaining({ customerId: 'c1' }) }),
    );
  });

  it('shows an empty state when the customer has no invoices', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: page([]) });

    renderWithProviders(<CustomerInvoicesTab customerId="c1" />);

    await waitFor(() => expect(screen.getByText(/will appear here/i)).toBeInTheDocument());
    expect(screen.queryByText('INV-1001')).not.toBeInTheDocument();
  });
});
