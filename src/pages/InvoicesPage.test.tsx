import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import InvoicesPage from './InvoicesPage';
import apiClient from '../api/client';

vi.mock('../api/client');

const invoiceRow = {
  id: 'inv-1',
  invoiceNumber: 'INV-1001',
  status: 'SENT',
  customerId: 'c-1',
  customerName: 'Acme Co',
  serviceLocationId: null,
  workOrderId: 'wo-1',
  invoiceDate: '2026-01-10T00:00:00Z',
  dueDate: '2026-02-10T00:00:00Z',
  totalAmount: 500,
  amountPaid: 0,
  balanceDue: 500,
  overdue: false,
  lastSentAt: null,
  createdAt: '2026-01-10T00:00:00Z',
  updatedAt: '2026-01-10T00:00:00Z',
};

const invoicePage = (content: unknown[]) => ({
  content,
  totalElements: content.length,
  totalPages: 1,
  number: 0,
  size: 25,
  first: true,
  last: true,
});

describe('InvoicesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiClient.get).mockImplementation((url: string) => {
      if (url === '/financial/invoices' || url.startsWith('/financial/invoices?')) {
        return Promise.resolve({ data: invoicePage([invoiceRow]) });
      }
      if (url.includes('/customers')) {
        return Promise.resolve({ data: { content: [], totalElements: 0, totalPages: 0, number: 0, size: 200 } });
      }
      if (url.includes('/work-orders')) {
        return Promise.resolve({ data: { content: [], totalElements: 0, totalPages: 0, number: 0, size: 200 } });
      }
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });
  });

  it('renders rows from the paged list envelope', async () => {
    renderWithProviders(<InvoicesPage />);
    await waitFor(() => expect(screen.getByText('INV-1001')).toBeInTheDocument());
    // Customer name comes off the lean row (no client-side customer join).
    expect(screen.getByText('Acme Co')).toBeInTheDocument();
  });

  it('drives the status chip server-side — Overdue sends overdue=true, not status=OVERDUE', async () => {
    const user = userEvent.setup();
    renderWithProviders(<InvoicesPage />);
    await waitFor(() => expect(screen.getByText('INV-1001')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Status' }));
    await user.click(await screen.findByRole('option', { name: /overdue/i }));

    await waitFor(() => {
      const sent = vi
        .mocked(apiClient.get)
        .mock.calls.some(
          ([u, cfg]) =>
            u === '/financial/invoices' &&
            (cfg as { params?: { overdue?: boolean; status?: string } } | undefined)?.params?.overdue === true &&
            (cfg as { params?: { status?: string } } | undefined)?.params?.status === undefined,
        );
      expect(sent).toBe(true);
    });
  });

  it('drives search server-side via the q param', async () => {
    const user = userEvent.setup();
    renderWithProviders(<InvoicesPage />);
    await waitFor(() => expect(screen.getByText('INV-1001')).toBeInTheDocument());

    await user.type(screen.getByRole('textbox'), 'acme');

    await waitFor(() => {
      const sentQ = vi
        .mocked(apiClient.get)
        .mock.calls.some(
          ([u, cfg]) =>
            u === '/financial/invoices' &&
            (cfg as { params?: { q?: string } } | undefined)?.params?.q === 'acme',
        );
      expect(sentQ).toBe(true);
    });
  });
});
