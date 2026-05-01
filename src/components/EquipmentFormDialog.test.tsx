import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import EquipmentFormDialog from './EquipmentFormDialog';
import type { Equipment } from '../api';

const mockEquipmentCreate = vi.fn();
const mockEquipmentUpdate = vi.fn();
const mockEquipmentTypesGetAll = vi.fn();
const mockEquipmentCategoriesGetAll = vi.fn();
const mockCustomerGetAllPaginated = vi.fn();
const mockCustomerGetServiceLocations = vi.fn();

vi.mock('../api/equipmentApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/equipmentApi')>();
  return {
    ...actual,
    equipmentApi: {
      create: (...args: unknown[]) => mockEquipmentCreate(...args),
      update: (...args: unknown[]) => mockEquipmentUpdate(...args),
    },
    equipmentTypesApi: {
      getAll: (...args: unknown[]) => mockEquipmentTypesGetAll(...args),
    },
    equipmentCategoriesApi: {
      getAll: (...args: unknown[]) => mockEquipmentCategoriesGetAll(...args),
    },
  };
});

vi.mock('../api/customerApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/customerApi')>();
  return {
    ...actual,
    customerApi: {
      getAllPaginated: (...args: unknown[]) => mockCustomerGetAllPaginated(...args),
      getServiceLocations: (...args: unknown[]) => mockCustomerGetServiceLocations(...args),
    },
  };
});

vi.mock('../api/client');

const mockTypes = [
  { id: 't-hvac', tenantId: 't', name: 'HVAC', sortOrder: 0, archivedAt: null, createdAt: '', updatedAt: '' },
  { id: 't-refrig', tenantId: 't', name: 'Refrigeration', sortOrder: 1, archivedAt: null, createdAt: '', updatedAt: '' },
];

const mockCategories = [
  { id: 'c-furnace', tenantId: 't', equipmentTypeId: 't-hvac', name: 'Furnace', sortOrder: 0, archivedAt: null, createdAt: '', updatedAt: '' },
];

const mockCustomers = {
  content: [
    { id: 'cust-1', name: 'Acme Restaurant' },
    { id: 'cust-2', name: 'Bob Properties' },
  ],
  totalElements: 2,
  totalPages: 1,
  number: 0,
  size: 50,
};

const mockLocations = [
  { id: 'loc-1', locationName: 'Main Kitchen', address: { streetAddress: '123 Main', city: 'Anytown', state: 'CA', zipCode: '90210' } },
  { id: 'loc-2', address: { streetAddress: '456 Side', city: 'Anytown', state: 'CA', zipCode: '90210' } },
];

const existingEquipment: Equipment = {
  id: 'eq-1',
  name: 'Walk-in Freezer',
  description: 'Main kitchen unit',
  make: 'Hoshizaki',
  model: 'WF-100',
  serialNumber: 'SN999',
  assetTag: 'TAG-1',
  parentId: null,
  equipmentTypeId: 't-refrig',
  equipmentTypeName: 'Refrigeration',
  equipmentCategoryId: null,
  equipmentCategoryName: null,
  serviceLocationId: 'loc-1',
  locationOnSite: 'Kitchen Back',
  installDate: '2022-06-15',
  lastServicedAt: null,
  status: 'ACTIVE',
  profileImageUrl: null,
};

