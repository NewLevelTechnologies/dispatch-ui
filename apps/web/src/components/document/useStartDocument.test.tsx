/* eslint-disable i18next/no-literal-string -- test harness buttons and route placeholders. */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../../test/utils';
import { useStartDocument } from './useStartDocument';
import { apiClient, type ServiceLocationSearchResult } from '../../api/setup';

vi.mock('@dispatch/api/src/client');

const site: ServiceLocationSearchResult = {
  id: 'loc-1', customerId: 'cust-tr', customerName: 'Tanya Reyes', locationName: null, premiseType: 'RESIDENCE',
  address: { streetAddress: '4821 E INDIAN SCHOOL RD', city: 'PHOENIX', state: 'AZ', zipCode: '85018' }, status: 'ACTIVE',
};

function Harness({ withSite }: { withSite: boolean }) {
  const start = useStartDocument();
  return (
    <>
      <button onClick={() => void start.start('invoice', withSite ? site : undefined, 'Tanya Reyes')}>New invoice</button>
      {start.element}
    </>
  );
}

const routes = (withSite: boolean) => [
  { path: '/', element: <Harness withSite={withSite} /> },
  { path: '/invoices/:id', element: <div>Invoice page</div> },
];
const page = (content: unknown[]) => ({ content, totalElements: content.length, totalPages: 1, number: 0, size: 20 });

describe('useStartDocument', () => {
  let jobs: unknown[];
  beforeEach(() => {
    vi.clearAllMocks();
    jobs = [];
    vi.mocked(apiClient.get).mockImplementation((url: string) => {
      if (url === '/work-orders') return Promise.resolve({ data: page(jobs) });
      if (url === '/service-locations/recent' || url === '/service-locations/search') return Promise.resolve({ data: page([site]) });
      if (url === '/work-orders/agreements') return Promise.resolve({ data: [] });
      return Promise.resolve({ data: null });
    });
  });

  it('creates the draft straight away when the location has no job to link', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.post).mockResolvedValue({ data: { id: 'inv-9' } });
    renderWithProviders(<div />, { routes: routes(true), initialPath: '/' });

    await user.click(screen.getByRole('button', { name: 'New invoice' }));
    expect(await screen.findByText('Invoice page')).toBeInTheDocument();
    expect(apiClient.post).toHaveBeenCalledWith('/financial/invoices', { customerId: 'cust-tr', serviceLocationId: 'loc-1' });
  });

  it('opens the start dialog on the location when there’s a job to pick', async () => {
    const user = userEvent.setup();
    jobs = [{ id: 'wo-1', workOrderNumber: 'WO-3892', summary: 'AC not cooling', progressCategory: 'IN_PROGRESS' }];
    renderWithProviders(<div />, { routes: routes(true), initialPath: '/' });

    await user.click(screen.getByRole('button', { name: 'New invoice' }));
    expect(await screen.findByRole('button', { name: 'Change' })).toBeInTheDocument();
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it('searches the customer’s locations when there’s no single one', async () => {
    const user = userEvent.setup();
    renderWithProviders(<div />, { routes: routes(false), initialPath: '/' });

    await user.click(screen.getByRole('button', { name: 'New invoice' }));
    expect(await screen.findByRole('combobox', { name: 'Search address, customer, or payer' })).toHaveValue('Tanya Reyes');
  });
});
