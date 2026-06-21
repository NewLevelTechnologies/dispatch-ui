import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../../test/utils';
import CategoryFieldsDrawer from './CategoryFieldsDrawer';
import type { EquipmentCategory, EquipmentCategoryField, EquipmentFieldDataType } from '../../api';

const mockGetAll = vi.fn();
const mockCreate = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
const mockReorder = vi.fn();

vi.mock('../../api/equipmentApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/equipmentApi')>();
  return {
    ...actual,
    equipmentCategoryFieldsApi: {
      getAll: (...a: unknown[]) => mockGetAll(...a),
      create: (...a: unknown[]) => mockCreate(...a),
      update: (...a: unknown[]) => mockUpdate(...a),
      delete: (...a: unknown[]) => mockDelete(...a),
      reorder: (...a: unknown[]) => mockReorder(...a),
    },
  };
});

vi.mock('../../api/client');
vi.mock('../../lib/toast', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/toast')>();
  return { ...actual, showSuccess: vi.fn(), showError: vi.fn() };
});

const category: EquipmentCategory = {
  id: 'cat-1',
  tenantId: 't',
  equipmentTypeId: 't-hvac',
  name: 'Rooftop',
  sortOrder: 0,
  archivedAt: null,
  createdAt: '',
  updatedAt: '',
};

const field = (
  id: string,
  fieldKey: string,
  label: string,
  dataType: EquipmentFieldDataType,
  extra: Partial<EquipmentCategoryField> = {}
): EquipmentCategoryField => ({
  id,
  tenantId: 't',
  equipmentCategoryId: 'cat-1',
  fieldKey,
  label,
  dataType,
  options: null,
  required: false,
  helpText: null,
  sortOrder: 0,
  archivedAt: null,
  createdAt: '',
  updatedAt: '',
  ...extra,
});

const render = () => renderWithProviders(<CategoryFieldsDrawer category={category} onClose={vi.fn()} />);

