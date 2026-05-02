import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import EquipmentFilterFormDialog from './EquipmentFilterFormDialog';
import type { EquipmentFilter } from '../api';

const mockFilterCreate = vi.fn();
const mockFilterUpdate = vi.fn();

vi.mock('../api/equipmentApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/equipmentApi')>();
  return {
    ...actual,
    equipmentFiltersApi: {
      create: (...args: unknown[]) => mockFilterCreate(...args),
      update: (...args: unknown[]) => mockFilterUpdate(...args),
    },
  };
});

vi.mock('../api/client');

const existingFilter: EquipmentFilter = {
  id: 'f-1',
  equipmentId: 'eq-1',
  lengthIn: 20,
  widthIn: 25,
  thicknessIn: 1,
  quantity: 2,
  label: 'Return air',
};

describe('EquipmentFilterFormDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when closed', () => {
    renderWithProviders(
      <EquipmentFilterFormDialog isOpen={false} onClose={vi.fn()} equipmentId="eq-1" />
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders create mode with empty inputs and quantity defaulting to 1', async () => {
    renderWithProviders(
      <EquipmentFilterFormDialog isOpen={true} onClose={vi.fn()} equipmentId="eq-1" />
    );
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    expect((screen.getByLabelText(/length/i) as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText(/width/i) as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText(/thickness/i) as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText(/quantity/i) as HTMLInputElement).value).toBe('1');
  });

  it('pre-fills dimensions from prefilledSize', async () => {
    renderWithProviders(
      <EquipmentFilterFormDialog
        isOpen={true}
        onClose={vi.fn()}
        equipmentId="eq-1"
        prefilledSize={{ lengthIn: 16, widthIn: 20, thicknessIn: 1 }}
      />
    );
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    expect((screen.getByLabelText(/length/i) as HTMLInputElement).value).toBe('16');
    expect((screen.getByLabelText(/width/i) as HTMLInputElement).value).toBe('20');
    expect((screen.getByLabelText(/thickness/i) as HTMLInputElement).value).toBe('1');
  });

  it('hydrates edit mode from an existing filter', async () => {
    renderWithProviders(
      <EquipmentFilterFormDialog
        isOpen={true}
        onClose={vi.fn()}
        equipmentId="eq-1"
        filter={existingFilter}
      />
    );
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    expect((screen.getByLabelText(/length/i) as HTMLInputElement).value).toBe('20');
    expect((screen.getByLabelText(/width/i) as HTMLInputElement).value).toBe('25');
    expect((screen.getByLabelText(/thickness/i) as HTMLInputElement).value).toBe('1');
    expect((screen.getByLabelText(/quantity/i) as HTMLInputElement).value).toBe('2');
    expect((screen.getByLabelText(/label/i) as HTMLInputElement).value).toBe('Return air');
  });

  it('submits create with parsed numeric values and trimmed label', async () => {
    mockFilterCreate.mockResolvedValue({ id: 'new' });
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <EquipmentFilterFormDialog isOpen={true} onClose={onClose} equipmentId="eq-1" />
    );

    await user.type(screen.getByLabelText(/length/i), '14');
    await user.type(screen.getByLabelText(/width/i), '20');
    await user.type(screen.getByLabelText(/thickness/i), '1');
    await user.clear(screen.getByLabelText(/quantity/i));
    await user.type(screen.getByLabelText(/quantity/i), '3');
    await user.type(screen.getByLabelText(/label/i), '  Return air  ');

    await user.click(screen.getByRole('button', { name: /create/i }));

    await waitFor(() => {
      expect(mockFilterCreate).toHaveBeenCalledWith('eq-1', {
        lengthIn: 14,
        widthIn: 20,
        thicknessIn: 1,
        quantity: 3,
        label: 'Return air',
      });
    });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('blocks submit and shows an error when dimensions are not all positive', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <EquipmentFilterFormDialog isOpen={true} onClose={vi.fn()} equipmentId="eq-1" />
    );

    await user.type(screen.getByLabelText(/length/i), '0');
    await user.type(screen.getByLabelText(/width/i), '20');
    await user.type(screen.getByLabelText(/thickness/i), '1');
    await user.click(screen.getByRole('button', { name: /create/i }));

    expect(
      screen.getByText(/length, width, and thickness must all be greater than zero/i)
    ).toBeInTheDocument();
    expect(mockFilterCreate).not.toHaveBeenCalled();
  });

  it('submits update with the patched fields', async () => {
    mockFilterUpdate.mockResolvedValue(existingFilter);
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <EquipmentFilterFormDialog
        isOpen={true}
        onClose={onClose}
        equipmentId="eq-1"
        filter={existingFilter}
      />
    );

    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    const labelInput = screen.getByLabelText(/label/i);
    await user.clear(labelInput);
    await user.type(labelInput, 'Pre-filter');
    await user.click(screen.getByRole('button', { name: /update/i }));

    await waitFor(() => {
      expect(mockFilterUpdate).toHaveBeenCalledWith('eq-1', 'f-1', {
        lengthIn: 20,
        widthIn: 25,
        thicknessIn: 1,
        quantity: 2,
        label: 'Pre-filter',
      });
    });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('shows server error message when create fails', async () => {
    mockFilterCreate.mockRejectedValue(
      Object.assign(new Error('boom'), {
        response: { data: { message: 'Duplicate filter' } },
      })
    );
    const user = userEvent.setup();
    renderWithProviders(
      <EquipmentFilterFormDialog isOpen={true} onClose={vi.fn()} equipmentId="eq-1" />
    );

    await user.type(screen.getByLabelText(/length/i), '14');
    await user.type(screen.getByLabelText(/width/i), '20');
    await user.type(screen.getByLabelText(/thickness/i), '1');
    await user.click(screen.getByRole('button', { name: /create/i }));

    await waitFor(() => {
      expect(screen.getByText('Duplicate filter')).toBeInTheDocument();
    });
  });

  it('cancel button calls onClose', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <EquipmentFilterFormDialog isOpen={true} onClose={onClose} equipmentId="eq-1" />
    );
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
