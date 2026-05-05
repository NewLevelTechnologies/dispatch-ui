import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import EquipmentFormDialog from './EquipmentFormDialog';
import type { Equipment } from '../api';

const mockEquipmentCreate = vi.fn();
const mockEquipmentUpdate = vi.fn();
const mockEquipmentTypesGetAll = vi.fn();
const mockEquipmentCategoriesGetAll = vi.fn();
const mockSearchServiceLocations = vi.fn();
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
      searchServiceLocations: (...args: unknown[]) => mockSearchServiceLocations(...args),
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

const mockSearchResults = {
  content: [
    {
      id: 'loc-1',
      customerId: 'cust-1',
      customerName: 'Acme Restaurant',
      locationName: 'Main Kitchen',
      address: { streetAddress: '123 Main St', city: 'Atlanta', state: 'GA', zipCode: '30301' },
      siteContactName: null,
      siteContactPhone: null,
      status: 'ACTIVE' as const,
    },
  ],
  totalElements: 1,
  totalPages: 1,
  size: 50,
  number: 0,
};

const mockCustomerLocations = [
  {
    id: 'loc-1',
    customerId: 'cust-1',
    locationName: 'Main Kitchen',
    address: { streetAddress: '123 Main St', city: 'Atlanta', state: 'GA', zipCode: '30301' },
    siteContactName: null,
    siteContactPhone: null,
    status: 'ACTIVE' as const,
  },
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
  warrantyExpiresAt: '2027-06-15',
  warrantyDetails: 'Original 5-year parts & labor',
  status: 'ACTIVE',
  profileImageUrl: null,
};

