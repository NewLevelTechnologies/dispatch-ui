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
const mockImagesList = vi.fn();
const mockImageUpload = vi.fn();
const mockImagePatch = vi.fn();
const mockImageDelete = vi.fn();
const mockWorkOrdersGetAll = vi.fn();

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
    equipmentImagesApi: {
      list: (...args: unknown[]) => mockImagesList(...args),
      upload: (...args: unknown[]) => mockImageUpload(...args),
      patch: (...args: unknown[]) => mockImagePatch(...args),
      delete: (...args: unknown[]) => mockImageDelete(...args),
    },
  };
});

vi.mock('../api/workOrderApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/workOrderApi')>();
  return {
    ...actual,
    workOrderApi: {
      ...actual.workOrderApi,
      getAll: (...args: unknown[]) => mockWorkOrdersGetAll(...args),
    },
    default: {
      ...actual.workOrderApi,
      getAll: (...args: unknown[]) => mockWorkOrdersGetAll(...args),
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
    mockImagesList.mockResolvedValue([]);
    mockWorkOrdersGetAll.mockResolvedValue({
      content: [],
      totalElements: 0,
      totalPages: 0,
      number: 0,
      size: 25,
      first: true,
      last: true,
    });
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

  it('renders service history work orders scoped by equipmentId', async () => {
    mockGetById.mockResolvedValue(baseEquipment);
    mockWorkOrdersGetAll.mockResolvedValue({
      content: [
        {
          id: 'wo-1',
          workOrderNumber: 'WO-00010',
          progressCategory: 'COMPLETED',
          priority: 'NORMAL',
          scheduledDate: '2026-04-15',
          serviceLocation: null,
          lifecycleState: 'ACTIVE',
        },
      ],
      totalElements: 1,
      totalPages: 1,
      number: 0,
      size: 25,
      first: true,
      last: true,
    });
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Upstairs Furnace' })).toBeInTheDocument();
    });

    // Tab badge reflects the count returned for the equipment-scoped fetch.
    const historyTab = await screen.findByRole('button', { name: /^service history\s*1$/i });
    await user.click(historyTab);

    await waitFor(() => {
      expect(screen.getByText('WO-00010')).toBeInTheDocument();
    });

    // Backend was called with equipmentId only — not customer or location.
    const allCalls = mockWorkOrdersGetAll.mock.calls.map(([args]) => args);
    expect(allCalls.some((args) => args?.equipmentId === 'eq-1')).toBe(true);
    expect(allCalls.every((args) => !args?.customerId && !args?.serviceLocationId)).toBe(true);
  });

  it('shows a coming-soon placeholder for the components tab', async () => {
    mockGetById.mockResolvedValue(baseEquipment);
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Upstairs Furnace' })).toBeInTheDocument();
    });

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

  it('inline-edits a sweep of text fields (model, serial, asset tag, location on site, description)', async () => {
    mockGetById.mockResolvedValue(baseEquipment);
    mockUpdate.mockResolvedValue(baseEquipment);
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => expect(screen.getByText('AC-100')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /^model$/i }));
    const modelInput = await screen.findByRole('textbox', { name: /^model$/i });
    await user.clear(modelInput);
    await user.type(modelInput, 'AC-200');
    modelInput.blur();
    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith('eq-1', { model: 'AC-200' });
    });

    await user.click(screen.getByRole('button', { name: /serial number/i }));
    const serialInput = await screen.findByRole('textbox', { name: /serial number/i });
    await user.clear(serialInput);
    await user.type(serialInput, 'SN999');
    serialInput.blur();
    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith('eq-1', { serialNumber: 'SN999' });
    });

    await user.click(screen.getByRole('button', { name: /asset tag/i }));
    const tagInput = await screen.findByRole('textbox', { name: /asset tag/i });
    await user.clear(tagInput);
    await user.type(tagInput, 'TAG-9');
    tagInput.blur();
    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith('eq-1', { assetTag: 'TAG-9' });
    });

    await user.click(screen.getByRole('button', { name: /location on site/i }));
    const locInput = await screen.findByRole('textbox', { name: /location on site/i });
    await user.clear(locInput);
    await user.type(locInput, 'Roof');
    locInput.blur();
    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith('eq-1', { locationOnSite: 'Roof' });
    });

    await user.click(screen.getByRole('button', { name: /description/i }));
    const descInput = await screen.findByRole('textbox', { name: /description/i });
    await user.clear(descInput);
    await user.type(descInput, 'Updated note');
    descInput.blur();
    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith('eq-1', { description: 'Updated note' });
    });
  });

  it('inline-edits date fields and warranty details', async () => {
    mockGetById.mockResolvedValue(baseEquipment);
    mockUpdate.mockResolvedValue(baseEquipment);
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Upstairs Furnace' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /install date/i }));
    const installInput = await screen.findByRole('textbox', { name: /install date/i });
    await user.clear(installInput);
    await user.type(installInput, '2024-03-15');
    installInput.blur();
    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith('eq-1', { installDate: '2024-03-15' });
    });

    await user.click(screen.getByRole('button', { name: /warranty expires/i }));
    const warrInput = await screen.findByRole('textbox', { name: /warranty expires/i });
    await user.clear(warrInput);
    await user.type(warrInput, '2030-01-01');
    warrInput.blur();
    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith('eq-1', { warrantyExpiresAt: '2030-01-01' });
    });

    await user.click(screen.getByRole('button', { name: /warranty details/i }));
    const detailsInput = await screen.findByRole('textbox', { name: /warranty details/i });
    await user.clear(detailsInput);
    await user.type(detailsInput, '10-year compressor');
    detailsInput.blur();
    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith('eq-1', { warrantyDetails: '10-year compressor' });
    });
  });

  it('inline-edits the status select and clearing the category', async () => {
    mockGetById.mockResolvedValue(baseEquipment);
    mockUpdate.mockResolvedValue(baseEquipment);
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => expect(screen.getByText('Furnace')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /^status/i }));
    const statusSelect = await screen.findByRole('combobox', { name: /^status/i });
    await user.selectOptions(statusSelect, 'RETIRED');
    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith('eq-1', { status: 'RETIRED' });
    });

    await user.click(screen.getByRole('button', { name: /^category/i }));
    const categorySelect = await screen.findByRole('combobox', { name: /^category/i });
    await user.selectOptions(categorySelect, '');
    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith('eq-1', { equipmentCategoryId: null });
    });
  });

  it('opens the Add Filter dialog from the Add Filter button', async () => {
    mockGetById.mockResolvedValue(baseEquipment);
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Upstairs Furnace' })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: /^filters/i }));
    await user.click(screen.getByRole('button', { name: /add filter/i }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect((screen.getByLabelText(/length/i) as HTMLInputElement).value).toBe('');
  });

  it('opens the edit dialog for a filter row with values pre-filled', async () => {
    mockGetById.mockResolvedValue(baseEquipment);
    mockFiltersGetAll.mockResolvedValue([
      {
        id: 'f-1',
        equipmentId: 'eq-1',
        lengthIn: 16,
        widthIn: 20,
        thicknessIn: 1,
        quantity: 4,
        label: 'Pre-filter',
      },
    ]);
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Upstairs Furnace' })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: /^filters/i }));

    await waitFor(() => expect(screen.getByText('16 × 20 × 1')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /more options/i }));
    const editItem = await screen.findByRole('menuitem', { name: /edit/i });
    await user.click(editItem);

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect((screen.getByLabelText(/length/i) as HTMLInputElement).value).toBe('16');
    expect((screen.getByLabelText(/quantity/i) as HTMLInputElement).value).toBe('4');
    expect((screen.getByLabelText(/label/i) as HTMLInputElement).value).toBe('Pre-filter');
  });

  it('alerts the backend message when filter delete fails', async () => {
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
    mockFilterDelete.mockRejectedValue(
      Object.assign(new Error('boom'), {
        response: { data: { message: 'Filter is referenced by an open work order.' } },
      })
    );
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Upstairs Furnace' })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: /^filters/i }));
    await waitFor(() => expect(screen.getByText('20 × 25 × 1')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /more options/i }));
    const deleteItem = await screen.findByRole('menuitem', { name: /delete/i });
    await user.click(deleteItem);

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('Filter is referenced by an open work order.');
    });
    confirmSpy.mockRestore();
    alertSpy.mockRestore();
  });

  it('renders empty state on the photos tab when no photos exist', async () => {
    mockGetById.mockResolvedValue(baseEquipment);
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Upstairs Furnace' })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: /^photos/i }));
    await waitFor(() => {
      expect(screen.getByText(/no photos added yet/i)).toBeInTheDocument();
    });
  });

  it('renders the photos grid with profile badge and tab count', async () => {
    mockGetById.mockResolvedValue(baseEquipment);
    mockImagesList.mockResolvedValue([
      {
        id: 'img-1',
        url: 'https://cdn.example.com/full-1.jpg',
        thumbnailUrl: 'https://cdn.example.com/thumb-1.jpg',
        contentType: 'image/jpeg',
        sizeBytes: 100,
        widthPx: 800,
        heightPx: 600,
        thumbnailWidthPx: 400,
        thumbnailHeightPx: 300,
        isProfile: true,
        sortOrder: 0,
        caption: 'Nameplate',
        uploadedBy: null,
        uploadedByName: null,
        createdAt: '',
      },
      {
        id: 'img-2',
        url: 'https://cdn.example.com/full-2.jpg',
        thumbnailUrl: 'https://cdn.example.com/thumb-2.jpg',
        contentType: 'image/jpeg',
        sizeBytes: 100,
        widthPx: 800,
        heightPx: 600,
        thumbnailWidthPx: 400,
        thumbnailHeightPx: 300,
        isProfile: false,
        sortOrder: 1,
        caption: null,
        uploadedBy: null,
        uploadedByName: null,
        createdAt: '',
      },
    ]);
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Upstairs Furnace' })).toBeInTheDocument();
    });

    // Tab badge shows the count
    const photosTab = await screen.findByRole('button', { name: /^photos\s*2$/i });
    await user.click(photosTab);

    // Caption renders for the captioned image
    await waitFor(() => expect(screen.getByText('Nameplate')).toBeInTheDocument());
    // The profile photo's star button uses "Profile" as its accessible label
    // (filled star), the other uses "Set as profile" (empty star).
    expect(screen.getByRole('button', { name: /^profile$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^set as profile$/i })).toBeInTheDocument();
    // Two thumbnails
    const thumbs = screen.getAllByRole('img');
    expect(thumbs.length).toBeGreaterThanOrEqual(2);
  });

  it('sets a non-profile image as profile by clicking the star toggle', async () => {
    mockGetById.mockResolvedValue(baseEquipment);
    mockImagesList.mockResolvedValue([
      {
        id: 'img-1',
        url: 'https://cdn.example.com/full-1.jpg',
        thumbnailUrl: 'https://cdn.example.com/thumb-1.jpg',
        contentType: 'image/jpeg',
        sizeBytes: 100,
        widthPx: 800,
        heightPx: 600,
        thumbnailWidthPx: 400,
        thumbnailHeightPx: 300,
        isProfile: false,
        sortOrder: 0,
        caption: null,
        uploadedBy: null,
        uploadedByName: null,
        createdAt: '',
      },
    ]);
    mockImagePatch.mockResolvedValue({});
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Upstairs Furnace' })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: /^photos/i }));

    // Star button uses "Set as profile" as its accessible label when the image
    // isn't already the profile.
    const star = await screen.findByRole('button', { name: /set as profile/i });
    await user.click(star);

    await waitFor(() => {
      expect(mockImagePatch).toHaveBeenCalledWith('eq-1', 'img-1', { isProfile: true });
    });
  });

  it('deletes a photo after confirmation', async () => {
    mockGetById.mockResolvedValue(baseEquipment);
    mockImagesList.mockResolvedValue([
      {
        id: 'img-1',
        url: 'https://cdn.example.com/full-1.jpg',
        thumbnailUrl: 'https://cdn.example.com/thumb-1.jpg',
        contentType: 'image/jpeg',
        sizeBytes: 100,
        widthPx: 800,
        heightPx: 600,
        thumbnailWidthPx: 400,
        thumbnailHeightPx: 300,
        isProfile: false,
        sortOrder: 0,
        caption: null,
        uploadedBy: null,
        uploadedByName: null,
        createdAt: '',
      },
    ]);
    mockImageDelete.mockResolvedValue(undefined);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Upstairs Furnace' })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: /^photos/i }));

    const moreButtons = await screen.findAllByRole('button', { name: /more options/i });
    await user.click(moreButtons[0]);
    const deleteItem = await screen.findByRole('menuitem', { name: /delete/i });
    await user.click(deleteItem);

    await waitFor(() => {
      expect(mockImageDelete).toHaveBeenCalledWith('eq-1', 'img-1');
    });
    confirmSpy.mockRestore();
  });

  it('opens the upload dialog from the Add Photo button', async () => {
    mockGetById.mockResolvedValue(baseEquipment);
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Upstairs Furnace' })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: /^photos/i }));
    await user.click(screen.getByRole('button', { name: /add photo/i }));

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
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
