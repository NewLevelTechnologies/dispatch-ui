import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import WorkItemEquipmentBlock from './WorkItemEquipmentBlock';
import apiClient from '../api/client';
import type { WorkItemEquipmentSummary } from '../api';

const mockGetById = vi.fn();
const mockImagesList = vi.fn();

vi.mock('../api/equipmentApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/equipmentApi')>();
  return {
    ...actual,
    equipmentApi: { ...actual.equipmentApi, getById: (...a: unknown[]) => mockGetById(...a) },
    equipmentImagesApi: { ...actual.equipmentImagesApi, list: (...a: unknown[]) => mockImagesList(...a) },
  };
});

vi.mock('../api/client');

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
    // Service-history list: 3 WOs touch this unit → 2 prior visits (minus current).
    vi.mocked(apiClient.get).mockResolvedValue({ data: { content: [], totalElements: 3 } } as never);
  });

  it('renders make/model, installed · age, warranty, and prior-visit + last-serviced', async () => {
    renderWithProviders(<WorkItemEquipmentBlock equipment={equipment} readOnly={false} />);
    expect(screen.getByText('Carrier 24ACC636')).toBeInTheDocument();
    expect(screen.getByText(/out of warranty/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText(/installed Mar 2019/)).toBeInTheDocument();
      // Exact day is timezone-dependent; assert the count + "last" prefix only.
      expect(screen.getByText(/2 prior visits · last/)).toBeInTheDocument();
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
});
