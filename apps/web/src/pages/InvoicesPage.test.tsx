import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import InvoicesPage from './InvoicesPage';
import { apiClient } from '../api/setup';

vi.mock('@dispatch/api/src/client');

const row = (over: Record<string, unknown> = {}) => ({
  id: 'inv-1', invoiceNumber: 'INV-3307', status: 'SENT', customerId: 'c-1', customerName: 'Desert Ridge Property Mgmt',
  billToIsPayer: true, paymentTermsDays: 30, serviceLocationId: 'loc-1', serviceLocationName: 'Camelback Plaza · Suite 210',
  serviceLocationAddress: '2390 E Camelback Rd, Phoenix', workOrderId: 'wo-1', workOrderNumber: 'WO-4107', customerPoNumber: 'DR-55821',
  quoteId: 'q-1', quoteNumber: 'Q-2051', invoiceDate: '2026-10-11', dueDate: '2026-11-10', totalAmount: 1742.18,
  amountPaid: 500, balanceDue: 1242.18, overdue: false, lastSentAt: '2026-10-11T16:00:00Z',
  createdAt: '2026-10-11T00:00:00Z', updatedAt: '2026-10-11T00:00:00Z', ...over,
});
const page = (content: unknown[]) => ({ content, totalElements: content.length, totalPages: 1, page: 0, size: 25, first: true, last: true });
const views = {
  counts: { unpaid: 6, overdue: 2, draft: 2, paid: 3, all: 13, void: 2 },
  outstanding: 13570,
  overdueAmount: 8260,
};

const listParams = () =>
  vi
    .mocked(apiClient.get)
    .mock.calls.filter(([u]) => u === '/financial/invoices')
    .map(([, cfg]) => (cfg as { params: Record<string, unknown> }).params);

describe('InvoicesPage', () => {
  let rows: unknown[];
  beforeEach(() => {
    vi.clearAllMocks();
    rows = [row()];
    vi.mocked(apiClient.get).mockImplementation((url: string) => {
      if (url === '/financial/invoices') return Promise.resolve({ data: page(rows) });
      if (url === '/financial/invoices/views') return Promise.resolve({ data: views });
      if (url.includes('/config/') || url.startsWith('/tenant/dispatch-regions')) return Promise.resolve({ data: [] });
      return Promise.resolve({ data: [] });
    });
  });

  it('opens on Unpaid, with counts on the tabs and the outstanding totals', async () => {
    renderWithProviders(<InvoicesPage />, { initialPath: '/invoices' });

    expect(await screen.findByText('INV-3307')).toBeInTheDocument();
    expect(listParams()[0]).toMatchObject({ status: 'SENT,OVERDUE', page: 0, size: 25 });
    expect(await screen.findByText('$13,570.00')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Unpaid/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /Overdue/ })).toHaveTextContent('2');
  });

  it('shows where each invoice came from, who pays, the site and the PO', async () => {
    rows = [row(), row({ id: 'inv-2', invoiceNumber: 'INV-2204', status: 'VOID', quoteNumber: null, reissuedAsInvoiceNumber: 'INV-2219', voidedAt: '2026-10-10T12:00:00Z' })];
    renderWithProviders(<InvoicesPage />, { initialPath: '/invoices' });

    const sent = (await screen.findByText('INV-3307')).closest('tr')!;
    expect(sent).toHaveTextContent('from Q-2051');
    expect(sent).toHaveTextContent('Payer');
    expect(sent).toHaveTextContent('Net 30');
    expect(sent).toHaveTextContent('Camelback Plaza · Suite 210');
    expect(sent).toHaveTextContent('WO-4107');
    expect(sent).toHaveTextContent('DR-55821');
    // Some paid, some still owed.
    expect(sent).toHaveTextContent('Partial');
    expect(sent).toHaveTextContent('$1,242.18');
    const voided = screen.getByText('INV-2204').closest('tr')!;
    expect(voided).toHaveTextContent('Reissued as INV-2219');
    expect(voided).toHaveTextContent('Voided Oct 10');
  });

  it('switches tab to the matching server filter', async () => {
    const user = userEvent.setup();
    renderWithProviders(<InvoicesPage />, { initialPath: '/invoices' });

    await user.click(await screen.findByRole('tab', { name: /Overdue/ }));
    await waitFor(() => expect(listParams()).toContainEqual(expect.objectContaining({ overdue: true })));
    await user.click(screen.getByRole('tab', { name: /Void/ }));
    await waitFor(() => expect(listParams()).toContainEqual(expect.objectContaining({ status: 'VOID,CANCELLED' })));
  });

  it('keeps a Revenue report drill-down exact: billed invoices in a group', async () => {
    renderWithProviders(<InvoicesPage />, {
      initialPath: '/invoices?status=billed&from=2026-09-01&to=2026-09-30&division=none&region=r1',
    });
    await screen.findByText('INV-3307');
    expect(listParams()).toContainEqual(
      expect.objectContaining({ billed: true, from: '2026-09-01', to: '2026-09-30', noDivision: true, regionIds: ['r1'] }),
    );
    expect(screen.getByRole('button', { name: 'Status' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Division' })).toBeInTheDocument();
    // The counts cover the same dates and region.
    expect(apiClient.get).toHaveBeenCalledWith('/financial/invoices/views', {
      params: { from: '2026-09-01', to: '2026-09-30', regionIds: ['r1'] },
    });
  });

  it('searches the server', async () => {
    const user = userEvent.setup();
    renderWithProviders(<InvoicesPage />, { initialPath: '/invoices' });

    await user.type(await screen.findByRole('textbox', { name: /PO #/ }), 'DR-558');
    await waitFor(() => expect(listParams()).toContainEqual(expect.objectContaining({ q: 'DR-558' })));
  });
});
