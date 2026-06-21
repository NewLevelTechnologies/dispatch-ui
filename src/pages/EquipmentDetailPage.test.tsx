import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import type { RouteObject } from 'react-router-dom';
import { renderWithProviders, userEvent } from '../test/utils';
import EquipmentDetailPage from './EquipmentDetailPage';
import type { Equipment } from '../api';

const mockGetById = vi.fn();
const mockGetDescendants = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
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
const mockNotesList = vi.fn();
const mockNotesCreate = vi.fn();
const mockNotesUpdate = vi.fn();
const mockNotesDelete = vi.fn();
const mockWorkOrdersGetAll = vi.fn();
const mockGetServiceLocationById = vi.fn();
const mockCustomerGetById = vi.fn();
const mockFilesList = vi.fn();
const mockFilesUpload = vi.fn();
const mockWoTypesGetAll = vi.fn();
const mockShowError = vi.fn();
const mockShowSuccess = vi.fn();

vi.mock('../api/equipmentApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/equipmentApi')>();
  return {
    ...actual,
    equipmentApi: {
      getById: (...args: unknown[]) => mockGetById(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
      delete: (...args: unknown[]) => mockDelete(...args),
      getDescendants: (...args: unknown[]) => mockGetDescendants(...args),
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
    equipmentNotesApi: {
      list: (...args: unknown[]) => mockNotesList(...args),
      create: (...args: unknown[]) => mockNotesCreate(...args),
      update: (...args: unknown[]) => mockNotesUpdate(...args),
      delete: (...args: unknown[]) => mockNotesDelete(...args),
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

vi.mock('../api/customerApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/customerApi')>();
  return {
    ...actual,
    customerApi: {
      ...actual.customerApi,
      getServiceLocationById: (...args: unknown[]) => mockGetServiceLocationById(...args),
      getById: (...args: unknown[]) => mockCustomerGetById(...args),
    },
  };
});

// Videos come from the files service (also used by EquipmentVideosSection on the
// Media tab). Spread the original so the VIDEO_* constants stay intact.
vi.mock('../api/filesApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/filesApi')>();
  return {
    ...actual,
    equipmentFilesApi: {
      ...actual.equipmentFilesApi,
      list: (...args: unknown[]) => mockFilesList(...args),
      upload: (...args: unknown[]) => mockFilesUpload(...args),
    },
  };
});

// Work-order types resolve the service-history peek's Type column.
vi.mock('../api/workOrderConfigApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/workOrderConfigApi')>();
  return {
    ...actual,
    workOrderTypesApi: { ...actual.workOrderTypesApi, getAll: () => mockWoTypesGetAll() },
  };
});

