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

  it('switches to a placeholder for non-overview tabs', async () => {
    mockGetById.mockResolvedValue(baseEquipment);
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Upstairs Furnace' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /^filters$/i }));
    expect(screen.getByText(/coming soon/i)).toBeInTheDocument();
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
