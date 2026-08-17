import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import type { RouteObject } from 'react-router-dom';
import { renderWithProviders, userEvent } from '../test/utils';
import WorkOrderIntakePage from './WorkOrderIntakePage';

const mockCreateWorkOrder = vi.fn();
const mockCreateCustomer = vi.fn();
const mockGetServiceLocationById = vi.fn();
const mockGetCustomerById = vi.fn();
const mockTypesGetAll = vi.fn();
const mockDivisionsGetAll = vi.fn();
const mockRegionsGetAll = vi.fn();
const mockEquipmentList = vi.fn();

vi.mock('../api/workOrderApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/workOrderApi')>();
  return { ...actual, workOrderApi: { ...actual.workOrderApi, create: (...a: unknown[]) => mockCreateWorkOrder(...a) } };
});
vi.mock('../api/workOrderConfigApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/workOrderConfigApi')>();
  return {
    ...actual,
    workOrderTypesApi: { ...actual.workOrderTypesApi, getAll: (...a: unknown[]) => mockTypesGetAll(...a) },
    divisionsApi: { ...actual.divisionsApi, getAll: (...a: unknown[]) => mockDivisionsGetAll(...a) },
  };
});
vi.mock('../api/dispatchRegionApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/dispatchRegionApi')>();
  return { ...actual, dispatchRegionApi: { ...actual.dispatchRegionApi, getAll: (...a: unknown[]) => mockRegionsGetAll(...a) } };
});
vi.mock('../api/customerApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/customerApi')>();
  return {
    ...actual,
    customerApi: {
      ...actual.customerApi,
      create: (...a: unknown[]) => mockCreateCustomer(...a),
      getServiceLocationById: (...a: unknown[]) => mockGetServiceLocationById(...a),
      getById: (...a: unknown[]) => mockGetCustomerById(...a),
      searchServiceLocations: () => Promise.resolve({ content: [], totalElements: 0, totalPages: 0, size: 50, number: 0 }),
      getServiceLocations: () => Promise.resolve([]),
    },
  };
});
vi.mock('../api/equipmentApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/equipmentApi')>();
  return { ...actual, equipmentApi: { ...actual.equipmentApi, list: (...a: unknown[]) => mockEquipmentList(...a) } };
});
vi.mock('../api/tenantSettingsApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/tenantSettingsApi')>();
  return { ...actual, tenantSettingsApi: { ...actual.tenantSettingsApi, getSettings: () => Promise.resolve({ defaultPremiseType: 'BUSINESS' }) } };
});
vi.mock('../api/client');

const locationDetail = {
  id: 'loc-1',
  customerId: 'cust-1',
  customerName: 'Reyes Household',
  premiseType: 'RESIDENCE',
  dispatchRegionId: 'r-1',
  locationName: 'Reyes Residence',
  address: { streetAddress: '4821 E INDIAN SCHOOL RD', city: 'PHOENIX', state: 'AZ', zipCode: '85018' },
  additionalContacts: [],
  notes: [{ id: 'n1', body: 'Dog in the yard.', pinned: true, authorName: null, createdAt: '', updatedAt: '' }],
  arrivalFacts: [{ id: 'f1', label: 'Gate', value: '#4821', mono: true, multiline: false, authorName: null, authorUserId: null, displayOrder: 0, createdAt: '', updatedAt: '' }],
  status: 'ACTIVE' as const,
  createdAt: '',
  updatedAt: '',
  version: 1,
};

function renderIntake(initialPath = '/work-orders/new') {
  const routes: RouteObject[] = [
    { path: '/work-orders/new', element: <WorkOrderIntakePage /> },
    // eslint-disable-next-line i18next/no-literal-string
    { path: '*', element: <div>Elsewhere</div> },
  ];
  return renderWithProviders(<WorkOrderIntakePage />, { routes, initialPath });
}

