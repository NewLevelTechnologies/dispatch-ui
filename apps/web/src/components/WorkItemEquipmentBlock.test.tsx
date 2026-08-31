import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import WorkItemEquipmentBlock from './WorkItemEquipmentBlock';
import { apiClient } from '../api/setup';
import type { WorkItemEquipmentSummary } from '../api/setup';

const mockGetById = vi.fn();
const mockImagesList = vi.fn();
const mockNotesList = vi.fn();
const mockNotesCreate = vi.fn();

vi.mock('@dispatch/api/src/equipmentApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/setup')>();
  return {
    ...actual,
    equipmentApi: { ...actual.equipmentApi, getById: (...a: unknown[]) => mockGetById(...a) },
    equipmentImagesApi: { ...actual.equipmentImagesApi, list: (...a: unknown[]) => mockImagesList(...a) },
    equipmentNotesApi: {
      ...actual.equipmentNotesApi,
      list: (...a: unknown[]) => mockNotesList(...a),
      create: (...a: unknown[]) => mockNotesCreate(...a),
    },
  };
});

vi.mock('@dispatch/api/src/client');

const equipment: WorkItemEquipmentSummary = {
  id: 'eq-1',
  name: 'Upstairs condenser',
  make: 'Carrier',
  model: '24ACC636',
  serialNumber: 'A1142099',
  equipmentTypeName: 'Condenser',
  warrantyExpiresAt: '2020-01-01', // in the past → "out of warranty"
  profileImageUrl: null,
  descendants: [{ id: 'u-1', name: 'Air handler', profileImageUrl: null }],
  descendantCount: 1,
};

describe('WorkItemEquipmentBlock', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockImagesList.mockResolvedValue([
      { id: 'i1', url: 'u1', thumbnailUrl: 't1', caption: null, isProfile: false, isNameplate: false, sortOrder: 2 },
      { id: 'i2', url: 'u2', thumbnailUrl: 't2', caption: null, isProfile: true, isNameplate: false, sortOrder: 1 },
    ]);
    mockGetById.mockResolvedValue({ id: 'eq-1', installDate: '2019-03-15', lastServicedAt: '2026-03-14T00:00:00Z' });
    mockNotesList.mockResolvedValue([]);
    mockNotesCreate.mockResolvedValue({ id: 'n-new' });
    // Service-history list: 3 WOs touch this unit → 2 prior visits (minus current).
    vi.mocked(apiClient.get).mockResolvedValue({ data: { content: [], totalElements: 3 } } as never);
  });

  it('renders make/model, installed · age, warranty, and prior-visit + last-serviced', async () => {
    renderWithProviders(<WorkItemEquipmentBlock equipment={equipment} readOnly={false} />);
    expect(screen.getByText('Carrier 24ACC636')).toBeInTheDocument();
    expect(screen.getByText(/out of warranty/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText(/installed Mar 2019/)).toBeInTheDocument();
      // Prior-visit count now rides the metadata line (no separate history band).
      // Exact day is timezone-dependent; assert the count + "last" prefix only.
      expect(screen.getByText(/2 prior · last/)).toBeInTheDocument();
    });
  });

  it('opens the equipment drawer from the "Open record" link', async () => {
    const onOpenEquipment = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <WorkItemEquipmentBlock equipment={equipment} readOnly={false} onOpenEquipment={onOpenEquipment} />
    );
    await user.click(screen.getByRole('button', { name: 'Open record →' }));
    expect(onOpenEquipment).toHaveBeenCalledWith({ id: 'eq-1', name: 'Upstairs condenser' });
  });

  it('routes unit-chip clicks through onSelectSubUnit and Change through onChange', async () => {
    const onSelectSubUnit = vi.fn();
    const onChange = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <WorkItemEquipmentBlock
        equipment={equipment}
        readOnly={false}
        onSelectSubUnit={onSelectSubUnit}
        onChange={onChange}
      />
    );
    await user.click(screen.getByRole('button', { name: /air handler/i }));
    expect(onSelectSubUnit).toHaveBeenCalledWith({ id: 'u-1', name: 'Air handler' });
    await user.click(screen.getByRole('button', { name: /^change$/i }));
    expect(onChange).toHaveBeenCalled();
  });

  it('opens the drawer from the thumbnail, shows the photo overflow, and opens Add photo', async () => {
    mockImagesList.mockResolvedValue(
      Array.from({ length: 5 }, (_, i) => ({
        id: `i${i}`,
        url: `u${i}`,
        thumbnailUrl: `t${i}`,
        caption: null,
        isProfile: i === 0,
        isNameplate: false,
        sortOrder: i,
      }))
    );
    const onOpenEquipment = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <WorkItemEquipmentBlock equipment={equipment} readOnly={false} onOpenEquipment={onOpenEquipment} />
    );
    await user.click(screen.getByRole('button', { name: 'Open record' }));
    expect(onOpenEquipment).toHaveBeenCalledWith({ id: 'eq-1', name: 'Upstairs condenser' });
    await waitFor(() => expect(screen.getByText('+1')).toBeInTheDocument()); // 5 photos → 4 shown + 1 overflow
    await user.click(screen.getByText('+1'));
    await user.click(screen.getByRole('button', { name: /capture/i }));
  });

  it('hides Change / Add photo / Add unit in readOnly mode', () => {
    renderWithProviders(
      <WorkItemEquipmentBlock equipment={equipment} readOnly onSelectSubUnit={vi.fn()} onAddSubUnit={vi.fn()} />
    );
    expect(screen.queryByRole('button', { name: /^change$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /add/i })).not.toBeInTheDocument();
  });

  it('shows the most-recent equipment note + a count link into the drawer', async () => {
    mockNotesList.mockResolvedValue([
      { id: 'n1', body: 'Older note', authorName: 'Bri', authorUserId: null, pinned: false, createdAt: '2026-03-01T00:00:00Z', updatedAt: '2026-03-01T00:00:00Z' },
      { id: 'n2', body: 'Disconnect is in the garage panel', authorName: 'Daniel', authorUserId: null, pinned: false, createdAt: '2026-05-01T00:00:00Z', updatedAt: '2026-05-01T00:00:00Z' },
    ]);
    const onOpenEquipment = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <WorkItemEquipmentBlock equipment={equipment} readOnly={false} onOpenEquipment={onOpenEquipment} />
    );
    // The newest note (by createdAt) shows inline, not the older one.
    await waitFor(() =>
      expect(screen.getByText(/disconnect is in the garage panel/i)).toBeInTheDocument()
    );
    // Count derives from the list length; the link opens the drawer's full list.
    await user.click(screen.getByRole('button', { name: /2 notes/i }));
    expect(onOpenEquipment).toHaveBeenCalledWith({ id: 'eq-1', name: 'Upstairs condenser' });
  });

  it('adds an equipment note inline via "+ Note" (scope hint, no modal)', async () => {
    const user = userEvent.setup();
    renderWithProviders(<WorkItemEquipmentBlock equipment={equipment} readOnly={false} />);
    await user.click(screen.getByRole('button', { name: /^note$/i }));
    // The scope hint makes clear the note follows the equipment, not this job.
    expect(screen.getByText(/follows the unit to every work order/i)).toBeInTheDocument();
    await user.type(screen.getByRole('textbox'), 'Disconnect box corroded');
    await user.click(screen.getByRole('button', { name: /^save$/i }));
    await waitFor(() =>
      expect(mockNotesCreate).toHaveBeenCalledWith('eq-1', { body: 'Disconnect box corroded' })
    );
  });
});