// Surface helpers are mocked so we can assert error/success toasts; extractApiError
// stays real so the backend message still flows through to the toast description.
vi.mock('../lib/toast', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/toast')>();
  return {
    ...actual,
    showError: (...args: unknown[]) => mockShowError(...args),
    showSuccess: (...args: unknown[]) => mockShowSuccess(...args),
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
    mockWoTypesGetAll.mockResolvedValue([]);
    mockCategoriesGetAll.mockResolvedValue([
      { id: 'c-furnace', tenantId: 't', equipmentTypeId: 't-hvac', name: 'Furnace', sortOrder: 0, archivedAt: null, createdAt: '', updatedAt: '' },
    ]);
    mockFiltersGetAll.mockResolvedValue([]);
    mockFilterSizesGetAll.mockResolvedValue([]);
    mockImagesList.mockResolvedValue([]);
    mockFilesList.mockResolvedValue({ content: [] });
    mockFilesUpload.mockResolvedValue({ id: 'v-1', status: 'READY' });
    mockNotesList.mockResolvedValue([]);
    mockWorkOrdersGetAll.mockResolvedValue({
      content: [],
      totalElements: 0,
      totalPages: 0,
      number: 0,
      size: 25,
      first: true,
      last: true,
    });
    mockGetDescendants.mockResolvedValue([]);
    mockGetServiceLocationById.mockResolvedValue({
      id: 'loc-1',
      customerId: 'c-1',
      dispatchRegionId: 'r-1',
      locationName: 'Main Office',
      address: { streetAddress: '1 Main St', city: 'Springfield', state: 'IL', zipCode: '62701' },
      additionalContacts: [],
      status: 'ACTIVE',
      createdAt: '',
      updatedAt: '',
      version: 0,
    });
    mockCustomerGetById.mockResolvedValue({ id: 'c-1', name: 'Acme Corp' });
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

  it('renders header with name, derived pills, and overview content', async () => {
    mockGetById.mockResolvedValue(baseEquipment);
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Upstairs Furnace' })).toBeInTheDocument();
    });

    // Derived header pills: type (category) + warranty (future expiry → under
    // warranty). "Under warranty" appears in both the header pill and the Specs
    // warranty sub-block.
    expect(screen.getAllByText('Furnace').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Under warranty').length).toBeGreaterThan(0);
    // Identity values echo across the header meta line and the Specs card.
    expect(screen.getAllByText('Carrier').length).toBeGreaterThan(0);
    expect(screen.getAllByText('AC-100').length).toBeGreaterThan(0);
    expect(screen.getAllByText('SN123').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Basement').length).toBeGreaterThan(0);
    // Description card (conditional, present here).
    expect(screen.getByText('Two-stage gas furnace')).toBeInTheDocument();
    // Located-at card resolves the location + customer (separate async queries).
    expect(await screen.findByText('Main Office')).toBeInTheDocument();
    expect(await screen.findByText('Acme Corp')).toBeInTheDocument();
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

  it('edits the Identity card in place and PATCHes the whole section', async () => {
    mockGetById.mockResolvedValue(baseEquipment);
    mockUpdate.mockResolvedValue(baseEquipment);
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Upstairs Furnace' })).toBeInTheDocument();
    });

    // Card-level edit: header "Edit" → fields become inputs → Save changes.
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    const makeInput = await screen.findByDisplayValue('Carrier');
    await user.clear(makeInput);
    await user.type(makeInput, 'Trane');
    const modelInput = screen.getByDisplayValue('AC-100');
    await user.clear(modelInput);
    await user.type(modelInput, 'XR-15');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    // One PATCH for the whole section — the edited fields plus the seeded rest
    // (incl. warranty, which rides along; labor stays null with no backfill).
    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith(
        'eq-1',
        expect.objectContaining({
          // Name is NOT in this payload — it's edited in the header now.
          make: 'Trane',
          model: 'XR-15',
          serialNumber: 'SN123',
          assetTag: 'TAG-1',
          warrantyExpiresAt: '2027-06-15',
          warrantyLaborExpiresAt: null,
          warrantyDetails: '5-year parts',
        })
      );
    });
  });

  it('does not inline-edit Type or Category (recategorize lives in the full editor)', async () => {
    mockGetById.mockResolvedValue(baseEquipment);
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => expect(screen.getByText('HVAC')).toBeInTheDocument());

    // Enter Identity edit — Type/Category are shown read-only, no select appears.
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.queryByRole('combobox', { name: /type/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /category/i })).not.toBeInTheDocument();
  });

  it('inline-edits the name in the header via the pencil affordance', async () => {
    mockGetById.mockResolvedValue(baseEquipment);
    mockUpdate.mockResolvedValue(baseEquipment);
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Upstairs Furnace' })).toBeInTheDocument();
    });

    // Name is the canonical title and edits in place from the header (the
    // Identity card no longer carries it).
    await user.click(screen.getByRole('button', { name: /edit name/i }));
    const nameInput = await screen.findByDisplayValue('Upstairs Furnace');
    await user.clear(nameInput);
    await user.type(nameInput, 'Rooftop Unit 9{Enter}');

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith('eq-1', { name: 'Rooftop Unit 9' });
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
          workItemCount: 0,
          workItems: [],
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
    const historyTab = await screen.findByRole('tab', { name: /^service history\s*1$/i });
    await user.click(historyTab);

    await waitFor(() => {
      expect(screen.getByText('WO-00010')).toBeInTheDocument();
    });

    // Backend was called with equipmentId only — not customer or location.
    const allCalls = mockWorkOrdersGetAll.mock.calls.map(([args]) => args);
    expect(allCalls.some((args) => args?.equipmentId === 'eq-1')).toBe(true);
    expect(allCalls.every((args) => !args?.customerId && !args?.serviceLocationId)).toBe(true);
  });

  it('hides the Units card when there are no sub-units', async () => {
    mockGetById.mockResolvedValue(baseEquipment);
    mockGetDescendants.mockResolvedValue([]);
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Upstairs Furnace' })).toBeInTheDocument();
    });
    // Default glossary maps equipment_component → "Units" (plural). No card when empty.
    expect(screen.queryByText('Units')).not.toBeInTheDocument();
  });

  it('renders direct sub-units in the Units card (grandchildren excluded)', async () => {
    mockGetById.mockResolvedValue(baseEquipment);
    // Tree: root (eq-1) → Compressor, Coil (direct); Compressor → Capacitor (grandchild).
    mockGetDescendants.mockResolvedValue([
      { id: 'comp-1', name: 'Compressor', parentId: 'eq-1', equipmentTypeName: null, equipmentCategoryName: null, make: null, model: null, serialNumber: null, locationOnSite: null },
      { id: 'coil-1', name: 'Evaporator Coil', parentId: 'eq-1', equipmentTypeName: null, equipmentCategoryName: null, make: null, model: null, serialNumber: null, locationOnSite: null },
      { id: 'cap-1', name: 'Capacitor', parentId: 'comp-1', equipmentTypeName: null, equipmentCategoryName: null, make: null, model: null, serialNumber: null, locationOnSite: null },
    ]);
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Upstairs Furnace' })).toBeInTheDocument();
    });

    // Units card is on the Overview tab — no navigation needed.
    expect(screen.getByText('Units')).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: /Compressor/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Evaporator Coil/i })).toBeInTheDocument();
    // Capacitor is a grandchild (child of Compressor) — excluded from the flat card.
    expect(screen.queryByRole('link', { name: /Capacitor/i })).not.toBeInTheDocument();
  });

  it('hides the Filters card when the unit has no filters and the tenant has no sizes', async () => {
    mockGetById.mockResolvedValue(baseEquipment);
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Upstairs Furnace' })).toBeInTheDocument();
    });
    expect(screen.queryByText('Filters')).not.toBeInTheDocument();
  });

  it('shows the Filters card empty state when the tenant has sizes but the unit has none', async () => {
    mockGetById.mockResolvedValue(baseEquipment);
    mockFilterSizesGetAll.mockResolvedValue([
      { id: 's-1', tenantId: 't', lengthIn: 16, widthIn: 20, thicknessIn: 1, sortOrder: 0, archivedAt: null, createdAt: '' },
    ]);
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Upstairs Furnace' })).toBeInTheDocument();
    });
    expect(screen.getByText('Filters')).toBeInTheDocument();
    expect(await screen.findByText(/no filters added yet/i)).toBeInTheDocument();
    // Quick-add chip is rendered for the tenant size ("+ " prefix → substring match).
    expect(screen.getByRole('button', { name: /16×20×1/ })).toBeInTheDocument();
  });

  it('renders the filter list in the Filters card', async () => {
    mockGetById.mockResolvedValue(baseEquipment);
    mockFiltersGetAll.mockResolvedValue([
      { id: 'f-1', equipmentId: 'eq-1', lengthIn: 20, widthIn: 25, thicknessIn: 1, quantity: 2, label: 'Return air' },
    ]);
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Upstairs Furnace' })).toBeInTheDocument();
    });

    expect(await screen.findByText('20×25×1')).toBeInTheDocument();
    expect(screen.getByText('Return air')).toBeInTheDocument();
  });

  it('excludes already-assigned sizes from the quick-add chips and shows note + changed date', async () => {
    mockGetById.mockResolvedValue(baseEquipment);
    mockFiltersGetAll.mockResolvedValue([
      { id: 'f-1', equipmentId: 'eq-1', lengthIn: 16, widthIn: 20, thicknessIn: 1, quantity: 2, label: 'MERV 11', updatedAt: '2026-05-01T12:00:00Z' },
    ]);
    mockFilterSizesGetAll.mockResolvedValue([
      { id: 's-1', tenantId: 't', lengthIn: 16, widthIn: 20, thicknessIn: 1, sortOrder: 0, archivedAt: null, createdAt: '' }, // already assigned
      { id: 's-2', tenantId: 't', lengthIn: 20, widthIn: 25, thicknessIn: 1, sortOrder: 1, archivedAt: null, createdAt: '' }, // suggestable
    ]);
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Upstairs Furnace' })).toBeInTheDocument();
    });

    // Assigned row: size (no "+" prefix) + note + a "changed …" stamp.
    expect(await screen.findByText('16×20×1')).toBeInTheDocument();
    expect(screen.getByText('MERV 11')).toBeInTheDocument();
    expect(screen.getByText(/changed/i)).toBeInTheDocument();
    // Quick add suggests the unassigned size but not the already-assigned one.
    expect(screen.getByRole('button', { name: /20×25×1/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /\+ 16×20×1/ })).not.toBeInTheDocument();
  });

  it('collapses the chip palette to 8 entries with a show-all toggle when there are more', async () => {
    mockGetById.mockResolvedValue(baseEquipment);
    // 12 sizes — should render 8 by default, with a "Show all (12)" toggle.
    const sizes = Array.from({ length: 12 }, (_, i) => ({
      id: `s-${i}`,
      tenantId: 't',
      lengthIn: 10 + i,
      widthIn: 20,
      thicknessIn: 1,
      sortOrder: i,
      archivedAt: null,
      createdAt: '',
    }));
    mockFilterSizesGetAll.mockResolvedValue(sizes);
    const user = userEvent.setup();
    renderPage();

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Upstairs Furnace' })).toBeInTheDocument()
    );

    // Default view: 8 chips visible (index 0), 9th+ hidden until toggled.
    // Chips carry a "+ " prefix, so match the size as a substring.
    await waitFor(() => expect(screen.getByText(/10×20×1/)).toBeInTheDocument());
    expect(screen.queryByText(/18×20×1/)).not.toBeInTheDocument(); // index 8
    expect(screen.queryByText(/21×20×1/)).not.toBeInTheDocument(); // index 11

    // Click Show all → all 12 chips visible.
    await user.click(screen.getByRole('button', { name: /show all \(12\)/i }));
    expect(screen.getByText(/18×20×1/)).toBeInTheDocument();
    expect(screen.getByText(/21×20×1/)).toBeInTheDocument();

    // Show fewer collapses back to 8.
    await user.click(screen.getByRole('button', { name: /show fewer/i }));
    expect(screen.queryByText(/18×20×1/)).not.toBeInTheDocument();
  });

  it('renders quick-add chips and pre-fills dimensions when one is clicked', async () => {
    mockGetById.mockResolvedValue(baseEquipment);
    mockFilterSizesGetAll.mockResolvedValue([
      { id: 's-1', tenantId: 't', lengthIn: 16, widthIn: 20, thicknessIn: 1, sortOrder: 0, archivedAt: null, createdAt: '' },
    ]);
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Upstairs Furnace' })).toBeInTheDocument();
    });

    const chip = await screen.findByRole('button', { name: /16×20×1/ });
    await user.click(chip);

    // Dialog opens with dimensions pre-filled.
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect((screen.getByLabelText(/length/i) as HTMLInputElement).value).toBe('16');
    expect((screen.getByLabelText(/width/i) as HTMLInputElement).value).toBe('20');
    expect((screen.getByLabelText(/thickness/i) as HTMLInputElement).value).toBe('1');
  });

  it('deletes a filter after confirmation', async () => {
    mockGetById.mockResolvedValue(baseEquipment);
    mockFiltersGetAll.mockResolvedValue([
      { id: 'f-1', equipmentId: 'eq-1', lengthIn: 20, widthIn: 25, thicknessIn: 1, quantity: 1, label: null },
    ]);
    mockFilterDelete.mockResolvedValue(undefined);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Upstairs Furnace' })).toBeInTheDocument();
    });
    await waitFor(() => expect(screen.getByText('20×25×1')).toBeInTheDocument());

    // Header carries its own overflow (Delete equipment); the filter row menu is the second match.
    await user.click(screen.getAllByRole('button', { name: /more options/i })[1]);
    const deleteItem = await screen.findByRole('menuitem', { name: /delete/i });
    await user.click(deleteItem);

    await waitFor(() => {
      expect(confirmSpy).toHaveBeenCalled();
      expect(mockFilterDelete).toHaveBeenCalledWith('eq-1', 'f-1');
    });
    confirmSpy.mockRestore();
  });

  it('inline-edits the single-field cards (on-site, description) per-field', async () => {
    mockGetById.mockResolvedValue(baseEquipment);
    mockUpdate.mockResolvedValue(baseEquipment);
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Upstairs Furnace' })).toBeInTheDocument());

    // On-site + description stay per-field click-to-edit (single-field cards) —
    // the multi-field Identity card is the only one that went card-level.
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

  it('retires the equipment from the destructive footer', async () => {
    mockGetById.mockResolvedValue(baseEquipment);
    mockUpdate.mockResolvedValue({ ...baseEquipment, status: 'RETIRED' });
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Upstairs Furnace' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /^retire$/i }));
    // Confirm dialog → confirm the retirement.
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /^retire$/i }));

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith('eq-1', { status: 'RETIRED' });
    });
  });

  it('opens the Add Filter dialog (empty) from the Custom… chip', async () => {
    mockGetById.mockResolvedValue(baseEquipment);
    // A tenant size makes the Filters card render even with no filters yet.
    mockFilterSizesGetAll.mockResolvedValue([
      { id: 's-1', tenantId: 't', lengthIn: 16, widthIn: 20, thicknessIn: 1, sortOrder: 0, archivedAt: null, createdAt: '' },
    ]);
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Upstairs Furnace' })).toBeInTheDocument();
    });
    await user.click(await screen.findByRole('button', { name: /custom/i }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect((screen.getByLabelText(/length/i) as HTMLInputElement).value).toBe('');
  });

  it('opens the edit dialog for a filter row with values pre-filled', async () => {
    mockGetById.mockResolvedValue(baseEquipment);
    mockFiltersGetAll.mockResolvedValue([
      { id: 'f-1', equipmentId: 'eq-1', lengthIn: 16, widthIn: 20, thicknessIn: 1, quantity: 4, label: 'Pre-filter' },
    ]);
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Upstairs Furnace' })).toBeInTheDocument();
    });
    await waitFor(() => expect(screen.getByText('16×20×1')).toBeInTheDocument());

    // Header overflow is index 0; the filter row menu is index 1.
    await user.click(screen.getAllByRole('button', { name: /more options/i })[1]);
    const editItem = await screen.findByRole('menuitem', { name: /edit/i });
    await user.click(editItem);

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect((screen.getByLabelText(/length/i) as HTMLInputElement).value).toBe('16');
    expect((screen.getByLabelText(/quantity/i) as HTMLInputElement).value).toBe('4');
    expect((screen.getByLabelText(/label/i) as HTMLInputElement).value).toBe('Pre-filter');
  });

  it('surfaces the backend message via toast when filter delete fails', async () => {
    mockGetById.mockResolvedValue(baseEquipment);
    mockFiltersGetAll.mockResolvedValue([
      { id: 'f-1', equipmentId: 'eq-1', lengthIn: 20, widthIn: 25, thicknessIn: 1, quantity: 1, label: null },
    ]);
    mockFilterDelete.mockRejectedValue(
      Object.assign(new Error('boom'), {
        response: { data: { message: 'Filter is referenced by an open work order.' } },
      })
    );
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Upstairs Furnace' })).toBeInTheDocument();
    });
    await waitFor(() => expect(screen.getByText('20×25×1')).toBeInTheDocument());

    await user.click(screen.getAllByRole('button', { name: /more options/i })[1]);
    const deleteItem = await screen.findByRole('menuitem', { name: /delete/i });
    await user.click(deleteItem);

    await waitFor(() => {
      // Backend message flows through extractApiError into the toast description.
      expect(mockShowError).toHaveBeenCalledWith(
        expect.any(String),
        'Filter is referenced by an open work order.'
      );
    });
    confirmSpy.mockRestore();
  });

  it('renders empty state on the photos tab when no photos exist', async () => {
    mockGetById.mockResolvedValue(baseEquipment);
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Upstairs Furnace' })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('tab', { name: /^media/i }));
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

    const photosTab = await screen.findByRole('tab', { name: /^media\s*2$/i });
    await user.click(photosTab);

    // The profile image leads the gallery, marked "Profile" (label, not a toggle);
    // the non-profile image keeps a "set as profile" control.
    await waitFor(() => expect(screen.getAllByText(/^profile$/i).length).toBeGreaterThan(0));
    expect(screen.queryByRole('button', { name: /^profile$/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^set as profile$/i })).toBeInTheDocument();
    const thumbs = screen.getAllByRole('img');
    expect(thumbs.length).toBeGreaterThanOrEqual(2);
  });

  it('opens the lightbox in place when an overview Media peek photo is clicked', async () => {
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
        isProfile: true,
        sortOrder: 0,
        caption: 'Nameplate',
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
    // Overview is the default tab; the Media peek shows the profile photo tile.
    await user.click(await screen.findByRole('button', { name: /nameplate/i }));

    // The lightbox opens here (full-res image) rather than jumping to the Media tab.
    await waitFor(() => {
      expect(
        document.querySelector('img[src="https://cdn.example.com/full-1.jpg"]')
      ).toBeInTheDocument();
    });
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
    await user.click(screen.getByRole('tab', { name: /^media/i }));

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
    await user.click(screen.getByRole('tab', { name: /^media/i }));

    // Header overflow appears first; the photo row's overflow is at index 1.
    const moreButtons = await screen.findAllByRole('button', { name: /more options/i });
    await user.click(moreButtons[1]);
    const deleteItem = await screen.findByRole('menuitem', { name: /delete/i });
    await user.click(deleteItem);

    await waitFor(() => {
      expect(mockImageDelete).toHaveBeenCalledWith('eq-1', 'img-1');
    });
    confirmSpy.mockRestore();
  });

  it('opens the media upload dialog from the Add media button', async () => {
    mockGetById.mockResolvedValue(baseEquipment);
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Upstairs Furnace' })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('tab', { name: /^media/i }));
    // One "Add media" control — a single drop-zone dialog for photos + videos.
    await user.click(screen.getByRole('button', { name: /add media/i }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/drag photos or videos here/i)).toBeInTheDocument();
  });

  it('uploads a video through the Add media dialog', async () => {
    mockGetById.mockResolvedValue(baseEquipment);
    mockFilesUpload.mockResolvedValue({ id: 'vid-x', kind: 'VIDEO', status: 'READY' });
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Upstairs Furnace' })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('tab', { name: /^media/i }));
    await user.click(screen.getByRole('button', { name: /add media/i }));

    const dialog = await screen.findByRole('dialog');
    const fileInput = dialog.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['x'], 'clip.mp4', { type: 'video/mp4' });
    await user.upload(fileInput, file);
    await user.click(within(dialog).getByRole('button', { name: /^upload$/i }));

    await waitFor(() => {
      expect(mockFilesUpload).toHaveBeenCalledWith('eq-1', file, expect.objectContaining({ caption: null }));
    });
  });

  it('always shows the service-history peek with an empty state when there is no history', async () => {
    mockGetById.mockResolvedValue(baseEquipment);
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Upstairs Furnace' })).toBeInTheDocument();
    });
    // Identity card present; service-history peek shows its empty state.
    expect(screen.getByText('Identity')).toBeInTheDocument();
    expect(screen.getByText(/no work orders yet/i)).toBeInTheDocument();
  });

  it('renders the service-history peek and View all jumps to the Service History tab', async () => {
    mockGetById.mockResolvedValue(baseEquipment);
    mockWorkOrdersGetAll.mockResolvedValue({
      content: [
        {
          id: 'wo-1',
          workOrderNumber: 'WO-00010',
          customerId: 'c-1',
          serviceLocationId: 'loc-1',
          lifecycleState: 'ACTIVE',
          progressCategory: 'IN_PROGRESS',
          priority: 'NORMAL',
          scheduledDate: '2026-04-24',
          workItemCount: 2,
          workItems: [
            { description: 'Replace condenser coil', statusCategory: 'IN_PROGRESS' },
            { description: 'Inspect ductwork', statusCategory: 'NOT_STARTED' },
          ],
          createdAt: '2026-04-20T12:00:00Z',
          updatedAt: '2026-04-24T12:00:00Z',
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

    // The peek surfaces the WO number, the first work item + a "+N more" hint.
    expect(await screen.findByText('WO-00010')).toBeInTheDocument();
    expect(screen.getByText(/replace condenser coil/i)).toBeInTheDocument();
    expect(screen.getByText(/\+1 more/i)).toBeInTheDocument();

    // "View all" opens the Service history tab (its search box appears).
    await user.click(screen.getByRole('button', { name: /view all/i }));
    expect(await screen.findByPlaceholderText(/search work/i)).toBeInTheDocument();
  });

  it('renders the notes card on Overview from the notes list', async () => {
    mockGetById.mockResolvedValue(baseEquipment);
    mockNotesList.mockResolvedValue([
      { id: 'n-1', body: 'Replaced compressor', authorUserId: 'u-1', authorName: 'Jane', pinned: false, createdAt: '2026-05-01T12:00:00Z', updatedAt: '2026-05-01T12:00:00Z' },
      { id: 'n-2', body: 'Filter due', authorUserId: 'u-2', authorName: 'Bob', pinned: false, createdAt: '2026-04-20T09:00:00Z', updatedAt: '2026-04-20T09:00:00Z' },
    ]);
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Upstairs Furnace' })).toBeInTheDocument();
    });

    expect(await screen.findByText('Replaced compressor')).toBeInTheDocument();
    expect(screen.getByText('Filter due')).toBeInTheDocument();
  });

  it('shows the notes card empty state with an Add affordance', async () => {
    mockGetById.mockResolvedValue(baseEquipment);
    mockNotesList.mockResolvedValue([]);
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Upstairs Furnace' })).toBeInTheDocument();
    });

    // No sub-units here, so the only "+ Add" is the notes card's.
    expect(await screen.findByText(/no notes yet/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^\+ add$/i })).toBeInTheDocument();
  });

  it('opens the note composer from the notes card', async () => {
    mockGetById.mockResolvedValue(baseEquipment);
    mockNotesList.mockResolvedValue([]);
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Upstairs Furnace' })).toBeInTheDocument();
    });
    await user.click(await screen.findByRole('button', { name: /^\+ add$/i }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('surfaces a toast and stays in edit mode when the Identity PATCH fails', async () => {
    mockGetById.mockResolvedValue(baseEquipment);
    mockUpdate.mockRejectedValue(
      Object.assign(new Error('boom'), {
        response: { data: { message: 'Validation failed' } },
      })
    );
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Upstairs Furnace' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    const makeInput = await screen.findByDisplayValue('Carrier');
    await user.clear(makeInput);
    await user.type(makeInput, 'Bad');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(mockShowError).toHaveBeenCalledWith(expect.any(String), 'Validation failed');
    });
    // Card stays in edit mode on error (Save is still present, draft not lost).
    expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument();
  });

  it('navigates to the full editor from the ⋯ Advanced edit action', async () => {
    mockGetById.mockResolvedValue(baseEquipment);
    const user = userEvent.setup();
    const { router } = renderPage();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Upstairs Furnace' })).toBeInTheDocument();
    });

    // The prominent header Edit button moved into the ⋯ menu as "Advanced edit"
    // (the doc's fallback for recategorize/reassign); inline cards are primary.
    await user.click(screen.getAllByRole('button', { name: /more options/i })[0]);
    await user.click(await screen.findByRole('menuitem', { name: /advanced edit/i }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/equipment/eq-1/edit'));
  });

  it('deletes the equipment from the header overflow and navigates back', async () => {
    mockGetById.mockResolvedValue(baseEquipment);
    mockDelete.mockResolvedValue(undefined);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Upstairs Furnace' })).toBeInTheDocument();
    });

    // Header overflow is the first ⋯ button on the page (no row-level overflow on Overview).
    await user.click(screen.getAllByRole('button', { name: /more options/i })[0]);
    const deleteItem = await screen.findByRole('menuitem', { name: /delete/i });
    await user.click(deleteItem);

    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalledWith('eq-1');
    });
    confirmSpy.mockRestore();
  });

  it('edits a photo caption from the row menu', async () => {
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
        isProfile: false,
        sortOrder: 0,
        caption: 'Old caption',
        uploadedBy: null,
        uploadedByName: null,
        createdAt: '',
      },
    ]);
    mockImagePatch.mockResolvedValue({});
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('Nameplate');
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Upstairs Furnace' })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('tab', { name: /^media/i }));

    const moreButtons = await screen.findAllByRole('button', { name: /more options/i });
    await user.click(moreButtons[1]);
    await user.click(await screen.findByRole('menuitem', { name: /caption/i }));

    await waitFor(() => {
      expect(mockImagePatch).toHaveBeenCalledWith('eq-1', 'img-1', { caption: 'Nameplate' });
    });
    promptSpy.mockRestore();
  });

  it('surfaces a toast when setting the profile image fails', async () => {
    mockGetById.mockResolvedValue(baseEquipment);
    mockImagesList.mockResolvedValue([
      { id: 'img-1', url: 'u', thumbnailUrl: 't', contentType: 'image/jpeg', sizeBytes: 1, widthPx: 1, heightPx: 1, isProfile: false, sortOrder: 0, caption: null, uploadedBy: null, uploadedByName: null, createdAt: '' },
    ]);
    mockImagePatch.mockRejectedValue(
      Object.assign(new Error('x'), { response: { data: { message: 'Cannot set profile' } } })
    );
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Upstairs Furnace' })).toBeInTheDocument());
    await user.click(screen.getByRole('tab', { name: /^media/i }));
    await user.click(await screen.findByRole('button', { name: /set as profile/i }));

    await waitFor(() => {
      expect(mockShowError).toHaveBeenCalledWith(expect.any(String), 'Cannot set profile');
    });
  });

  it('surfaces a toast when editing a caption fails', async () => {
    mockGetById.mockResolvedValue(baseEquipment);
    mockImagesList.mockResolvedValue([
      { id: 'img-1', url: 'u', thumbnailUrl: 't', contentType: 'image/jpeg', sizeBytes: 1, widthPx: 1, heightPx: 1, isProfile: false, sortOrder: 0, caption: 'Old', uploadedBy: null, uploadedByName: null, createdAt: '' },
    ]);
    mockImagePatch.mockRejectedValue(
      Object.assign(new Error('x'), { response: { data: { message: 'Bad caption' } } })
    );
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('New');
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Upstairs Furnace' })).toBeInTheDocument());
    await user.click(screen.getByRole('tab', { name: /^media/i }));
    await user.click((await screen.findAllByRole('button', { name: /more options/i }))[1]);
    await user.click(await screen.findByRole('menuitem', { name: /caption/i }));

    await waitFor(() => {
      expect(mockShowError).toHaveBeenCalledWith(expect.any(String), 'Bad caption');
    });
    promptSpy.mockRestore();
  });

  it('surfaces a toast when deleting a photo fails', async () => {
    mockGetById.mockResolvedValue(baseEquipment);
    mockImagesList.mockResolvedValue([
      { id: 'img-1', url: 'u', thumbnailUrl: 't', contentType: 'image/jpeg', sizeBytes: 1, widthPx: 1, heightPx: 1, isProfile: false, sortOrder: 0, caption: null, uploadedBy: null, uploadedByName: null, createdAt: '' },
    ]);
    mockImageDelete.mockRejectedValue(
      Object.assign(new Error('x'), { response: { data: { message: 'Cannot delete' } } })
    );
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Upstairs Furnace' })).toBeInTheDocument());
    await user.click(screen.getByRole('tab', { name: /^media/i }));
    await user.click((await screen.findAllByRole('button', { name: /more options/i }))[1]);
    await user.click(await screen.findByRole('menuitem', { name: /delete/i }));

    await waitFor(() => {
      expect(mockShowError).toHaveBeenCalledWith(expect.any(String), 'Cannot delete');
    });
    confirmSpy.mockRestore();
  });

  it('navigates to the scoped add form with ?parent from the Units card', async () => {
    mockGetById.mockResolvedValue(baseEquipment);
    mockGetDescendants.mockResolvedValue([
      { id: 'comp-1', name: 'Compressor', parentId: 'eq-1', equipmentTypeName: null, equipmentCategoryName: null, make: null, model: null, serialNumber: null, locationOnSite: null },
    ]);
    const user = userEvent.setup();
    const { router } = renderPage();

    await waitFor(() => {
      expect(screen.getByText('Units')).toBeInTheDocument();
    });
    // Both Units and Notes cards expose a "+ Add"; Units sits first in the left
    // column, so its action is the first match.
    await user.click((await screen.findAllByRole('button', { name: /^\+ add$/i }))[0]);
    await waitFor(() => {
      // baseEquipment.serviceLocationId === 'loc-1'; the unit becomes the parent.
      expect(router.state.location.pathname).toBe('/service-locations/loc-1/equipment/new');
      expect(router.state.location.search).toContain('parent=eq-1');
    });
  });

  it('opens the new work order dialog from the header', async () => {
    mockGetById.mockResolvedValue(baseEquipment);
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Upstairs Furnace' })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: /new work order/i }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('shows the media peek on overview with the nameplate called out and a video thumb', async () => {
    mockGetById.mockResolvedValue(baseEquipment);
    mockImagesList.mockResolvedValue([
      { id: 'img-1', url: 'https://cdn/full-1.jpg', thumbnailUrl: 'https://cdn/thumb-1.jpg', contentType: 'image/jpeg', sizeBytes: 1, widthPx: 1, heightPx: 1, isProfile: true, sortOrder: 0, caption: 'Plate', uploadedBy: null, uploadedByName: null, createdAt: '' },
      { id: 'img-2', url: 'https://cdn/full-2.jpg', thumbnailUrl: 'https://cdn/thumb-2.jpg', contentType: 'image/jpeg', sizeBytes: 1, widthPx: 1, heightPx: 1, isProfile: false, sortOrder: 1, caption: null, uploadedBy: null, uploadedByName: null, createdAt: '' },
    ]);
    mockFilesList.mockResolvedValue({
      content: [
        { id: 'vid-1', kind: 'VIDEO', status: 'READY', fileName: 'run.mp4', url: 'https://cdn/run.mp4', thumbnailUrl: 'https://cdn/poster.jpg', durationSeconds: 45, caption: null, isProfile: false, uploadedBy: null, uploadedByName: null, createdAt: '' },
      ],
    });
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Upstairs Furnace' })).toBeInTheDocument();
    });
    // Profile photo called out (badge + label) + the video thumb shows its duration.
    expect((await screen.findAllByText(/^profile$/i)).length).toBeGreaterThan(0);
    expect(await screen.findByText('0:45')).toBeInTheDocument();

    // "View all" jumps to the Media tab (2 photos + 1 video = 3).
    await user.click(screen.getByRole('button', { name: /view all/i }));
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /^media\s*3$/i })).toHaveAttribute('aria-selected', 'true');
    });
  });

  it('shows both photos and videos sections on the Media tab', async () => {
    mockGetById.mockResolvedValue(baseEquipment);
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Upstairs Furnace' })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('tab', { name: /^media/i }));

    expect(await screen.findByText(/no photos added yet/i)).toBeInTheDocument();
    expect(screen.getByText(/no videos yet/i)).toBeInTheDocument();
  });

  it('reactivates a retired unit from the footer', async () => {
    mockGetById.mockResolvedValue({ ...baseEquipment, status: 'RETIRED' });
    mockUpdate.mockResolvedValue({ ...baseEquipment, status: 'ACTIVE' });
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Upstairs Furnace' })).toBeInTheDocument();
    });
    // Retired units carry a status pill in the header.
    expect(screen.getByText('Retired')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^reactivate$/i }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /^reactivate$/i }));

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith('eq-1', { status: 'ACTIVE' });
    });
  });
});
