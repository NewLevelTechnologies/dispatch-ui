import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../../test/utils';
import { StartDocumentDialog } from './StartDocumentDialog';
import { apiClient } from '../../api/setup';

vi.mock('@dispatch/api/src/client');

const camelback = {
  id: 'loc-2', customerId: 'cust-cp', customerName: 'Camelback Plaza', locationName: 'Camelback Plaza · Suite 210',
  premiseType: 'BUSINESS', address: { streetAddress: '2390 E CAMELBACK RD', city: 'PHOENIX', state: 'AZ', zipCode: '85016' },
  status: 'ACTIVE', openWorkOrderCount: 2,
};
const reyes = {
  id: 'loc-1', customerId: 'cust-tr', customerName: 'Tanya Reyes', locationName: null, premiseType: 'RESIDENCE',
  address: { streetAddress: '4821 E INDIAN SCHOOL RD', city: 'PHOENIX', state: 'AZ', zipCode: '85018' }, status: 'ACTIVE', openWorkOrderCount: 0,
};
const page = (content: unknown[]) => ({ content, totalElements: content.length, totalPages: 1, number: 0, size: 20 });
const rtu = { id: 'wo-4107', workOrderNumber: 'WO-4107', summary: 'RTU-2 not cooling', progressCategory: 'IN_PROGRESS', customerOrderNumber: 'DR-55821' };

const routes = (kind: 'quote' | 'invoice') => [
  { path: '/', element: <StartDocumentDialog kind={kind} onClose={() => {}} /> },
  // eslint-disable-next-line i18next/no-literal-string
  { path: '/invoices/:id', element: <div>Invoice page</div> },
  // eslint-disable-next-line i18next/no-literal-string
  { path: '/quotes/:id', element: <div>Quote page</div> },
];

describe('StartDocumentDialog', () => {
  let readyQuotes: unknown[];
  beforeEach(() => {
    vi.clearAllMocks();
    readyQuotes = [];
    vi.mocked(apiClient.get).mockImplementation((url: string, cfg?: { params?: Record<string, unknown> }) => {
      if (url === '/service-locations/recent') return Promise.resolve({ data: page([reyes, camelback]) });
      if (url === '/service-locations/search') return Promise.resolve({ data: page(cfg?.params?.q === 'camel' ? [camelback] : []) });
      if (url === '/customers/cust-cp') return Promise.resolve({ data: { id: 'cust-cp', name: 'Camelback Plaza', type: 'STANDARD', paymentTermsDays: 15 } });
      if (url === '/work-orders') return Promise.resolve({ data: page(cfg?.params?.unbilled ? [] : [rtu]) });
      if (url === '/financial/quotes') return Promise.resolve({ data: { content: readyQuotes, totalElements: readyQuotes.length } });
      if (url === '/financial/customers/cust-cp/rate-plan')
        return Promise.resolve({ data: { customerId: 'cust-cp', assignedRatePlanId: 'p-1', effective: { id: 'p-1', name: 'Property managers' } } });
      if (url === '/financial/service-locations/loc-2/tax-jurisdiction')
        return Promise.resolve({ data: { serviceLocationId: 'loc-2', assignedJurisdictionId: null, effective: { id: 'j-1', name: 'Phoenix, AZ', rate: 0.086 } } });
      if (url === '/work-orders/agreements') return Promise.resolve({ data: [{ id: 'ag-1', name: 'Comfort Club', status: 'ACTIVE' }] });
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });
  });

  it('finds a location, defaults the bill-to and job, shows what it prices with, and creates the draft', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.post).mockResolvedValue({ data: { id: 'inv-9' } });
    renderWithProviders(<div />, { routes: routes('invoice'), initialPath: '/' });

    const search = await screen.findByRole('combobox', { name: 'Search address, customer, or payer' });
    // Before typing: recent locations, the street when the site has no name.
    expect(await screen.findByText('4821 E Indian School Rd')).toBeInTheDocument();
    expect(screen.getByText('Tanya Reyes · Phoenix, AZ')).toBeInTheDocument();
    await user.type(search, 'camel');
    expect(await screen.findByText('2 open work orders')).toBeInTheDocument();
    await user.keyboard('{Enter}');

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('radio', { name: /Camelback Plaza.*Location default/ })).toBeChecked();
    expect(await within(dialog).findByText('Net 15', { exact: false })).toBeInTheDocument();
    // The one open job is picked for them.
    expect(await within(dialog).findByText("Shows on WO-4107's Quotes & invoices tab. Customer PO DR-55821 carries over.")).toBeInTheDocument();
    expect(await within(dialog).findByText('Property managers')).toBeInTheDocument();
    expect(within(dialog).getByText('Phoenix, AZ · 8.6%')).toBeInTheDocument();
    expect(within(dialog).getByText('Comfort Club')).toBeInTheDocument();
    expect(within(dialog).getByText('Dated when sent, due by the bill-to’s terms.')).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Create draft invoice' }));
    expect(apiClient.post).toHaveBeenCalledWith('/financial/invoices', { customerId: 'cust-cp', serviceLocationId: 'loc-2', workOrderId: 'wo-4107' });
    expect(await screen.findByText('Invoice page')).toBeInTheDocument();
  });

  it('points to the accepted quote when the job still has some to invoice', async () => {
    const user = userEvent.setup();
    readyQuotes = [{ id: 'q-1', quoteNumber: 'Q-2051', customerId: 'cust-cp', customerName: 'Camelback Plaza', remainingToInvoice: 990.55, status: 'ACCEPTED' }];
    renderWithProviders(<div />, { routes: routes('invoice'), initialPath: '/' });

    await user.type(await screen.findByRole('combobox', { name: 'Search address, customer, or payer' }), 'camel');
    await screen.findByText('2 open work orders');
    await user.keyboard('{Enter}');
    expect(await screen.findByText(/was accepted and has/)).toHaveTextContent('Q-2051 was accepted and has $990.55 not yet invoiced.');
    expect(apiClient.get).toHaveBeenCalledWith('/financial/quotes', { params: { workOrderId: 'wo-4107', readyToInvoice: true, size: 1 } });
  });

  it('bills someone else when asked', async () => {
    const user = userEvent.setup();
    renderWithProviders(<div />, { routes: routes('quote'), initialPath: '/' });

    await user.type(await screen.findByRole('combobox', { name: 'Search address, customer, or payer' }), 'camel');
    await screen.findByText('2 open work orders');
    await user.keyboard('{Enter}');
    await user.click(screen.getByRole('radio', { name: /Someone else/ }));
    // Nothing to create until the other account is picked.
    expect(screen.getByRole('button', { name: 'Create draft quote' })).toBeDisabled();
    expect(screen.getByText('Expiry is set when you send it.')).toBeInTheDocument();
  });
});