describe('CategoryFieldsDrawer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAll.mockResolvedValue([]);
    mockCreate.mockResolvedValue(field('f-new', 'btu_rating', 'BTU Rating', 'NUMBER'));
    mockUpdate.mockResolvedValue(field('f1', 'btu', 'BTU', 'NUMBER'));
    mockDelete.mockResolvedValue(undefined);
    mockReorder.mockResolvedValue([]);
  });

  it('lists fields with the renamed type labels and options', async () => {
    mockGetAll.mockResolvedValue([
      field('f1', 'btu', 'BTU Rating', 'NUMBER', { required: true }),
      field('f2', 'refrigerant', 'Refrigerant', 'SELECT', { options: ['R-410A', 'R-22'] }),
    ]);
    render();

    await waitFor(() => expect(screen.getByText('BTU Rating')).toBeInTheDocument());
    expect(screen.getByText('Number')).toBeInTheDocument();
    expect(screen.getByText('Dropdown')).toBeInTheDocument(); // SELECT renamed in the UI
    expect(screen.getByText('Required')).toBeInTheDocument();
    expect(screen.getByText('R-410A, R-22')).toBeInTheDocument();
  });

  it('shows an empty state when the category has no fields', async () => {
    mockGetAll.mockResolvedValue([]);
    render();
    expect(await screen.findByText(/no fields yet/i)).toBeInTheDocument();
  });

  it('adds a field inline with a label-derived key', async () => {
    const user = userEvent.setup();
    render();
    await screen.findByText(/no fields yet/i);

    await user.click(screen.getByRole('button', { name: /add field/i }));
    await user.type(screen.getByPlaceholderText('BTU Rating'), 'BTU Rating');

    // Key auto-derives from the label, tucked under Advanced.
    await user.click(screen.getByRole('button', { name: /advanced/i }));
    expect(screen.getByDisplayValue('btu_rating')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /create/i }));
    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith(
        'cat-1',
        expect.objectContaining({ fieldKey: 'btu_rating', label: 'BTU Rating', dataType: 'TEXT' })
      );
    });
  });

  it('requires options for a Dropdown field, then submits them', async () => {
    const user = userEvent.setup();
    render();
    await screen.findByText(/no fields yet/i);

    await user.click(screen.getByRole('button', { name: /add field/i }));
    await user.type(screen.getByPlaceholderText('BTU Rating'), 'Refrigerant');
    await user.selectOptions(screen.getByRole('combobox'), 'SELECT');

    await user.click(screen.getByRole('button', { name: /create/i }));
    expect(mockCreate).not.toHaveBeenCalled();
    expect(screen.getByText(/at least one option/i)).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText(/R-410A/), 'R-410A\nR-22');
    await user.click(screen.getByRole('button', { name: /create/i }));
    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith(
        'cat-1',
        expect.objectContaining({ dataType: 'SELECT', options: ['R-410A', 'R-22'] })
      );
    });
  });

  it('offers the Currency type', async () => {
    const user = userEvent.setup();
    render();
    await screen.findByText(/no fields yet/i);
    await user.click(screen.getByRole('button', { name: /add field/i }));
    expect(screen.getByRole('option', { name: 'Currency' })).toBeInTheDocument();
  });

  it('edits a field inline with the key and type locked', async () => {
    mockGetAll.mockResolvedValue([field('f1', 'btu', 'BTU', 'NUMBER')]);
    const user = userEvent.setup();
    render();

    await waitFor(() => expect(screen.getByText('BTU')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /more options/i }));
    await user.click(await screen.findByRole('menuitem', { name: /edit/i }));

    // Type select is disabled; the key (under Advanced) is disabled too.
    expect((screen.getByRole('combobox') as HTMLSelectElement).disabled).toBe(true);
    await user.click(screen.getByRole('button', { name: /advanced/i }));
    expect((screen.getByDisplayValue('btu') as HTMLInputElement).disabled).toBe(true);

    const labelInput = screen.getByDisplayValue('BTU');
    await user.clear(labelInput);
    await user.type(labelInput, 'BTU Rating');
    await user.click(screen.getByRole('button', { name: /update/i }));

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith('cat-1', 'f1', expect.objectContaining({ label: 'BTU Rating' }));
    });
    expect(mockUpdate.mock.calls[0][2]).not.toHaveProperty('fieldKey');
  });

  it('deletes a field after confirmation', async () => {
    mockGetAll.mockResolvedValue([field('f1', 'btu', 'BTU', 'NUMBER')]);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();
    render();

    await waitFor(() => expect(screen.getByText('BTU')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /more options/i }));
    await user.click(await screen.findByRole('menuitem', { name: /delete/i }));

    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith('cat-1', 'f1'));
    confirmSpy.mockRestore();
  });

  it('reorders fields from the row menu', async () => {
    mockGetAll.mockResolvedValue([
      field('f1', 'btu', 'BTU', 'NUMBER'),
      field('f2', 'tonnage', 'Tonnage', 'NUMBER', { sortOrder: 1 }),
    ]);
    const user = userEvent.setup();
    render();

    await waitFor(() => expect(screen.getByText('BTU')).toBeInTheDocument());
    await user.click(screen.getAllByRole('button', { name: /more options/i })[0]);
    await user.click(await screen.findByRole('menuitem', { name: /move down/i }));

    await waitFor(() => expect(mockReorder).toHaveBeenCalledWith('cat-1', ['f2', 'f1']));
  });

  it('reorders fields by dragging a row', async () => {
    mockGetAll.mockResolvedValue([
      field('f1', 'btu', 'BTU', 'NUMBER'),
      field('f2', 'tonnage', 'Tonnage', 'NUMBER', { sortOrder: 1 }),
    ]);
    render();

    await waitFor(() => expect(screen.getByText('BTU')).toBeInTheDocument());
    const row1 = screen.getByText('BTU').closest('[draggable]')!;
    const row2 = screen.getByText('Tonnage').closest('[draggable]')!;

    fireEvent.dragStart(row1, { dataTransfer: { effectAllowed: '' } });
    fireEvent.dragOver(row2, { dataTransfer: { dropEffect: '' } });
    fireEvent.drop(row2, { dataTransfer: {} });

    await waitFor(() => expect(mockReorder).toHaveBeenCalledWith('cat-1', ['f2', 'f1']));
  });

  it('cancels the inline editor', async () => {
    const user = userEvent.setup();
    render();
    await screen.findByText(/no fields yet/i);

    await user.click(screen.getByRole('button', { name: /add field/i }));
    expect(screen.getByPlaceholderText('BTU Rating')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /cancel/i }));

    expect(screen.getByRole('button', { name: /add field/i })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('BTU Rating')).not.toBeInTheDocument();
  });
});
