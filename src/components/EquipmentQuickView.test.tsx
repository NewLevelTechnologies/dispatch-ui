import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import EquipmentQuickView from './EquipmentQuickView';
import type { Equipment } from '../api';

const mockGetById = vi.fn();
const mockUpdate = vi.fn();

vi.mock('../api/equipmentApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/equipmentApi')>();
  return {
    ...actual,
    equipmentApi: {
      getById: (...args: unknown[]) => mockGetById(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
    },
  };
});

vi.mock('../api/client');

const baseEquipment: Equipment = {
  id: 'eq-1',
  name: 'Outdoor HVAC unit',
  description: null,
  make: 'Goodman',
  model: 'GSXC18',
  serialNumber: 'SN-ABC',
  assetTag: 'TAG-99',
  parentId: null,
  parentName: null,
  equipmentTypeId: 't-hvac',
  equipmentTypeName: 'HVAC',
  equipmentCategoryId: 'c-air-handler',
  equipmentCategoryName: 'Air Handler',
  serviceLocationId: 'sl-1',
  locationOnSite: 'Roof',
  installDate: '2022-06-15',
  lastServicedAt: null,
  warrantyExpiresAt: null,
  warrantyDetails: null,
  status: 'ACTIVE',
  profileImageUrl: null,
  descendants: [],
  descendantCount: 0,
};

describe('EquipmentQuickView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetById.mockResolvedValue(baseEquipment);
    mockUpdate.mockResolvedValue(baseEquipment);
  });

  it('shows the loading state until the equipment fetch resolves', () => {
    // Pending promise — never resolves
    mockGetById.mockImplementation(() => new Promise(() => {}));
    renderWithProviders(
      <EquipmentQuickView equipmentId="eq-1" onSelectSubUnit={vi.fn()} />
    );
    expect(screen.getByText(/loading equipment/i)).toBeInTheDocument();
  });

  it('renders the header with name, type/category, and ACTIVE pill', async () => {
    renderWithProviders(
      <EquipmentQuickView equipmentId="eq-1" onSelectSubUnit={vi.fn()} />
    );
    await waitFor(() =>
      expect(screen.getByText('Outdoor HVAC unit')).toBeInTheDocument()
    );
    expect(screen.getByText(/HVAC · Air Handler/)).toBeInTheDocument();
    expect(screen.getByText(/^Active$/i)).toBeInTheDocument();
  });

  it('renders an amber pill when the equipment is RETIRED', async () => {
    mockGetById.mockResolvedValue({ ...baseEquipment, status: 'RETIRED' });
    renderWithProviders(
      <EquipmentQuickView equipmentId="eq-1" onSelectSubUnit={vi.fn()} />
    );
    await waitFor(() => expect(screen.getByText(/^Retired$/i)).toBeInTheDocument());
  });

  it('renders Identification field values', async () => {
    renderWithProviders(
      <EquipmentQuickView equipmentId="eq-1" onSelectSubUnit={vi.fn()} />
    );
    await waitFor(() => expect(screen.getByText('Goodman')).toBeInTheDocument());
    expect(screen.getByText('GSXC18')).toBeInTheDocument();
    expect(screen.getByText('SN-ABC')).toBeInTheDocument();
    expect(screen.getByText('TAG-99')).toBeInTheDocument();
    expect(screen.getByText('Roof')).toBeInTheDocument();
  });

  it('inline-edits the make field via equipmentApi.update', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <EquipmentQuickView equipmentId="eq-1" onSelectSubUnit={vi.fn()} />
    );
    await waitFor(() => expect(screen.getByText('Goodman')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /^make$/i }));
    const input = await screen.findByRole('textbox', { name: /^make$/i });
    await user.clear(input);
    await user.type(input, 'Trane');
    input.blur();

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith('eq-1', { make: 'Trane' });
    });
  });

  it('opts in to descendants on the getById request', async () => {
    renderWithProviders(
      <EquipmentQuickView equipmentId="eq-1" onSelectSubUnit={vi.fn()} />
    );
    await waitFor(() => expect(mockGetById).toHaveBeenCalled());
    expect(mockGetById).toHaveBeenCalledWith('eq-1', { includeDescendants: true });
  });

  it('hides the sub-units row when there are no descendants', async () => {
    renderWithProviders(
      <EquipmentQuickView equipmentId="eq-1" onSelectSubUnit={vi.fn()} />
    );
    await waitFor(() =>
      expect(screen.getByText('Outdoor HVAC unit')).toBeInTheDocument()
    );
    // No "Units (N):" label appears when descendants is empty.
    expect(screen.queryByText(/\(\d+\):/)).not.toBeInTheDocument();
  });

  it('renders sub-unit chips and routes clicks through onSelectSubUnit', async () => {
    mockGetById.mockResolvedValue({
      ...baseEquipment,
      descendants: [
        { id: 'sub-1', name: 'Compressor', profileImageUrl: null },
        { id: 'sub-2', name: 'Coil', profileImageUrl: null },
      ],
      descendantCount: 2,
    });
    const onSelectSubUnit = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <EquipmentQuickView equipmentId="eq-1" onSelectSubUnit={onSelectSubUnit} />
    );
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /compressor/i })).toBeInTheDocument()
    );

    await user.click(screen.getByRole('button', { name: /compressor/i }));
    expect(onSelectSubUnit).toHaveBeenCalledWith({ id: 'sub-1', name: 'Compressor' });
  });

  it('does not render an "+ Add unit" affordance — adding from the drawer would create depth-2 records', async () => {
    mockGetById.mockResolvedValue({
      ...baseEquipment,
      descendants: [{ id: 'sub-1', name: 'Compressor', profileImageUrl: null }],
      descendantCount: 1,
    });
    renderWithProviders(
      <EquipmentQuickView equipmentId="eq-1" onSelectSubUnit={vi.fn()} />
    );
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /compressor/i })).toBeInTheDocument()
    );
    expect(screen.queryByRole('button', { name: /add unit/i })).not.toBeInTheDocument();
  });
});
