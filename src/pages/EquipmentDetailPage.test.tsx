import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import type { RouteObject } from 'react-router-dom';
import { renderWithProviders, userEvent } from '../test/utils';
import EquipmentDetailPage from './EquipmentDetailPage';
import type { Equipment } from '../api';

const mockGetById = vi.fn();
const mockUpdate = vi.fn();
const mockTypesGetAll = vi.fn();
const mockCategoriesGetAll = vi.fn();
const mockFiltersGetAll = vi.fn();
const mockFilterCreate = vi.fn();
const mockFilterUpdate = vi.fn();
const mockFilterDelete = vi.fn();
const mockFilterSizesGetAll = vi.fn();

vi.mock('../api/equipmentApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/equipmentApi')>();
  return {
    ...actual,
    equipmentApi: {
      getById: (...args: unknown[]) => mockGetById(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
    },
    equipmentTypesApi: {
      getAll: (...args: unknown[]) => mockTypesGetAll(...args),
    },
    equipmentCategoriesApi: {
      getAll: (...args: unknown[]) => mockCategoriesGetAll(...args),
    },
    equipmentFiltersApi: {
      getAll: (...args: unknown[]) => mockFiltersGetAll(...args),
      create: (...args: unknown[]) => mockFilterCreate(...args),
      update: (...args: unknown[]) => mockFilterUpdate(...args),
      delete: (...args: unknown[]) => mockFilterDelete(...args),
    },
    tenantFilterSizesApi: {
      getAll: (...args: unknown[]) => mockFilterSizesGetAll(...args),
    },
  };
});

vi.mock('../api/client');

const baseEquipment: Equipment = {
  id: 'eq-1',
  name: 'Upstairs Furnace',
  description: 'Two-stage gas furnace',
  make: 'Carrier',
  model: 'AC-100',
  serialNumber: 'SN123',
  assetTag: 'TAG-1',
  parentId: null,
  equipmentTypeId: 't-hvac',
  equipmentTypeName: 'HVAC',
  equipmentCategoryId: 'c-furnace',
  equipmentCategoryName: 'Furnace',
  serviceLocationId: 'loc-1',
  locationOnSite: 'Basement',
  installDate: '2022-06-15',
  lastServicedAt: '2026-01-10T12:00:00Z',
  warrantyExpiresAt: '2027-06-15',
  warrantyDetails: '5-year parts',
  status: 'ACTIVE',
  profileImageUrl: null,
};

const renderPage = (equipmentId = 'eq-1') => {
  const routes: RouteObject[] = [
    { path: '/equipment/:id', element: <EquipmentDetailPage /> },
  ];
  return renderWithProviders(<EquipmentDetailPage />, {
    routes,
    initialPath: `/equipment/${equipmentId}`,
  });
};

