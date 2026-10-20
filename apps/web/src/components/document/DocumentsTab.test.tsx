import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { useLocation, type RouteObject } from 'react-router-dom';
import { renderWithProviders, userEvent } from '../../test/utils';
import { apiClient } from '../../api/setup';
import { DocumentsTab } from './DocumentsTab';

vi.mock('@dispatch/api/src/client');

const views = {
  counts: { open: 1, all: 1, quote: 0, invoice: 1 },
  openQuotes: { count: 0, amount: 0 },
  due: 1240,
  overdue: 1240,
};
const invoiceRow = {
  kind: 'INVOICE',
  id: 'inv-1',
  invoice: {
    id: 'inv-1',
    invoiceNumber: 'INV-3318',
    status: 'OVERDUE',
    customerId: 'cust-1',
    customerName: 'Iverson Properties',
    serviceLocationId: 'loc-1',
    serviceLocationName: 'HQ',
    workOrderId: 'wo-1',
    workOrderNumber: 'WO-4188',
    invoiceDate: '2026-09-02',
    dueDate: '2026-10-02',
    subtotal: 1240,
    taxAmount: 0,
    totalAmount: 1240,
    amountPaid: 0,
    balanceDue: 1240,
    overdue: true,
    createdAt: '2026-09-02T00:00:00Z',
    updatedAt: '2026-09-02T00:00:00Z',
  },
};

const listCalls = () =>
  vi
    .mocked(apiClient.get)
    .mock.calls.filter(([u]) => u === '/financial/documents')
    .map(([, cfg]) => (cfg as { params: Record<string, unknown> }).params);

function Search() {
  return <div data-testid="search">{useLocation().search}</div>;
}

const render = (initialPath = '/customers/cust-1') => {
  const routes: RouteObject[] = [
    {
      path: '/customers/:id',
      element: (
        <>
          <DocumentsTab aging canStart showLocation scope={{ customerId: 'cust-1' }} />
          <Search />
        </>
      ),
    },
  ];
  return renderWithProviders(<div />, { routes, initialPath });
};

describe('DocumentsTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiClient.get).mockImplementation((url: string) => {
      if (url === '/financial/documents/views') return Promise.resolve({ data: views });
      if (url === '/financial/documents') {
        return Promise.resolve({
          data: { content: [invoiceRow], page: 0, size: 25, totalElements: 1, totalPages: 1, first: true, last: true },
        });
      }
      return Promise.resolve({ data: [] });
    });
  });

  it('shows the location column and the New buttons without a chosen location', async () => {
    render();
    expect(await screen.findByText('INV-3318')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /location/i })).toBeInTheDocument();
    expect(screen.getByText('HQ')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New quote' })).toBeInTheDocument();
    expect(listCalls()[0]).toMatchObject({ customerId: 'cust-1', view: 'open' });
    expect(listCalls()[0].agingBucket).toBeUndefined();
  });

  it('lands an aging link on that bucket’s invoices', async () => {
    render('/customers/cust-1?tab=invoices&invoicesAging=DAYS_91_PLUS');
    expect(await screen.findByText('INV-3318')).toBeInTheDocument();
    expect(listCalls()[0]).toMatchObject({ customerId: 'cust-1', view: 'invoice', agingBucket: 'DAYS_91_PLUS' });
    expect(screen.getByRole('radio', { name: /^Invoices/ })).toBeChecked();
    expect(screen.getByText('Aged 91+ days')).toBeInTheDocument();
  });

  it('clears the bucket from the chip', async () => {
    const user = userEvent.setup();
    render('/customers/cust-1?tab=invoices&invoicesAging=DAYS_1_30');
    await user.click(await screen.findByRole('button', { name: 'Clear aging filter' }));
    await waitFor(() => expect(screen.getByTestId('search')).not.toHaveTextContent('invoicesAging'));
    expect(screen.queryByText(/^Aged/)).not.toBeInTheDocument();
    await waitFor(() => expect(listCalls().at(-1)).toMatchObject({ view: 'open' }));
    expect(listCalls().at(-1)?.agingBucket).toBeUndefined();
  });

  it('drops the bucket when another view is picked', async () => {
    const user = userEvent.setup();
    render('/customers/cust-1?tab=invoices&invoicesAging=CURRENT');
    await screen.findByText('INV-3318');
    await user.click(screen.getByRole('radio', { name: /^All/ }));
    await waitFor(() => expect(screen.getByTestId('search')).not.toHaveTextContent('invoicesAging'));
    await waitFor(() => expect(listCalls().at(-1)).toMatchObject({ view: 'all' }));
    expect(listCalls().at(-1)?.agingBucket).toBeUndefined();
  });

  it('ignores an unknown bucket in the URL', async () => {
    render('/customers/cust-1?invoicesAging=NOPE');
    await screen.findByText('INV-3318');
    expect(listCalls()[0]).toMatchObject({ view: 'open' });
    expect(listCalls()[0].agingBucket).toBeUndefined();
  });
});
