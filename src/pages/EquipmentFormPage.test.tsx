import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import type { RouteObject } from 'react-router-dom';
import { renderWithProviders, userEvent } from '../test/utils';
import EquipmentFormPage from './EquipmentFormPage';

const mockList = vi.fn();
const mockGetById = vi.fn();
const mockCreate = vi.fn();
const mockUpdate = vi.fn();
const mockTypesGetAll = vi.fn();
const mockCategoriesGetAll = vi.fn();
const mockGetServiceLocationById = vi.fn();

vi.mock('../api/equipmentApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/equipmentApi')>();
  return {
    ...actual,
    equipmentApi: {
      list: (...args: unknown[]) => mockList(...args),
      getById: (...args: unknown[]) => mockGetById(...args),
      create: (...args: unknown[]) => mockCreate(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
    },
    equipmentTypesApi: { getAll: (...args: unknown[]) => mockTypesGetAll(...args) },
    equipmentCategoriesApi: { getAll: (...args: unknown[]) => mockCategoriesGetAll(...args) },
  };
});

vi.mock('../api/customerApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/customerApi')>();
  return {
    ...actual,
    customerApi: {
      getServiceLocationById: (...args: unknown[]) => mockGetServiceLocationById(...args),
      getAllPaginated: () => Promise.resolve({ content: [], totalElements: 0, totalPages: 0, number: 0, size: 50 }),
      getServiceLocations: () => Promise.resolve([]),
    },
  };
});

vi.mock('../api/client');

const hvacType = { id: 't-hvac', tenantId: 't', name: 'HVAC', sortOrder: 0, archivedAt: null, createdAt: '', updatedAt: '' };
const rtuCategory = { id: 'c-rtu', tenantId: 't', equipmentTypeId: 't-hvac', name: 'Rooftop', sortOrder: 0, archivedAt: null, createdAt: '', updatedAt: '' };
const headquarters = {
  id: 'loc-1',
  customerId: 'cust-1',
  customerName: 'Iverson Properties LLC',
  locationName: 'Headquarters',
  premiseType: 'BUSINESS',
  dispatchRegionId: '',
  address: { streetAddress: '1820 W McDowell Rd', city: 'Phoenix', state: 'AZ', zipCode: '85007' },
  additionalContacts: [],
};

const page = (content: unknown[]) => ({ content, totalElements: content.length, totalPages: 1, number: 0, size: 200, first: true, last: true });

function renderScopedAdd(initialPath = '/service-locations/loc-1/equipment/new') {
  const routes: RouteObject[] = [
    { path: '/service-locations/:locId/equipment/new', element: <EquipmentFormPage /> },
    // eslint-disable-next-line i18next/no-literal-string
    { path: '*', element: <div>Elsewhere</div> },
  ];
  return renderWithProviders(<EquipmentFormPage />, { routes, initialEntries: [initialPath] });
}

function renderEdit(id = 'eq-9') {
  const routes: RouteObject[] = [
    { path: '/equipment/:id/edit', element: <EquipmentFormPage /> },
    // eslint-disable-next-line i18next/no-literal-string
    { path: '*', element: <div>Elsewhere</div> },
  ];
  return renderWithProviders(<EquipmentFormPage />, { routes, initialEntries: [`/equipment/${id}/edit`] });
}

