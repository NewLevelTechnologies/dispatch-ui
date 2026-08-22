import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import EquipmentQuickView from './EquipmentQuickView';
import type { Equipment } from '../api/setup';

const mockGetById = vi.fn();
const mockUpdate = vi.fn();
const mockNotesCreate = vi.fn();
const mockNotesUpdate = vi.fn();
const mockNotesDelete = vi.fn();

vi.mock('@dispatch/api/src/equipmentApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/setup')>();
  return {
    ...actual,
    equipmentApi: {
      getById: (...args: unknown[]) => mockGetById(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
    },
    equipmentNotesApi: {
      ...actual.equipmentNotesApi,
      create: (...args: unknown[]) => mockNotesCreate(...args),
      update: (...args: unknown[]) => mockNotesUpdate(...args),
      delete: (...args: unknown[]) => mockNotesDelete(...args),
    },
  };
});

vi.mock('@dispatch/api/src/client');

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
    mockNotesCreate.mockResolvedValue({});
    mockNotesUpdate.mockResolvedValue({});
    mockNotesDelete.mockResolvedValue(undefined);
  });

  const note = {
    id: 'n1',
    body: 'Rooftop access via ladder',
    authorName: 'A. Reyes',
    createdAt: '2025-11-02T12:00:00Z',
  };

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
    // Subtitle reads type · category (app convention: broad grouping first).
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

  it('edits the make field and persists via equipmentApi.update on Save', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <EquipmentQuickView equipmentId="eq-1" onSelectSubUnit={vi.fn()} />
    );
    await waitFor(() => expect(screen.getByText('Goodman')).toBeInTheDocument());

    // Identification becomes an edit form after entering Edit mode (mock §5);
    // changes persist on Save.
    await user.click(screen.getByRole('button', { name: /^edit$/i }));
    const input = await screen.findByRole('textbox', { name: /^make$/i });
    await user.clear(input);
    await user.type(input, 'Trane');
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith('eq-1', expect.objectContaining({ make: 'Trane' }));
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

  it('renders an always-on Units section with "+ Add unit" for a top-level system', async () => {
    // The work-item card hides its units row at zero, so the drawer is the
    // guaranteed home for adding the first unit on a parent system.
    mockGetById.mockResolvedValue({ ...baseEquipment, descendants: [], descendantCount: 0 });
    renderWithProviders(<EquipmentQuickView equipmentId="eq-1" onSelectSubUnit={vi.fn()} />);
    await waitFor(() =>
      expect(screen.getByText(/no units on this system/i)).toBeInTheDocument()
    );
    expect(screen.getByRole('button', { name: /add unit/i })).toBeInTheDocument();
  });

  it('hides "+ Add unit" when viewing a sub-unit — adding there would create a depth-2 record', async () => {
    mockGetById.mockResolvedValue({
      ...baseEquipment,
      parentId: 'parent-1',
      parentName: 'Rooftop system',
      descendants: [{ id: 'sub-1', name: 'Compressor', profileImageUrl: null }],
      descendantCount: 1,
    });
    renderWithProviders(<EquipmentQuickView equipmentId="eq-1" onSelectSubUnit={vi.fn()} />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /compressor/i })).toBeInTheDocument()
    );
    expect(screen.queryByRole('button', { name: /add unit/i })).not.toBeInTheDocument();
  });

  it('renders equipment-scoped notes', async () => {
    mockGetById.mockResolvedValue({ ...baseEquipment, recentNotes: [note], noteCount: 1 });
    renderWithProviders(<EquipmentQuickView equipmentId="eq-1" onSelectSubUnit={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Rooftop access via ladder')).toBeInTheDocument());
    expect(screen.getByText(/A\. Reyes/)).toBeInTheDocument();
  });

  it('adds a note via equipmentNotesApi.create', async () => {
    const user = userEvent.setup();
    renderWithProviders(<EquipmentQuickView equipmentId="eq-1" onSelectSubUnit={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Outdoor HVAC unit')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /add note/i }));
    await user.type(await screen.findByRole('textbox', { name: /note body/i }), 'New service note');
    await user.click(screen.getByRole('button', { name: /^save$/i }));
    await waitFor(() => expect(mockNotesCreate).toHaveBeenCalledWith('eq-1', { body: 'New service note' }));
  });

  it('edits an existing note via equipmentNotesApi.update', async () => {
    mockGetById.mockResolvedValue({ ...baseEquipment, recentNotes: [note], noteCount: 1 });
    const user = userEvent.setup();
    renderWithProviders(<EquipmentQuickView equipmentId="eq-1" onSelectSubUnit={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Rooftop access via ladder')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /rooftop access via ladder/i }));
    const box = await screen.findByRole('textbox', { name: /note body/i });
    await user.clear(box);
    await user.type(box, 'Updated note');
    await user.click(screen.getByRole('button', { name: /^save$/i }));
    await waitFor(() => expect(mockNotesUpdate).toHaveBeenCalledWith('eq-1', 'n1', { body: 'Updated note' }));
  });

  it('deletes a note through the confirm dialog', async () => {
    mockGetById.mockResolvedValue({ ...baseEquipment, recentNotes: [note], noteCount: 1 });
    const user = userEvent.setup();
    renderWithProviders(<EquipmentQuickView equipmentId="eq-1" onSelectSubUnit={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Rooftop access via ladder')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /^delete$/i }));
    const deletes = await screen.findAllByRole('button', { name: /^delete$/i });
    await user.click(deletes[deletes.length - 1]);
    await waitFor(() => expect(mockNotesDelete).toHaveBeenCalledWith('eq-1', 'n1'));
  });
});