describe('EquipmentFormDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEquipmentTypesGetAll.mockResolvedValue(mockTypes);
    mockEquipmentCategoriesGetAll.mockResolvedValue(mockCategories);
    mockCustomerGetAllPaginated.mockResolvedValue(mockCustomers);
    mockCustomerGetServiceLocations.mockResolvedValue(mockLocations);
  });

  it('renders nothing when closed', () => {
    renderWithProviders(<EquipmentFormDialog isOpen={false} onClose={vi.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders create mode with empty form', async () => {
    renderWithProviders(<EquipmentFormDialog isOpen={true} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    // Customer + service location selectors only in create mode
    expect(screen.getByLabelText(/customer/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/service location/i)).toBeInTheDocument();
    expect((screen.getByLabelText(/^name/i) as HTMLInputElement).value).toBe('');
  });

  it('cascades service locations when a customer is picked', async () => {
    const user = userEvent.setup();
    renderWithProviders(<EquipmentFormDialog isOpen={true} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Acme Restaurant')).toBeInTheDocument();
    });

    const serviceLocSelect = screen.getByLabelText(/service location/i);
    expect(serviceLocSelect).toBeDisabled();

    await user.selectOptions(screen.getByLabelText(/customer/i), 'cust-1');

    await waitFor(() => {
      expect(mockCustomerGetServiceLocations).toHaveBeenCalledWith('cust-1');
    });
    await waitFor(() => {
      expect(serviceLocSelect).not.toBeDisabled();
    });
    await waitFor(() => {
      expect(screen.getByText('Main Kitchen')).toBeInTheDocument();
    });
  });

  it('cascades categories when a type is picked', async () => {
    const user = userEvent.setup();
    renderWithProviders(<EquipmentFormDialog isOpen={true} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('HVAC')).toBeInTheDocument();
    });

    const categorySelect = screen.getByLabelText(/category/i);
    expect(categorySelect).toBeDisabled();

    await user.selectOptions(screen.getByLabelText(/^type$/i), 't-hvac');

    await waitFor(() => {
      expect(mockEquipmentCategoriesGetAll).toHaveBeenCalledWith('t-hvac');
    });
    await waitFor(() => {
      expect(categorySelect).not.toBeDisabled();
    });
  });

  it('submits a create with all fields filled in', async () => {
    mockEquipmentCreate.mockResolvedValue({ id: 'new-eq' });
    const onClose = vi.fn();
    const user = userEvent.setup();

    renderWithProviders(<EquipmentFormDialog isOpen={true} onClose={onClose} />);

    await waitFor(() => expect(screen.getByText('Acme Restaurant')).toBeInTheDocument());
    await user.selectOptions(screen.getByLabelText(/customer/i), 'cust-1');
    await waitFor(() => expect(screen.getByText('Main Kitchen')).toBeInTheDocument());
    await user.selectOptions(screen.getByLabelText(/service location/i), 'loc-1');

    // Touch every field so each onChange handler is exercised.
    await user.type(screen.getByLabelText(/^name/i), 'New Furnace');
    await user.type(screen.getByLabelText(/^description/i), 'A description');
    await user.type(screen.getByLabelText(/make/i), 'Carrier');
    await user.type(screen.getByLabelText(/^model$/i), 'C-200');
    await user.type(screen.getByLabelText(/serial number/i), 'SN-1');
    await user.type(screen.getByLabelText(/asset tag/i), 'A-1');

    await user.selectOptions(screen.getByLabelText(/^type$/i), 't-hvac');
    await waitFor(() => {
      expect(screen.getByLabelText(/category/i)).not.toBeDisabled();
    });
    await user.selectOptions(screen.getByLabelText(/category/i), 'c-furnace');

    await user.type(screen.getByLabelText(/location on site/i), 'Roof');
    await user.type(screen.getByLabelText(/install date/i), '2024-03-15');

    await user.click(screen.getByRole('button', { name: /create/i }));

    await waitFor(() => {
      expect(mockEquipmentCreate).toHaveBeenCalled();
    });
    const payload = mockEquipmentCreate.mock.calls[0][0];
    expect(payload).toMatchObject({
      name: 'New Furnace',
      serviceLocationId: 'loc-1',
      description: 'A description',
      make: 'Carrier',
      model: 'C-200',
      serialNumber: 'SN-1',
      assetTag: 'A-1',
      equipmentTypeId: 't-hvac',
      equipmentCategoryId: 'c-furnace',
      locationOnSite: 'Roof',
      installDate: '2024-03-15',
    });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('hydrates edit mode with existing equipment values and submits update', async () => {
    mockEquipmentUpdate.mockResolvedValue(existingEquipment);
    const onClose = vi.fn();
    const user = userEvent.setup();

    renderWithProviders(
      <EquipmentFormDialog isOpen={true} onClose={onClose} equipment={existingEquipment} />
    );

    await waitFor(() => {
      expect((screen.getByLabelText(/^name/i) as HTMLInputElement).value).toBe('Walk-in Freezer');
    });

    // Customer/service-location selectors are absent in edit mode
    expect(screen.queryByLabelText(/customer/i)).not.toBeInTheDocument();

    expect((screen.getByLabelText(/make/i) as HTMLInputElement).value).toBe('Hoshizaki');
    expect((screen.getByLabelText(/^model$/i) as HTMLInputElement).value).toBe('WF-100');
    expect(screen.getByLabelText(/status/i)).toBeInTheDocument();

    // Edit a field and submit
    const nameInput = screen.getByLabelText(/^name/i);
    await user.clear(nameInput);
    await user.type(nameInput, 'Renamed Freezer');
    // Toggle status to RETIRED to exercise the status onChange handler
    await user.selectOptions(screen.getByLabelText(/status/i), 'RETIRED');
    await user.click(screen.getByRole('button', { name: /update/i }));

    await waitFor(() => {
      expect(mockEquipmentUpdate).toHaveBeenCalled();
    });
    const [id, data] = mockEquipmentUpdate.mock.calls[0];
    expect(id).toBe('eq-1');
    expect(data.name).toBe('Renamed Freezer');
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('shows an error banner when create fails', async () => {
    mockEquipmentCreate.mockRejectedValue(
      Object.assign(new Error('boom'), {
        response: { data: { message: 'Service location not found' } },
      })
    );
    const user = userEvent.setup();

    renderWithProviders(<EquipmentFormDialog isOpen={true} onClose={vi.fn()} />);

    await waitFor(() => expect(screen.getByText('Acme Restaurant')).toBeInTheDocument());
    await user.selectOptions(screen.getByLabelText(/customer/i), 'cust-1');
    await waitFor(() => expect(screen.getByText('Main Kitchen')).toBeInTheDocument());
    await user.selectOptions(screen.getByLabelText(/service location/i), 'loc-1');
    await user.type(screen.getByLabelText(/^name/i), 'Anything');

    await user.click(screen.getByRole('button', { name: /create/i }));

    await waitFor(() => {
      expect(screen.getByText('Service location not found')).toBeInTheDocument();
    });
  });

  it('shows an error banner when update fails', async () => {
    mockEquipmentUpdate.mockRejectedValue(
      Object.assign(new Error('boom'), {
        response: { data: { message: 'Update failed' } },
      })
    );
    const user = userEvent.setup();

    renderWithProviders(
      <EquipmentFormDialog isOpen={true} onClose={vi.fn()} equipment={existingEquipment} />
    );

    await waitFor(() => {
      expect((screen.getByLabelText(/^name/i) as HTMLInputElement).value).toBe('Walk-in Freezer');
    });
    await user.click(screen.getByRole('button', { name: /update/i }));
    await waitFor(() => {
      expect(screen.getByText('Update failed')).toBeInTheDocument();
    });
  });

  it('cancel button calls onClose', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<EquipmentFormDialog isOpen={true} onClose={onClose} />);
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
