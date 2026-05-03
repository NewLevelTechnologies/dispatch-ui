import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../../../test/utils';
import FilterSizesPanel from './FilterSizesPanel';

const mockGetAll = vi.fn();
const mockCreate = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
const mockReorder = vi.fn();

vi.mock('../../../api/equipmentApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../api/equipmentApi')>();
  return {
    ...actual,
    tenantFilterSizesApi: {
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

describe('FilterSizesPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders configured sizes formatted as L × W × T', async () => {
    mockGetAll.mockResolvedValue([
      { id: 's1', tenantId: 't', lengthIn: 16, widthIn: 20, thicknessIn: 1, sortOrder: 0, archivedAt: null, createdAt: '' },
      { id: 's2', tenantId: 't', lengthIn: 20, widthIn: 25, thicknessIn: 1, sortOrder: 1, archivedAt: null, createdAt: '' },
    ]);
    renderWithProviders(<FilterSizesPanel />);

    await waitFor(() => {
      expect(screen.getByText('16 × 20 × 1')).toBeInTheDocument();
      expect(screen.getByText('20 × 25 × 1')).toBeInTheDocument();
    });
  });

  it('rejects non-positive dimensions on save', async () => {
    mockGetAll.mockResolvedValue([]);
    const user = userEvent.setup();
    renderWithProviders(<FilterSizesPanel />);

    await waitFor(() => expect(screen.getByText(/no filter sizes configured/i)).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /add size/i }));

    await user.type(await screen.findByLabelText(/length/i), '0');
    await user.type(screen.getByLabelText(/width/i), '20');
    await user.type(screen.getByLabelText(/thickness/i), '1');
    await user.click(screen.getByRole('button', { name: /^create$/i }));

    expect(
      screen.getByText(/length, width, and thickness must all be greater than zero/i)
    ).toBeInTheDocument();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('creates a new filter size with parsed numeric values', async () => {
    mockGetAll.mockResolvedValue([]);
    mockCreate.mockResolvedValue({ id: 'new' });
    const user = userEvent.setup();
    renderWithProviders(<FilterSizesPanel />);

    await waitFor(() => expect(screen.getByText(/no filter sizes configured/i)).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /add size/i }));

    await user.type(await screen.findByLabelText(/length/i), '14');
    await user.type(screen.getByLabelText(/width/i), '20');
    await user.type(screen.getByLabelText(/thickness/i), '1');
    await user.click(screen.getByRole('button', { name: /^create$/i }));

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith({
        lengthIn: 14,
        widthIn: 20,
        thicknessIn: 1,
        sortOrder: 0,
      });
    });
  });

  it('updates an existing filter size', async () => {
    mockGetAll.mockResolvedValue([
      { id: 's1', tenantId: 't', lengthIn: 16, widthIn: 20, thicknessIn: 1, sortOrder: 0, archivedAt: null, createdAt: '' },
    ]);
    mockUpdate.mockResolvedValue({ id: 's1' });
    const user = userEvent.setup();
    renderWithProviders(<FilterSizesPanel />);

    await waitFor(() => expect(screen.getByText('16 × 20 × 1')).toBeInTheDocument());
    const moreButtons = screen.getAllByRole('button', { name: /more options/i });
    await user.click(moreButtons[0]);
    const editItem = await screen.findByRole('menuitem', { name: /edit/i });
    await user.click(editItem);

    const length = await screen.findByLabelText(/length/i);
    await user.clear(length);
    await user.type(length, '18');
    await user.click(screen.getByRole('button', { name: /^update$/i }));

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith('s1', {
        lengthIn: 18,
        widthIn: 20,
        thicknessIn: 1,
      });
    });
  });

  it('deletes after confirmation', async () => {
    mockGetAll.mockResolvedValue([
      { id: 's1', tenantId: 't', lengthIn: 16, widthIn: 20, thicknessIn: 1, sortOrder: 0, archivedAt: null, createdAt: '' },
    ]);
    mockDelete.mockResolvedValue(undefined);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();
    renderWithProviders(<FilterSizesPanel />);

    await waitFor(() => expect(screen.getByText('16 × 20 × 1')).toBeInTheDocument());
    const moreButtons = screen.getAllByRole('button', { name: /more options/i });
    await user.click(moreButtons[0]);
    const deleteItem = await screen.findByRole('menuitem', { name: /delete/i });
    await user.click(deleteItem);

    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalledWith('s1');
    });
    confirmSpy.mockRestore();
  });

  it('reorders via the up and down arrows', async () => {
    mockGetAll.mockResolvedValue([
      { id: 's1', tenantId: 't', lengthIn: 16, widthIn: 20, thicknessIn: 1, sortOrder: 0, archivedAt: null, createdAt: '' },
      { id: 's2', tenantId: 't', lengthIn: 20, widthIn: 25, thicknessIn: 1, sortOrder: 1, archivedAt: null, createdAt: '' },
    ]);
    mockReorder.mockResolvedValue([]);
    const user = userEvent.setup();
    renderWithProviders(<FilterSizesPanel />);

    await waitFor(() => expect(screen.getByText('16 × 20 × 1')).toBeInTheDocument());
    const upButtons = screen.getAllByRole('button', { name: /move up/i });
    await user.click(upButtons[1]);

    await waitFor(() => {
      expect(mockReorder).toHaveBeenCalledWith(['s2', 's1']);
    });
  });

  it('cancel closes the dialog', async () => {
    mockGetAll.mockResolvedValue([]);
    const user = userEvent.setup();
    renderWithProviders(<FilterSizesPanel />);

    await waitFor(() => expect(screen.getByText(/no filter sizes configured/i)).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /add size/i }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /cancel/i }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });
});