describe('WorkOrderIntakePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTypesGetAll.mockResolvedValue([{ id: 'type-1', name: 'Service Call', isActive: true, sortOrder: 0 }]);
    mockDivisionsGetAll.mockResolvedValue([{ id: 'div-1', name: 'HVAC', isActive: true, sortOrder: 0 }]);
    mockRegionsGetAll.mockResolvedValue([]);
    mockGetServiceLocationById.mockResolvedValue(locationDetail);
    mockGetCustomerById.mockResolvedValue({ id: 'cust-1', name: 'Reyes Household' });
    mockEquipmentList.mockResolvedValue({ content: [], totalElements: 0, totalPages: 0, number: 0, size: 200 });
    mockCreateWorkOrder.mockResolvedValue({ id: 'wo-new' });
    mockCreateCustomer.mockResolvedValue({ id: 'cust-new', serviceLocations: [{ id: 'loc-new' }] });
  });

  it('renders the intake form with the location picker, classification and one work-item draft', async () => {
    renderIntake();
    expect(await screen.findByRole('heading', { name: /add work order/i, level: 1 })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/search by customer/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Type')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/no cooling upstairs/i)).toBeInTheDocument();
  });

  it('tints the selected priority with the tone that value carries elsewhere', async () => {
    const user = userEvent.setup();
    renderIntake();
    await screen.findByRole('heading', { name: /add work order/i, level: 1 });

    // Normal is the default, so it starts as the toned (info) selection.
    expect(screen.getByRole('radio', { name: 'Normal' })).toHaveAttribute('data-checked');
    expect(screen.getByRole('radio', { name: 'Normal' })).toHaveAttribute('data-tone', 'info');

    // Escalating repaints the control red rather than just moving the highlight.
    await user.click(screen.getByRole('radio', { name: 'Urgent' }));
    const urgent = screen.getByRole('radio', { name: 'Urgent' });
    expect(urgent).toHaveAttribute('data-checked');
    expect(urgent).toHaveAttribute('data-tone', 'danger');
    expect(screen.getByRole('radio', { name: 'Normal' })).not.toHaveAttribute('data-checked');
  });

  it('keeps the create button disabled until a location, type and a complaint are present', async () => {
    const user = userEvent.setup();
    renderIntake('/work-orders/new?locationId=loc-1');
    await screen.findByRole('heading', { name: /add work order/i, level: 1 });
    // Location is prefilled; still need a type + a complaint.
    const createBtn = screen.getByRole('button', { name: /add work order/i });
    expect(createBtn).toBeDisabled();

    await screen.findByRole('option', { name: 'Service Call' });
    await user.selectOptions(screen.getByLabelText('Type'), 'type-1');
    await user.type(screen.getByPlaceholderText(/no cooling upstairs/i), 'No cooling upstairs');
    expect(createBtn).toBeEnabled();
  });

  it('submits an atomic create with the derived customer + items and routes to the new detail', async () => {
    const user = userEvent.setup();
    const { router } = renderIntake('/work-orders/new?locationId=loc-1');
    await screen.findByRole('heading', { name: /add work order/i, level: 1 });
    await screen.findByRole('option', { name: 'Service Call' });

    await user.selectOptions(screen.getByLabelText('Type'), 'type-1');
    await user.type(screen.getByPlaceholderText(/no cooling upstairs/i), 'No cooling upstairs');
    await user.click(screen.getByRole('button', { name: /add work order/i }));

    await waitFor(() =>
      expect(mockCreateWorkOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          customerId: 'cust-1',
          serviceLocationId: 'loc-1',
          workOrderTypeId: 'type-1',
          workItems: [expect.objectContaining({ description: 'No cooling upstairs' })],
        })
      )
    );
    await waitFor(() => expect(router.state.location.pathname).toBe('/work-orders/wo-new'));
  });

  it('adds and removes work-item drafts', async () => {
    const user = userEvent.setup();
    renderIntake();
    await screen.findByRole('heading', { name: /add work order/i, level: 1 });
    expect(screen.getAllByPlaceholderText(/no cooling upstairs/i)).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: /add work item/i }));
    expect(screen.getAllByPlaceholderText(/no cooling upstairs/i)).toHaveLength(2);

    await user.click(screen.getAllByRole('button', { name: /remove work item/i })[0]);
    expect(screen.getAllByPlaceholderText(/no cooling upstairs/i)).toHaveLength(1);
  });

  it('creates the customer first in new-customer mode, then the work order', async () => {
    // A single region auto-selects, satisfying the required region field.
    mockRegionsGetAll.mockResolvedValue([{ id: 'r-1', name: 'West' }]);
    const user = userEvent.setup();
    const { router } = renderIntake();
    await screen.findByRole('heading', { name: /add work order/i, level: 1 });
    await screen.findByRole('option', { name: 'Service Call' });

    await user.click(screen.getByRole('radio', { name: /new customer & location/i }));
    // ONE name — no separate "location name" over-ask.
    await user.type(screen.getByLabelText(/^name/i), 'Jordan Avila');
    await user.type(screen.getByLabelText(/^phone/i), '6025550100');
    await user.type(screen.getByLabelText(/^email/i), 'jordan@example.com');
    await user.type(screen.getByLabelText(/street address/i), '123 Main St');
    await user.type(screen.getByLabelText(/^city/i), 'Phoenix');
    await user.type(screen.getByLabelText(/^state/i), 'AZ');
    await user.type(screen.getByLabelText(/^zip/i), '85001');
    await user.selectOptions(screen.getByLabelText('Type'), 'type-1');
    await user.type(screen.getByPlaceholderText(/no cooling upstairs/i), 'No heat');

    await user.click(screen.getByRole('button', { name: /add work order/i }));

    // One name seeds both the customer and its first location.
    await waitFor(() =>
      expect(mockCreateCustomer).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Jordan Avila',
          serviceLocations: [expect.objectContaining({ locationName: 'Jordan Avila' })],
        })
      )
    );
    await waitFor(() =>
      expect(mockCreateWorkOrder).toHaveBeenCalledWith(
        expect.objectContaining({ customerId: 'cust-new', serviceLocationId: 'loc-new' })
      )
    );
    await waitFor(() => expect(router.state.location.pathname).toBe('/work-orders/wo-new'));
  });
});