describe('EquipmentFormDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEquipmentTypesGetAll.mockResolvedValue(mockTypes);
    mockEquipmentCategoriesGetAll.mockResolvedValue(mockCategories);
    mockSearchServiceLocations.mockResolvedValue(mockSearchResults);
    mockCustomerGetServiceLocations.mockResolvedValue(mockCustomerLocations);
  });

  it('renders nothing when closed', () => {
    renderWithProviders(<EquipmentFormDialog isOpen={false} onClose={vi.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders create mode with location picker (no customer dropdown)', async () => {
    renderWithProviders(<EquipmentFormDialog isOpen={true} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    // Location picker present, no customer Select
    expect(screen.getByPlaceholderText(/search by customer, address/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^customer/i)).not.toBeInTheDocument();
    // Status is hidden on create
    expect(screen.queryByLabelText(/^status$/i)).not.toBeInTheDocument();
    expect((screen.getByLabelText(/^name/i) as HTMLInputElement).value).toBe('');
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

  it('submits a create with picker-selected location and remaining fields', async () => {
    mockEquipmentCreate.mockResolvedValue({ id: 'new-eq' });
    const onClose = vi.fn();
    const user = userEvent.setup();

    renderWithProviders(<EquipmentFormDialog isOpen={true} onClose={onClose} />);

    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());

    // Drive the picker via typing → select first result
    const pickerInput = screen.getByPlaceholderText(/search by customer, address/i);
    await user.type(pickerInput, 'main');

    await waitFor(() => {
      expect(mockSearchServiceLocations).toHaveBeenCalled();
    });
    const option = await screen.findByRole('button', { name: /Main Kitchen/i });
    await user.click(option);

    // Touch every field so each onChange handler is exercised.
    await user.type(screen.getByLabelText(/^name/i), 'New Furnace');
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
    await user.type(screen.getByLabelText(/warranty expires/i), '2030-01-01');
    await user.type(screen.getByLabelText(/warranty details/i), '5-year parts');
    await user.type(screen.getByLabelText(/^description/i), 'A description');

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
      warrantyExpiresAt: '2030-01-01',
      warrantyDetails: '5-year parts',
    });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('hides the picker and submits with the locked service location id', async () => {
    mockEquipmentCreate.mockResolvedValue({ id: 'new-eq' });
    const onClose = vi.fn();
    const user = userEvent.setup();

    renderWithProviders(
      <EquipmentFormDialog
        isOpen={true}
        onClose={onClose}
        lockedServiceLocationId="loc-locked"
      />
    );

    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    expect(screen.queryByPlaceholderText(/search by customer, address/i)).not.toBeInTheDocument();

    await user.type(screen.getByLabelText(/^name/i), 'Locked Eq');
    await user.click(screen.getByRole('button', { name: /create/i }));

    await waitFor(() => {
      expect(mockEquipmentCreate).toHaveBeenCalled();
    });
    expect(mockEquipmentCreate.mock.calls[0][0]).toMatchObject({
      name: 'Locked Eq',
      serviceLocationId: 'loc-locked',
    });
  });

  it('lockedCustomer restricts the picker to that customer (opens on focus)', async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <EquipmentFormDialog
        isOpen={true}
        onClose={vi.fn()}
        lockedCustomer={{ id: 'cust-1', name: 'Acme Restaurant' }}
      />
    );

    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());

    // Picker hits the customer's locations endpoint, not tenant-wide search
    await waitFor(() => {
      expect(mockCustomerGetServiceLocations).toHaveBeenCalledWith('cust-1');
    });

    // Focus opens the dropdown without typing (restrictToCustomer mode)
    const pickerInput = screen.getByPlaceholderText(/search by customer, address/i);
    await user.click(pickerInput);
    await waitFor(() => {
      expect(screen.getByText('Main Kitchen')).toBeInTheDocument();
    });
    expect(mockSearchServiceLocations).not.toHaveBeenCalled();
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

    // Picker is hidden in edit mode
    expect(screen.queryByPlaceholderText(/search by customer, address/i)).not.toBeInTheDocument();

    expect((screen.getByLabelText(/make/i) as HTMLInputElement).value).toBe('Hoshizaki');
    expect((screen.getByLabelText(/^model$/i) as HTMLInputElement).value).toBe('WF-100');
    expect((screen.getByLabelText(/warranty expires/i) as HTMLInputElement).value).toBe('2027-06-15');
    expect((screen.getByLabelText(/warranty details/i) as HTMLInputElement).value).toBe(
      'Original 5-year parts & labor'
    );
    // Status renders as a segmented toggle on edit; Active is on by default
    const activeBtn = screen.getByRole('button', { name: 'Active' });
    expect(activeBtn).toHaveAttribute('aria-pressed', 'true');

    const nameInput = screen.getByLabelText(/^name/i);
    await user.clear(nameInput);
    await user.type(nameInput, 'Renamed Freezer');
    await user.click(screen.getByRole('button', { name: 'Retired' }));
    await user.click(screen.getByRole('button', { name: /update/i }));

    await waitFor(() => {
      expect(mockEquipmentUpdate).toHaveBeenCalled();
    });
    const [id, data] = mockEquipmentUpdate.mock.calls[0];
    expect(id).toBe('eq-1');
    expect(data.name).toBe('Renamed Freezer');
    expect(data.status).toBe('RETIRED');
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('shows an error banner when create fails', async () => {
    mockEquipmentCreate.mockRejectedValue(
      Object.assign(new Error('boom'), {
        response: { data: { message: 'Service location not found' } },
      })
    );
    const user = userEvent.setup();

    renderWithProviders(
      <EquipmentFormDialog
        isOpen={true}
        onClose={vi.fn()}
        lockedServiceLocationId="loc-locked"
      />
    );

    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
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

  it('blocks submit and surfaces required-field error when no location is selected', async () => {
    const user = userEvent.setup();
    renderWithProviders(<EquipmentFormDialog isOpen={true} onClose={vi.fn()} />);

    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    await user.type(screen.getByLabelText(/^name/i), 'No location');
    await user.click(screen.getByRole('button', { name: /create/i }));

    await waitFor(() => {
      expect(screen.getByText(/service location/i)).toBeInTheDocument();
    });
    expect(mockEquipmentCreate).not.toHaveBeenCalled();
  });

  it('cancel button calls onClose', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<EquipmentFormDialog isOpen={true} onClose={onClose} />);
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onClose).toHaveBeenCalled();
  });

  describe('lockedParent (sub-unit creation)', () => {
    it('surfaces the parent in the title and sends parentId on create', async () => {
      mockEquipmentCreate.mockResolvedValue({ id: 'new-sub' });
      const onCreated = vi.fn();
      const user = userEvent.setup();

      renderWithProviders(
        <EquipmentFormDialog
          isOpen={true}
          onClose={vi.fn()}
          lockedServiceLocationId="sl-1"
          lockedParent={{ id: 'parent-eq', name: 'Outdoor HVAC unit' }}
          onCreated={onCreated}
        />
      );

      await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());

      // Title surfaces the parent's name so the user knows the new equipment
      // becomes a sub-unit of that parent.
      expect(screen.getByText(/Outdoor HVAC unit/)).toBeInTheDocument();

      await user.type(screen.getByLabelText(/^name/i), 'Blower');
      await user.click(screen.getByRole('button', { name: /create/i }));

      await waitFor(() => {
        expect(mockEquipmentCreate).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'Blower',
            serviceLocationId: 'sl-1',
            parentId: 'parent-eq',
          })
        );
      });
      expect(onCreated).toHaveBeenCalledWith({ id: 'new-sub' });
    });
  });
});
