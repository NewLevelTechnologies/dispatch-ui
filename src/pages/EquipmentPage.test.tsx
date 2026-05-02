import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import EquipmentPage from './EquipmentPage';

const mockEquipmentList = vi.fn();
const mockEquipmentGetById = vi.fn();
const mockEquipmentCreate = vi.fn();
const mockEquipmentUpdate = vi.fn();
const mockEquipmentDelete = vi.fn();
const mockEquipmentTypesGetAll = vi.fn();
const mockEquipmentCategoriesGetAll = vi.fn();
const mockCustomerGetAllPaginated = vi.fn();
const mockCustomerGetServiceLocations = vi.fn();

vi.mock('../api/equipmentApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/equipmentApi')>();
  return {
    ...actual,
    equipmentApi: {
      list: (...args: unknown[]) => mockEquipmentList(...args),
      getById: (...args: unknown[]) => mockEquipmentGetById(...args),
      create: (...args: unknown[]) => mockEquipmentCreate(...args),
      update: (...args: unknown[]) => mockEquipmentUpdate(...args),
      delete: (...args: unknown[]) => mockEquipmentDelete(...args),
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

const summary = (id: string, name: string, overrides: Partial<Record<string, unknown>> = {}) => ({
  id,
  name,
  equipmentTypeName: null,
  equipmentCategoryName: null,
  make: null,
  model: null,
  serialNumber: null,
  locationOnSite: null,
  ...overrides,
});

const page = (content: ReturnType<typeof summary>[], totalElements = content.length) => ({
  content,
  totalElements,
  totalPages: Math.max(1, Math.ceil(totalElements / 50)),
  number: 0,
  size: 50,
  first: true,
  last: true,
});

describe('EquipmentPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEquipmentTypesGetAll.mockResolvedValue([]);
    mockEquipmentCategoriesGetAll.mockResolvedValue([]);
    mockCustomerGetAllPaginated.mockResolvedValue({ content: [], totalElements: 0, totalPages: 0, number: 0, size: 50 });
    mockCustomerGetServiceLocations.mockResolvedValue([]);
  });

  it('renders the page heading and add button', async () => {
    mockEquipmentList.mockResolvedValue(page([]));

    renderWithProviders(<EquipmentPage />);

    expect(screen.getByRole('heading', { name: 'Equipment' })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /add equipment/i })).toBeInTheDocument();
    });
  });

  it('displays loading state', () => {
    mockEquipmentList.mockImplementation(() => new Promise(() => {}));

    renderWithProviders(<EquipmentPage />);

    expect(screen.getByText('Loading equipment...')).toBeInTheDocument();
  });

  it('displays equipment in a table', async () => {
    mockEquipmentList.mockResolvedValue(
      page([
        summary('1', 'Upstairs Furnace', {
          equipmentTypeName: 'HVAC',
          equipmentCategoryName: 'Furnace',
          make: 'Carrier',
          model: 'AC-100',
          serialNumber: 'SN123',
          locationOnSite: 'Basement',
        }),
        summary('2', 'Walk-in Cooler', {
          equipmentTypeName: 'Refrigeration',
          make: 'Hoshizaki',
          serialNumber: 'SN456',
        }),
      ])
    );

    renderWithProviders(<EquipmentPage />);

    await waitFor(() => {
      expect(screen.getByText('Upstairs Furnace')).toBeInTheDocument();
    });

    expect(screen.getByText('HVAC / Furnace')).toBeInTheDocument();
    expect(screen.getByText('Carrier AC-100')).toBeInTheDocument();
    expect(screen.getByText('SN123')).toBeInTheDocument();
    expect(screen.getByText('Basement')).toBeInTheDocument();
    expect(screen.getByText('Walk-in Cooler')).toBeInTheDocument();
  });

  it('renders the service location column with name, address, and customer name', async () => {
    mockEquipmentList.mockResolvedValue(
      page([
        summary('1', 'Upstairs Furnace', {
          serviceLocationId: 'loc-1',
          serviceLocationName: 'Main Office',
          streetAddress: '123 Main St',
          city: 'Atlanta',
          state: 'GA',
          zipCode: '30301',
          customerName: 'Acme Inc',
        }),
      ])
    );

    renderWithProviders(<EquipmentPage />);

    await waitFor(() => {
      expect(screen.getByText('Main Office')).toBeInTheDocument();
    });

    // Address + customer name in the secondary line.
    expect(screen.getByText(/123 Main St, Atlanta, GA 30301.*Acme Inc/)).toBeInTheDocument();
    // Cell is a link to the service location detail page.
    expect(screen.getByRole('link', { name: /Main Office/ })).toHaveAttribute(
      'href',
      '/service-locations/loc-1'
    );
  });

  it('falls back to address as the primary line when the location has no name', async () => {
    mockEquipmentList.mockResolvedValue(
      page([
        summary('1', 'Some Equipment', {
          serviceLocationId: 'loc-2',
          serviceLocationName: null,
          streetAddress: '7 Side Rd',
          city: 'Marietta',
          state: 'GA',
          zipCode: '30060',
          customerName: 'Bob LLC',
        }),
      ])
    );

    renderWithProviders(<EquipmentPage />);

    await waitFor(() => {
      expect(screen.getByText('7 Side Rd, Marietta, GA 30060')).toBeInTheDocument();
    });
  });

  it('displays error message when fetch fails', async () => {
    mockEquipmentList.mockRejectedValue(new Error('Network error'));

    renderWithProviders(<EquipmentPage />);

    await waitFor(() => {
      expect(screen.getByText(/error loading equipment/i)).toBeInTheDocument();
    });
  });

  it('displays empty state', async () => {
    mockEquipmentList.mockResolvedValue(page([]));

    renderWithProviders(<EquipmentPage />);

    await waitFor(() => {
      expect(screen.getByText(/no equipment found/i)).toBeInTheDocument();
    });
  });

  it('opens create dialog when add button is clicked', async () => {
    mockEquipmentList.mockResolvedValue(page([]));
    const user = userEvent.setup();

    renderWithProviders(<EquipmentPage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /add equipment/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /add equipment/i }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText(/^name/i)).toBeInTheDocument();
  });

  it('opens edit dialog with full record fetched by id', async () => {
    mockEquipmentList.mockResolvedValue(
      page([summary('1', 'Upstairs Furnace', { make: 'Carrier' })])
    );
    mockEquipmentGetById.mockResolvedValue({
      id: '1',
      name: 'Upstairs Furnace',
      serviceLocationId: 'sl-1',
      status: 'ACTIVE',
      make: 'Carrier',
    });
    const user = userEvent.setup();

    renderWithProviders(<EquipmentPage />);

    await waitFor(() => {
      expect(screen.getByText('Upstairs Furnace')).toBeInTheDocument();
    });

    const dropdownButtons = screen.getAllByRole('button', { name: /more options/i });
    await user.click(dropdownButtons[0]);

    const editButton = await screen.findByRole('menuitem', { name: /edit/i });
    await user.click(editButton);

    await waitFor(() => {
      expect(mockEquipmentGetById).toHaveBeenCalledWith('1');
    });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('calls delete when confirmed', async () => {
    mockEquipmentList.mockResolvedValue(page([summary('1', 'Upstairs Furnace')]));
    mockEquipmentDelete.mockResolvedValue(undefined);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();

    renderWithProviders(<EquipmentPage />);

    await waitFor(() => {
      expect(screen.getByText('Upstairs Furnace')).toBeInTheDocument();
    });

    const dropdownButtons = screen.getAllByRole('button', { name: /more options/i });
    await user.click(dropdownButtons[0]);

    const deleteButton = await screen.findByRole('menuitem', { name: /delete/i });
    await user.click(deleteButton);

    await waitFor(() => {
      expect(confirmSpy).toHaveBeenCalled();
      expect(mockEquipmentDelete).toHaveBeenCalledWith('1');
    });

    confirmSpy.mockRestore();
  });

  it('alerts the backend message when delete is blocked by FK', async () => {
    mockEquipmentList.mockResolvedValue(page([summary('1', 'Upstairs Furnace')]));
    mockEquipmentDelete.mockRejectedValue(
      Object.assign(new Error('boom'), {
        response: { data: { message: 'Equipment is in use by 3 work order items.' } },
      })
    );
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const user = userEvent.setup();

    renderWithProviders(<EquipmentPage />);

    await waitFor(() => {
      expect(screen.getByText('Upstairs Furnace')).toBeInTheDocument();
    });

    const dropdownButtons = screen.getAllByRole('button', { name: /more options/i });
    await user.click(dropdownButtons[0]);

    const deleteButton = await screen.findByRole('menuitem', { name: /delete/i });
    await user.click(deleteButton);

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('Equipment is in use by 3 work order items.');
    });

    confirmSpy.mockRestore();
    alertSpy.mockRestore();
  });

  it('debounces search input into the list query', async () => {
    mockEquipmentList.mockResolvedValue(page([summary('1', 'Upstairs Furnace')]));
    const user = userEvent.setup();

    renderWithProviders(<EquipmentPage />);

    await waitFor(() => {
      expect(screen.getByText('Upstairs Furnace')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/search/i);
    await user.type(searchInput, 'carrier');

    await waitFor(() => {
      const calls = mockEquipmentList.mock.calls;
      expect(calls.some(([args]) => args && args.search === 'carrier')).toBe(true);
    });
  });

  it('forwards type and category filters into the list query', async () => {
    mockEquipmentList.mockResolvedValue(page([summary('1', 'Upstairs Furnace')]));
    mockEquipmentTypesGetAll.mockResolvedValue([
      { id: 't-hvac', tenantId: 't', name: 'HVAC', sortOrder: 0, archivedAt: null, createdAt: '', updatedAt: '' },
    ]);
    mockEquipmentCategoriesGetAll.mockResolvedValue([
      { id: 'c-furnace', tenantId: 't', equipmentTypeId: 't-hvac', name: 'Furnace', sortOrder: 0, archivedAt: null, createdAt: '', updatedAt: '' },
    ]);
    const user = userEvent.setup();

    renderWithProviders(<EquipmentPage />);

    await waitFor(() => expect(screen.getByText('Upstairs Furnace')).toBeInTheDocument());

    // Pick type — kicks off categories query and refetches list
    const [typeSelect, categorySelect] = screen.getAllByRole('combobox');
    await user.selectOptions(typeSelect, 't-hvac');

    await waitFor(() => {
      expect(mockEquipmentCategoriesGetAll).toHaveBeenCalledWith('t-hvac');
    });
    await waitFor(() => {
      expect(mockEquipmentList.mock.calls.some(([args]) => args?.equipmentTypeId === 't-hvac')).toBe(true);
    });

    // Pick category
    await waitFor(() => expect(categorySelect).not.toBeDisabled());
    await user.selectOptions(categorySelect, 'c-furnace');
    await waitFor(() => {
      expect(mockEquipmentList.mock.calls.some(([args]) => args?.equipmentCategoryId === 'c-furnace')).toBe(true);
    });
  });

  it('switches the status filter to RETIRED', async () => {
    mockEquipmentList.mockResolvedValue(page([summary('1', 'Upstairs Furnace')]));
    const user = userEvent.setup();

    renderWithProviders(<EquipmentPage />);

    await waitFor(() => expect(screen.getByText('Upstairs Furnace')).toBeInTheDocument());

    const selects = screen.getAllByRole('combobox');
    const statusSelect = selects[selects.length - 1];
    await user.selectOptions(statusSelect, 'RETIRED');

    await waitFor(() => {
      expect(mockEquipmentList.mock.calls.some(([args]) => args?.status === 'RETIRED')).toBe(true);
    });
  });

  it('paginates with previous and next buttons', async () => {
    // 120 results across 3 pages of 50
    mockEquipmentList.mockResolvedValue({
      content: [summary('1', 'Page 1 Item')],
      totalElements: 120,
      totalPages: 3,
      number: 0,
      size: 50,
      first: true,
      last: false,
    });
    const user = userEvent.setup();

    renderWithProviders(<EquipmentPage />);

    await waitFor(() => expect(screen.getByText('Page 1 Item')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /next/i }));
    await waitFor(() => {
      expect(mockEquipmentList.mock.calls.some(([args]) => args?.page === 1)).toBe(true);
    });

    await user.click(screen.getByRole('button', { name: /previous/i }));
    await waitFor(() => {
      // The last call should be back to page 0
      const lastArgs = mockEquipmentList.mock.calls[mockEquipmentList.mock.calls.length - 1][0];
      expect(lastArgs?.page).toBe(0);
    });
  });

  it('closes the form dialog on cancel', async () => {
    mockEquipmentList.mockResolvedValue(page([]));
    const user = userEvent.setup();

    renderWithProviders(<EquipmentPage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /add equipment/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /add equipment/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /cancel/i }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });
});