describe('EquipmentDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTypesGetAll.mockResolvedValue([
      { id: 't-hvac', tenantId: 't', name: 'HVAC', sortOrder: 0, archivedAt: null, createdAt: '', updatedAt: '' },
      { id: 't-refrig', tenantId: 't', name: 'Refrigeration', sortOrder: 1, archivedAt: null, createdAt: '', updatedAt: '' },
    ]);
    mockCategoriesGetAll.mockResolvedValue([
      { id: 'c-furnace', tenantId: 't', equipmentTypeId: 't-hvac', name: 'Furnace', sortOrder: 0, archivedAt: null, createdAt: '', updatedAt: '' },
    ]);
    mockFiltersGetAll.mockResolvedValue([]);
    mockFilterSizesGetAll.mockResolvedValue([]);
  });

  it('shows loading state while equipment loads', () => {
    mockGetById.mockImplementation(() => new Promise(() => {}));
    renderPage();
    expect(screen.getByText(/loading equipment/i)).toBeInTheDocument();
  });

  it('shows error state when fetch fails', async () => {
    mockGetById.mockRejectedValue(new Error('Not found'));
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/error loading equipment/i)).toBeInTheDocument();
    });
  });

  it('renders header with name, status badge, and overview content', async () => {
    mockGetById.mockResolvedValue(baseEquipment);
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Upstairs Furnace' })).toBeInTheDocument();
    });

    // Status badge in the header (and there's a second one in the inline-edit display)
    expect(screen.getAllByText('Active').length).toBeGreaterThan(0);
    // Identification card content
    expect(screen.getByText('Carrier')).toBeInTheDocument();
    expect(screen.getByText('AC-100')).toBeInTheDocument();
    expect(screen.getByText('SN123')).toBeInTheDocument();
    expect(screen.getByText('Basement')).toBeInTheDocument();
    // Description card content (in display state)
    expect(screen.getByText('Two-stage gas furnace')).toBeInTheDocument();
  });

  it('renders the profile image when present, placeholder otherwise', async () => {
    mockGetById.mockResolvedValue({
      ...baseEquipment,
      profileImageUrl: 'https://example.com/profile.jpg',
    });
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Upstairs Furnace' })).toBeInTheDocument();
    });
    const img = screen.getByAltText(/Upstairs Furnace profile image/i) as HTMLImageElement;
    expect(img.src).toBe('https://example.com/profile.jpg');
  });

  it('falls back to a placeholder icon when no profile image is set', async () => {
    mockGetById.mockResolvedValue(baseEquipment);
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Upstairs Furnace' })).toBeInTheDocument();
    });
    expect(screen.queryByAltText(/profile image/i)).not.toBeInTheDocument();
  });

  it('inline-edits the make field via PATCH', async () => {
    mockGetById.mockResolvedValue(baseEquipment);
    mockUpdate.mockResolvedValue({ ...baseEquipment, make: 'Trane' });
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Carrier')).toBeInTheDocument();
    });

    // Click into edit, replace, blur to commit.
    await user.click(screen.getByRole('button', { name: /^make$/i }));
    const input = await screen.findByRole('textbox', { name: /^make$/i });
    await user.clear(input);
    await user.type(input, 'Trane');
    input.blur();

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith('eq-1', { make: 'Trane' });
    });
  });

  it('clears category when type changes', async () => {
    mockGetById.mockResolvedValue(baseEquipment);
    mockUpdate.mockResolvedValue({ ...baseEquipment, equipmentTypeId: 't-refrig' });
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('HVAC')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /^type$/i }));
    const select = await screen.findByRole('combobox', { name: /^type$/i });
    await user.selectOptions(select, 't-refrig');

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith('eq-1', {
        equipmentTypeId: 't-refrig',
        equipmentCategoryId: null,
      });
    });
  });

  it('switches to a placeholder for service-history and components tabs', async () => {
    mockGetById.mockResolvedValue(baseEquipment);
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Upstairs Furnace' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /^service history/i }));
    expect(screen.getByText(/coming soon/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^components/i }));
    expect(screen.getByText(/coming soon/i)).toBeInTheDocument();
  });

  it('renders empty state on the filters tab when no filters exist', async () => {
    mockGetById.mockResolvedValue(baseEquipment);
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Upstairs Furnace' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /^filters/i }));

    await waitFor(() => {
      expect(screen.getByText(/no filters added yet/i)).toBeInTheDocument();
    });
    // No quick-add chips when no tenant filter sizes are configured.
    expect(screen.queryByText(/quick add:/i)).not.toBeInTheDocument();
  });

  it('renders the filter list and tab count badge', async () => {
    mockGetById.mockResolvedValue(baseEquipment);
    mockFiltersGetAll.mockResolvedValue([
      {
        id: 'f-1',
        equipmentId: 'eq-1',
        lengthIn: 20,
        widthIn: 25,
        thicknessIn: 1,
        quantity: 2,
        label: 'Return air',
      },
    ]);
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Upstairs Furnace' })).toBeInTheDocument();
    });

    // Tab badge shows the count even before navigating.
    const filtersTab = await screen.findByRole('button', { name: /^filters\s*1$/i });
    await user.click(filtersTab);

    await waitFor(() => {
      expect(screen.getByText('20 × 25 × 1')).toBeInTheDocument();
    });
    expect(screen.getByText('Return air')).toBeInTheDocument();
  });

  it('renders quick-add chips and pre-fills dimensions when one is clicked', async () => {
    mockGetById.mockResolvedValue(baseEquipment);
    mockFilterSizesGetAll.mockResolvedValue([
      {
        id: 's-1',
        tenantId: 't',
        lengthIn: 16,
        widthIn: 20,
        thicknessIn: 1,
        sortOrder: 0,
        archivedAt: null,
        createdAt: '',
      },
    ]);
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Upstairs Furnace' })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: /^filters/i }));

    const chip = await screen.findByRole('button', { name: '16 × 20 × 1' });
    await user.click(chip);

    // Dialog opens with dimensions pre-filled.
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeInTheDocument();
    const lengthInput = screen.getByLabelText(/length/i) as HTMLInputElement;
    const widthInput = screen.getByLabelText(/width/i) as HTMLInputElement;
    const thicknessInput = screen.getByLabelText(/thickness/i) as HTMLInputElement;
    expect(lengthInput.value).toBe('16');
    expect(widthInput.value).toBe('20');
    expect(thicknessInput.value).toBe('1');
  });

  it('deletes a filter after confirmation', async () => {
    mockGetById.mockResolvedValue(baseEquipment);
    mockFiltersGetAll.mockResolvedValue([
      {
        id: 'f-1',
        equipmentId: 'eq-1',
        lengthIn: 20,
        widthIn: 25,
        thicknessIn: 1,
        quantity: 1,
        label: null,
      },
    ]);
    mockFilterDelete.mockResolvedValue(undefined);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Upstairs Furnace' })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: /^filters/i }));

    await waitFor(() => {
      expect(screen.getByText('20 × 25 × 1')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /more options/i }));
    const deleteItem = await screen.findByRole('menuitem', { name: /delete/i });
    await user.click(deleteItem);

    await waitFor(() => {
      expect(confirmSpy).toHaveBeenCalled();
      expect(mockFilterDelete).toHaveBeenCalledWith('eq-1', 'f-1');
    });
    confirmSpy.mockRestore();
  });

  it('alerts and stays in edit mode when PATCH fails', async () => {
    mockGetById.mockResolvedValue(baseEquipment);
    mockUpdate.mockRejectedValue(
      Object.assign(new Error('boom'), {
        response: { data: { message: 'Validation failed' } },
      })
    );
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Carrier')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /^make$/i }));
    const input = await screen.findByRole('textbox', { name: /^make$/i });
    await user.clear(input);
    await user.type(input, 'Bad');
    input.blur();

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('Validation failed');
    });
    // Field still in edit mode (input is still the active surface)
    expect(screen.queryByRole('textbox', { name: /^make$/i })).toBeInTheDocument();

    alertSpy.mockRestore();
  });
});
