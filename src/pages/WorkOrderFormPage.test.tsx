import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../test/utils';
import WorkOrderFormPage from './WorkOrderFormPage';
import apiClient from '../api/client';
import type { RouteObject } from 'react-router-dom';
import type { ServiceLocationDetailDto } from '../api';

vi.mock('../api/client');

const mockLocation: ServiceLocationDetailDto = {
  id: 'loc-1',
  customerId: 'cust-1',
  customerName: 'Tenant 2 Inc.',
  premiseType: 'RESIDENCE',
  dispatchRegionId: 'region-1',
  locationName: "Paul's House",
  address: { streetAddress: '1942 LENOX RD NE', city: 'ATLANTA', state: 'GA', zipCode: '30306-3035' },
  additionalContacts: [],
  status: 'ACTIVE',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  version: 1,
};

const TYPES_RESPONSE = {
  workOrderTypes: [
    { id: 'type-1', name: 'HVAC Service', code: 'HVAC', accentId: 'blue', isActive: true, sortOrder: 0 },
  ],
  colorsInUse: {},
};

describe('WorkOrderFormPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockGets = (location: ServiceLocationDetailDto | null = mockLocation) => {
    vi.mocked(apiClient.get).mockImplementation((url) => {
      if (url.includes('/work-orders/config/types')) return Promise.resolve({ data: TYPES_RESPONSE });
      if (url.includes('/work-orders/config/divisions')) return Promise.resolve({ data: [] });
      if (url.match(/\/service-locations\/[^/]+$/)) {
        return location ? Promise.resolve({ data: location }) : Promise.reject(new Error('not found'));
      }
      if (url.match(/\/customers\/[^/]+$/)) {
        return Promise.resolve({ data: { id: 'cust-1', name: 'Tenant 2 Inc.' } });
      }
      return Promise.reject(new Error(`Unmocked: ${url}`));
    });
  };

  const renderPage = (initialPath = '/work-orders/new') => {
    /* eslint-disable i18next/no-literal-string -- test-only placeholder routes */
    const routes: RouteObject[] = [
      { path: '/work-orders/new', element: <WorkOrderFormPage /> },
      { path: '/work-orders/:id', element: <div>Detail Page</div> },
      { path: '/work-orders', element: <div>Work Orders List</div> },
      { path: '/customers/new', element: <div>New Customer</div> },
    ];
    /* eslint-enable i18next/no-literal-string */
    return renderWithProviders(<WorkOrderFormPage />, { routes, initialPath });
  };

  it('renders the New Job form with its sections', async () => {
    mockGets();
    renderPage();
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /add work order/i })).toBeInTheDocument();
    });
    expect(screen.getByText('Complaint')).toBeInTheDocument();
  });

  it('disables submit until a location and a complaint are present', async () => {
    mockGets();
    renderPage();
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /add work order/i })).toBeInTheDocument();
    });
    // No location picked, no complaint → the create button is disabled.
    const buttons = screen.getAllByRole('button', { name: /add work order/i });
    const submit = buttons[buttons.length - 1];
    expect(submit).toBeDisabled();
  });

  it('adds and removes work-item drafts', async () => {
    const user = userEvent.setup();
    mockGets();
    renderPage();
    await waitFor(() => expect(screen.getByText('Complaint')).toBeInTheDocument());

    expect(screen.getAllByText('Complaint')).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: /add work item/i }));
    expect(screen.getAllByText('Complaint')).toHaveLength(2);

    // Each extra draft has a remove (trash) button.
    const removeButtons = screen.getAllByRole('button', { name: /delete/i });
    await user.click(removeButtons[removeButtons.length - 1]);
    expect(screen.getAllByText('Complaint')).toHaveLength(1);
  });

  it('prefills the location from ?locationId and submits the atomic create payload', async () => {
    const user = userEvent.setup();
    mockGets();
    vi.mocked(apiClient.post).mockResolvedValue({ data: { id: 'wo-new' } });
    renderPage('/work-orders/new?locationId=loc-1');

    // Location prefilled → summary shows the derived payer.
    await waitFor(() => {
      expect(screen.getByText('Tenant 2 Inc.')).toBeInTheDocument();
    });

    await user.selectOptions(screen.getByLabelText(/type/i), 'type-1');
    await user.type(screen.getByLabelText(/complaint/i), 'No cooling upstairs');

    const buttons = screen.getAllByRole('button', { name: /add work order/i });
    await user.click(buttons[buttons.length - 1]);

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        '/work-orders',
        expect.objectContaining({
          customerId: 'cust-1',
          serviceLocationId: 'loc-1',
          workOrderTypeId: 'type-1',
          priority: 'NORMAL',
          workItems: [{ description: 'No cooling upstairs', equipmentId: undefined }],
        }),
      );
    });
    // Routes to the new WO detail.
    expect(await screen.findByText('Detail Page')).toBeInTheDocument();
  });

  it('prefills the customer from ?customerId', async () => {
    mockGets();
    renderPage('/work-orders/new?customerId=cust-1');
    await waitFor(() => {
      expect(apiClient.get).toHaveBeenCalledWith(expect.stringMatching(/\/customers\/cust-1$/));
    });
  });
});
