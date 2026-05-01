import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import EquipmentPicker from './EquipmentPicker';
import type { EquipmentSummary } from '../api';

const mockEquipmentList = vi.fn();
const mockEquipmentCreate = vi.fn();

vi.mock('../api/equipmentApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/equipmentApi')>();
  return {
    ...actual,
    equipmentApi: {
      list: (...args: unknown[]) => mockEquipmentList(...args),
      create: (...args: unknown[]) => mockEquipmentCreate(...args),
    },
  };
});
vi.mock('../api/client');

const summary = (id: string, name: string, overrides: Partial<EquipmentSummary> = {}): EquipmentSummary => ({
  id,
  name,
  equipmentTypeName: null,
  equipmentCategoryName: null,
  make: null,
  model: null,
  serialNumber: null,
  locationOnSite: null,
  ...overrides,
});

const page = (content: EquipmentSummary[]) => ({
  content,
  totalElements: content.length,
  totalPages: 1,
  number: 0,
  size: 20,
  first: true,
  last: true,
});

describe('EquipmentPicker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEquipmentList.mockResolvedValue(page([summary('eq-1', 'Upstairs Furnace', { make: 'Carrier', model: 'C-100' })]));
  });

  it('shows the selected equipment name in the input', () => {
    renderWithProviders(
      <EquipmentPicker
        value={summary('eq-1', 'Upstairs Furnace', { make: 'Carrier' })}
        onChange={vi.fn()}
        serviceLocationId="loc-1"
        label="Equipment"
      />
    );
    expect((screen.getByLabelText('Equipment') as HTMLInputElement).value).toMatch(/Upstairs Furnace/);
  });

  it('opens the dropdown on focus and lists matches', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <EquipmentPicker
        value={null}
        onChange={vi.fn()}
        serviceLocationId="loc-1"
        label="Equipment"
      />
    );
    await user.click(screen.getByLabelText('Equipment'));
    await waitFor(() => {
      expect(screen.getByText('Upstairs Furnace')).toBeInTheDocument();
    });
  });

  it('selects a result and calls onChange', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <EquipmentPicker
        value={null}
        onChange={onChange}
        serviceLocationId="loc-1"
        label="Equipment"
      />
    );
    await user.click(screen.getByLabelText('Equipment'));
    await waitFor(() => expect(screen.getByText('Upstairs Furnace')).toBeInTheDocument());
    await user.click(screen.getByText('Upstairs Furnace'));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ id: 'eq-1' }));
  });

  it('clears the selection when the × button is clicked', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <EquipmentPicker
        value={summary('eq-1', 'Upstairs Furnace')}
        onChange={onChange}
        serviceLocationId="loc-1"
        label="Equipment"
      />
    );
    await user.click(screen.getByRole('button', { name: /clear selection/i }));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('shows the "create new" footer when no match and creates via quick-create dialog', async () => {
    mockEquipmentList.mockResolvedValue(page([]));
    mockEquipmentCreate.mockResolvedValue({
      id: 'eq-new',
      name: 'New Compressor',
      serviceLocationId: 'loc-1',
      status: 'ACTIVE',
    });
    const onChange = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <EquipmentPicker
        value={null}
        onChange={onChange}
        serviceLocationId="loc-1"
        label="Equipment"
      />
    );
    await user.click(screen.getByLabelText('Equipment'));
    await user.type(screen.getByLabelText('Equipment'), 'New Compressor');

    // Footer appears
    const footer = await screen.findByText(/Create new equipment "New Compressor"/i);
    await user.click(footer);

    // Quick-create dialog mounts with prefilled name
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeInTheDocument();
    const nameInput = screen.getByLabelText(/^name/i) as HTMLInputElement;
    expect(nameInput.value).toBe('New Compressor');

    // Submit
    await user.click(screen.getByRole('button', { name: /create/i }));

    await waitFor(() => {
      expect(mockEquipmentCreate).toHaveBeenCalledWith({
        name: 'New Compressor',
        serviceLocationId: 'loc-1',
      });
    });
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ id: 'eq-new', name: 'New Compressor' }));
    });
  });

  it('surfaces an error message when quick-create fails', async () => {
    mockEquipmentList.mockResolvedValue(page([]));
    mockEquipmentCreate.mockRejectedValue(
      Object.assign(new Error('boom'), {
        response: { data: { message: 'Service location not found' } },
      })
    );
    const user = userEvent.setup();
    renderWithProviders(
      <EquipmentPicker
        value={null}
        onChange={vi.fn()}
        serviceLocationId="loc-1"
        label="Equipment"
      />
    );
    await user.click(screen.getByLabelText('Equipment'));
    await user.type(screen.getByLabelText('Equipment'), 'Bad');

    const footer = await screen.findByText(/Create new equipment "Bad"/i);
    await user.click(footer);

    await screen.findByRole('dialog');
    await user.click(screen.getByRole('button', { name: /create/i }));

    await waitFor(() => {
      expect(screen.getByText('Service location not found')).toBeInTheDocument();
    });
  });

  it('cancel button on the quick-create dialog dismisses it', async () => {
    mockEquipmentList.mockResolvedValue(page([]));
    const user = userEvent.setup();
    renderWithProviders(
      <EquipmentPicker
        value={null}
        onChange={vi.fn()}
        serviceLocationId="loc-1"
        label="Equipment"
      />
    );
    await user.click(screen.getByLabelText('Equipment'));
    await user.type(screen.getByLabelText('Equipment'), 'Cancel Me');
    await user.click(await screen.findByText(/Create new equipment/i));
    await screen.findByRole('dialog');
    await user.click(screen.getByRole('button', { name: /cancel/i }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('disables the input when serviceLocationId is empty', () => {
    renderWithProviders(
      <EquipmentPicker
        value={null}
        onChange={vi.fn()}
        serviceLocationId=""
        label="Equipment"
      />
    );
    expect(screen.getByLabelText('Equipment')).toBeDisabled();
  });
});
