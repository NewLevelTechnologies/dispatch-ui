import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../../../test/utils';
import EquipmentTypesPanel from './EquipmentTypesPanel';

const mockGetAll = vi.fn();
const mockCreate = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
const mockReorder = vi.fn();

vi.mock('../../../api/equipmentApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../api/equipmentApi')>();
  return {
    ...actual,
    equipmentTypesApi: {
      getAll: (...args: unknown[]) => mockGetAll(...args),
      create: (...args: unknown[]) => mockCreate(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
      delete: (...args: unknown[]) => mockDelete(...args),
      reorder: (...args: unknown[]) => mockReorder(...args),
    },
  };
});

vi.mock('../../../hooks/useCurrentUser', () => ({
  useHasCapability: () => true,
}));

vi.mock('../../../api/client');

const sampleTypes = [
  { id: 't1', tenantId: 't', name: 'HVAC', sortOrder: 0, archivedAt: null, createdAt: '', updatedAt: '' },
  { id: 't2', tenantId: 't', name: 'Refrigeration', sortOrder: 1, archivedAt: null, createdAt: '', updatedAt: '' },
];

describe('EquipmentTypesPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the list of types', async () => {
    mockGetAll.mockResolvedValue(sampleTypes);
    renderWithProviders(<EquipmentTypesPanel />);

    await waitFor(() => {
      expect(screen.getByText('HVAC')).toBeInTheDocument();
      expect(screen.getByText('Refrigeration')).toBeInTheDocument();
    });
  });

  it('renders the empty state when no types exist', async () => {
    mockGetAll.mockResolvedValue([]);
    renderWithProviders(<EquipmentTypesPanel />);

    await waitFor(() => {
      expect(screen.getByText(/no equipment types yet/i)).toBeInTheDocument();
    });
  });

  it('opens the add dialog and creates a new type', async () => {
    mockGetAll.mockResolvedValue([]);
    mockCreate.mockResolvedValue({ id: 'new', name: 'Plumbing' });
    const user = userEvent.setup();
    renderWithProviders(<EquipmentTypesPanel />);

    await waitFor(() => expect(screen.getByText(/no equipment types yet/i)).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /add type/i }));

    const nameInput = await screen.findByLabelText(/^name/i);
    await user.type(nameInput, 'Plumbing');
    await user.click(screen.getByRole('button', { name: /^create$/i }));

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith({ name: 'Plumbing', sortOrder: 0 });
    });
  });

  it('reorders via the up arrow', async () => {
    mockGetAll.mockResolvedValue(sampleTypes);
    mockReorder.mockResolvedValue([sampleTypes[1], sampleTypes[0]]);
    const user = userEvent.setup();
    renderWithProviders(<EquipmentTypesPanel />);

    await waitFor(() => expect(screen.getByText('Refrigeration')).toBeInTheDocument());
    // Move "Refrigeration" up — it's the second row
    const upButtons = screen.getAllByRole('button', { name: /move up/i });
    await user.click(upButtons[1]);

    await waitFor(() => {
      expect(mockReorder).toHaveBeenCalledWith(['t2', 't1']);
    });
  });

  it('deletes after confirmation', async () => {
    mockGetAll.mockResolvedValue(sampleTypes);
    mockDelete.mockResolvedValue(undefined);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();
    renderWithProviders(<EquipmentTypesPanel />);

    await waitFor(() => expect(screen.getByText('HVAC')).toBeInTheDocument());
    const moreButtons = screen.getAllByRole('button', { name: /more options/i });
    await user.click(moreButtons[0]);
    const deleteItem = await screen.findByRole('menuitem', { name: /delete/i });
    await user.click(deleteItem);

    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalledWith('t1');
    });
    confirmSpy.mockRestore();
  });

  it('reorders via the down arrow', async () => {
    mockGetAll.mockResolvedValue(sampleTypes);
    mockReorder.mockResolvedValue([sampleTypes[1], sampleTypes[0]]);
    const user = userEvent.setup();
    renderWithProviders(<EquipmentTypesPanel />);

    await waitFor(() => expect(screen.getByText('HVAC')).toBeInTheDocument());
    const downButtons = screen.getAllByRole('button', { name: /move down/i });
    await user.click(downButtons[0]);

    await waitFor(() => {
      expect(mockReorder).toHaveBeenCalledWith(['t2', 't1']);
    });
  });

  it('opens edit dialog and updates an existing type', async () => {
    mockGetAll.mockResolvedValue(sampleTypes);
    mockUpdate.mockResolvedValue({ ...sampleTypes[0], name: 'Heating' });
    const user = userEvent.setup();
    renderWithProviders(<EquipmentTypesPanel />);

    await waitFor(() => expect(screen.getByText('HVAC')).toBeInTheDocument());
    const moreButtons = screen.getAllByRole('button', { name: /more options/i });
    await user.click(moreButtons[0]);
    const editItem = await screen.findByRole('menuitem', { name: /edit/i });
    await user.click(editItem);

    const nameInput = await screen.findByLabelText(/^name/i);
    await user.clear(nameInput);
    await user.type(nameInput, 'Heating');
    await user.click(screen.getByRole('button', { name: /^update$/i }));

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith('t1', { name: 'Heating' });
    });
  });

  it('blocks save on empty name and shows the required-field error', async () => {
    mockGetAll.mockResolvedValue([]);
    const user = userEvent.setup();
    renderWithProviders(<EquipmentTypesPanel />);

    await waitFor(() => expect(screen.getByText(/no equipment types yet/i)).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /add type/i }));
    // Submit without typing anything
    await user.click(screen.getByRole('button', { name: /^create$/i }));

    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('alerts the backend message when create fails', async () => {
    mockGetAll.mockResolvedValue([]);
    mockCreate.mockRejectedValue(
      Object.assign(new Error('boom'), {
        response: { data: { message: 'Type already exists.' } },
      })
    );
    const user = userEvent.setup();
    renderWithProviders(<EquipmentTypesPanel />);

    await waitFor(() => expect(screen.getByText(/no equipment types yet/i)).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /add type/i }));
    await user.type(await screen.findByLabelText(/^name/i), 'HVAC');
    await user.click(screen.getByRole('button', { name: /^create$/i }));

    await waitFor(() => {
      expect(screen.getByText('Type already exists.')).toBeInTheDocument();
    });
  });

  it('cancel closes the dialog', async () => {
    mockGetAll.mockResolvedValue([]);
    const user = userEvent.setup();
    renderWithProviders(<EquipmentTypesPanel />);

    await waitFor(() => expect(screen.getByText(/no equipment types yet/i)).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /add type/i }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /cancel/i }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });
});
