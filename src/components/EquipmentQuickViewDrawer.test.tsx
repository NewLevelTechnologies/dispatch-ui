import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import EquipmentQuickViewDrawer from './EquipmentQuickViewDrawer';
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

const buildEquipment = (overrides: Partial<Equipment> = {}): Equipment => ({
  id: 'eq-root',
  name: 'Outdoor HVAC unit',
  description: null,
  make: null,
  model: null,
  serialNumber: null,
  assetTag: null,
  parentId: null,
  parentName: null,
  equipmentTypeId: null,
  equipmentTypeName: null,
  equipmentCategoryId: null,
  equipmentCategoryName: null,
  serviceLocationId: 'sl-1',
  locationOnSite: null,
  installDate: null,
  lastServicedAt: null,
  warrantyExpiresAt: null,
  warrantyDetails: null,
  status: 'ACTIVE',
  profileImageUrl: null,
  descendants: [],
  descendantCount: 0,
  ...overrides,
});

describe('EquipmentQuickViewDrawer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetById.mockImplementation((id: string) =>
      Promise.resolve(buildEquipment({ id, name: `Equipment ${id}` }))
    );
  });

  it('renders nothing when initialEquipment is null', () => {
    renderWithProviders(
      <EquipmentQuickViewDrawer initialEquipment={null} onClose={vi.fn()} />
    );
    expect(screen.queryByText(/^Equipment /)).not.toBeInTheDocument();
  });

  it('opens with the supplied initial equipment loaded', async () => {
    renderWithProviders(
      <EquipmentQuickViewDrawer
        initialEquipment={{ id: 'eq-root', name: 'Outdoor HVAC unit' }}
        onClose={vi.fn()}
      />
    );
    await waitFor(() =>
      expect(mockGetById).toHaveBeenCalledWith('eq-root', { includeDescendants: true })
    );
    // Wait for the EquipmentQuickView re-render after the query resolves —
    // the mock returns name="Equipment eq-root" so the rendered title
    // tracks that.
    await waitFor(() =>
      expect(screen.getByText('Equipment eq-root')).toBeInTheDocument()
    );
  });

  it('renders an "Open page" link in the header pointing to the current equipment', async () => {
    renderWithProviders(
      <EquipmentQuickViewDrawer
        initialEquipment={{ id: 'eq-root', name: 'Outdoor HVAC unit' }}
        onClose={vi.fn()}
      />
    );
    const link = await screen.findByRole('link', { name: /open page/i });
    expect(link).toHaveAttribute('href', '/equipment/eq-root');
  });

  it('shows a plain X close at the root of the stack and calls onClose when clicked', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <EquipmentQuickViewDrawer
        initialEquipment={{ id: 'eq-root', name: 'Outdoor HVAC unit' }}
        onClose={onClose}
      />
    );
    await waitFor(() => expect(mockGetById).toHaveBeenCalled());
    // Header back/close button — at the root, aria-label is the generic "Close".
    const closeBtn = screen.getByRole('button', { name: /^close$/i });
    await user.click(closeBtn);
    expect(onClose).toHaveBeenCalled();
  });

  it('pushes onto the stack when a sub-unit chip is clicked, then "← Back to {parent}" pops one level', async () => {
    // Root equipment has one sub-unit; sub-unit has none.
    mockGetById.mockImplementation((id: string) => {
      if (id === 'eq-root') {
        return Promise.resolve(
          buildEquipment({
            id: 'eq-root',
            name: 'Outdoor HVAC unit',
            descendants: [{ id: 'sub-1', name: 'Compressor', profileImageUrl: null }],
            descendantCount: 1,
          })
        );
      }
      return Promise.resolve(buildEquipment({ id: 'sub-1', name: 'Compressor' }));
    });
    const user = userEvent.setup();
    renderWithProviders(
      <EquipmentQuickViewDrawer
        initialEquipment={{ id: 'eq-root', name: 'Outdoor HVAC unit' }}
        onClose={vi.fn()}
      />
    );
    // Wait for root equipment + click the sub-unit chip.
    const chip = await screen.findByRole('button', { name: /compressor/i });
    await user.click(chip);

    // Now the drawer's top is "Compressor". Header back-button label
    // includes the parent name.
    const back = await screen.findByRole('button', {
      name: /back to outdoor hvac unit/i,
    });
    await user.click(back);

    // After popping, root equipment header is visible again — the close
    // button reverts to the plain "Close" label.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /^close$/i })).toBeInTheDocument()
    );
  });

  it('back at the root level closes the drawer rather than going further', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <EquipmentQuickViewDrawer
        initialEquipment={{ id: 'eq-root', name: 'Outdoor HVAC unit' }}
        onClose={onClose}
      />
    );
    await waitFor(() => expect(mockGetById).toHaveBeenCalled());
    await user.click(screen.getByRole('button', { name: /^close$/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