describe('EquipmentFormPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTypesGetAll.mockResolvedValue([hvacType]);
    mockCategoriesGetAll.mockResolvedValue([rtuCategory]);
    mockGetServiceLocationById.mockResolvedValue(headquarters);
    mockList.mockResolvedValue(page([]));
    mockCreate.mockResolvedValue({ id: 'eq-new' });
    mockUpdate.mockResolvedValue({ id: 'eq-9' });
  });

  it('renders scoped-add header with the location context and cascades category off type', async () => {
    const user = userEvent.setup();
    renderScopedAdd();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /add equipment/i, level: 1 })).toBeInTheDocument();
    });
    // "At Headquarters" context resolves once the location loads (also echoed in the footer).
    expect((await screen.findAllByText('Headquarters')).length).toBeGreaterThan(0);

    // Category select is disabled until a type is chosen; selecting HVAC enables it.
    const selects = () => screen.getAllByRole('combobox');
    expect(selects()[1]).toBeDisabled();

    await screen.findByRole('option', { name: 'HVAC' });
    await user.selectOptions(selects()[0], 't-hvac');
    await waitFor(() => expect(screen.getByRole('option', { name: 'Rooftop' })).toBeInTheDocument());
    expect(selects()[1]).toBeEnabled();
  });

  it('gates validation until submit and does not create when required fields are empty', async () => {
    const user = userEvent.setup();
    renderScopedAdd();
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /add equipment/i, level: 1 })).toBeInTheDocument();
    });

    // Fresh form shows no inline errors.
    expect(screen.queryByText('Required')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /add equipment/i }));

    expect(mockCreate).not.toHaveBeenCalled();
    expect(screen.getAllByText('Required').length).toBeGreaterThan(0);
  });

  it('submits a create request with the classification + identity and navigates to the unit', async () => {
    const user = userEvent.setup();
    const { router } = renderScopedAdd();
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /add equipment/i, level: 1 })).toBeInTheDocument();
    });

    const selects = () => screen.getAllByRole('combobox');
    await screen.findByRole('option', { name: 'HVAC' });
    await user.selectOptions(selects()[0], 't-hvac');
    await waitFor(() => expect(screen.getByRole('option', { name: 'Rooftop' })).toBeInTheDocument());
    await user.selectOptions(selects()[1], 'c-rtu');
    await user.type(screen.getByPlaceholderText(/RTU-3/), 'RTU-7');

    await user.click(screen.getByRole('button', { name: /add equipment/i }));

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'RTU-7',
          serviceLocationId: 'loc-1',
          equipmentTypeId: 't-hvac',
          equipmentCategoryId: 'c-rtu',
          parentId: null,
        })
      );
    });
    await waitFor(() => expect(router.state.location.pathname).toBe('/equipment/eq-new'));
  });

  it('threads ?parent into the sub-unit context and the create payload', async () => {
    mockGetById.mockResolvedValue({ id: 'eq-parent', name: 'RTU-3', serviceLocationId: 'loc-1', status: 'ACTIVE' });
    const user = userEvent.setup();
    renderScopedAdd('/service-locations/loc-1/equipment/new?parent=eq-parent');

    // Parent name appears in both the sub-unit context line and the footer.
    expect((await screen.findAllByText('RTU-3')).length).toBeGreaterThan(0);

    const selects = () => screen.getAllByRole('combobox');
    await screen.findByRole('option', { name: 'HVAC' });
    await user.selectOptions(selects()[0], 't-hvac');
    await waitFor(() => expect(screen.getByRole('option', { name: 'Rooftop' })).toBeInTheDocument());
    await user.selectOptions(selects()[1], 'c-rtu');
    await user.type(screen.getByPlaceholderText(/RTU-3/), 'Compressor');

    await user.click(screen.getByRole('button', { name: /add equipment/i }));

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ parentId: 'eq-parent' }));
    });
  });

  it('prefills from the record in edit mode and submits an update', async () => {
    mockGetById.mockResolvedValue({
      id: 'eq-9',
      name: 'Upstairs Furnace',
      serviceLocationId: 'loc-1',
      status: 'ACTIVE',
      equipmentTypeId: 't-hvac',
      equipmentCategoryId: 'c-rtu',
      make: 'Carrier',
      parentId: null,
      descendantCount: 0,
    });
    const user = userEvent.setup();
    const { router } = renderEdit('eq-9');

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /edit equipment/i, level: 1 })).toBeInTheDocument();
    });
    const nameInput = screen.getByPlaceholderText(/RTU-3/) as HTMLInputElement;
    expect(nameInput.value).toBe('Upstairs Furnace');

    await user.clear(nameInput);
    await user.type(nameInput, 'Rooftop Unit 9');
    await user.click(screen.getByRole('button', { name: /edit equipment/i }));

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith('eq-9', expect.objectContaining({ name: 'Rooftop Unit 9' }));
    });
    await waitFor(() => expect(router.state.location.pathname).toBe('/equipment/eq-9'));
  });
});
