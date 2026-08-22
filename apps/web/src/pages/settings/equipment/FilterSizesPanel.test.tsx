import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../../../test/utils';
import FilterSizesPanel from './FilterSizesPanel';

const mockGetAll = vi.fn();
const mockCreate = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
const mockReorder = vi.fn();
const mockSeedCommon = vi.fn();

vi.mock('@dispatch/api/src/equipmentApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@dispatch/api/src/equipmentApi')>();
  return {
    ...actual,
    tenantFilterSizesApi: {
      getAll: (...args: unknown[]) => mockGetAll(...args),
      create: (...args: unknown[]) => mockCreate(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
      delete: (...args: unknown[]) => mockDelete(...args),
      reorder: (...args: unknown[]) => mockReorder(...args),
      seedCommon: (...args: unknown[]) => mockSeedCommon(...args),
    },
  };
});

vi.mock('@dispatch/api/src/client');

vi.mock('../../../lib/toast', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/toast')>();
  return {
    ...actual,
    showSuccess: vi.fn(),
    showError: vi.fn(),
  };
});

const size = (id: string, l: number, w: number, t: number, sortOrder = 0) => ({
  id,
  tenantId: 't',
  lengthIn: l,
  widthIn: w,
  thicknessIn: t,
  sortOrder,
  archivedAt: null,
  createdAt: '',
});

// Open the inline-add row and return the three numeric inputs.
const openInlineAdd = async (user: ReturnType<typeof userEvent.setup>) => {
  // The dashed "+ Add size" trigger inside the table — distinct from the
  // accent "Add size" button in the PageHead. Both have the same accessible
  // name; the trigger is the last in DOM order, the PageHead button is
  // first. Click the table-row one to enter inline-add mode.
  const triggers = screen.getAllByRole('button', { name: /add size/i });
  await user.click(triggers[triggers.length - 1]);
  const length = await screen.findByRole('spinbutton', { name: /length/i });
  const width = screen.getByRole('spinbutton', { name: /width/i });
  const thickness = screen.getByRole('spinbutton', { name: /thickness/i });
  return { length, width, thickness };
};

describe('FilterSizesPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders configured sizes formatted as L × W × T', async () => {
    mockGetAll.mockResolvedValue([size('s1', 16, 20, 1, 0), size('s2', 20, 25, 1, 1)]);
    renderWithProviders(<FilterSizesPanel />);

    await waitFor(() => {
      expect(screen.getByText('16×20×1')).toBeInTheDocument();
      expect(screen.getByText('20×25×1')).toBeInTheDocument();
    });
  });

  it('shows the empty state with Add + Seed common when there are no sizes', async () => {
    mockGetAll.mockResolvedValue([]);
    renderWithProviders(<FilterSizesPanel />);

    await waitFor(() =>
      expect(screen.getByText(/no filter sizes yet/i)).toBeInTheDocument(),
    );
    // PageHead Add + EmptyState Add → ≥1 button reachable.
    expect(
      screen.getAllByRole('button', { name: /add size/i }).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getByRole('button', { name: /seed common sizes/i }),
    ).toBeInTheDocument();
  });

  it('inline-adds a new size via three numeric fields (L → W → T → Enter)', async () => {
    mockGetAll.mockResolvedValue([size('s1', 16, 20, 1, 0)]);
    mockCreate.mockResolvedValue(size('new', 14, 20, 1, 1));
    const user = userEvent.setup();
    renderWithProviders(<FilterSizesPanel />);

    await waitFor(() => expect(screen.getByText('16×20×1')).toBeInTheDocument());

    const { length, width, thickness } = await openInlineAdd(user);
    await user.type(length, '14');
    await user.tab();
    expect(width).toHaveFocus();
    await user.type(width, '20');
    await user.tab();
    expect(thickness).toHaveFocus();
    await user.type(thickness, '1{Enter}');

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith({
        lengthIn: 14,
        widthIn: 20,
        thicknessIn: 1,
        sortOrder: 1,
      });
    });
  });

  it('rejects inline-add when a dimension is missing and focuses the empty field', async () => {
    mockGetAll.mockResolvedValue([size('s1', 16, 20, 1, 0)]);
    const user = userEvent.setup();
    renderWithProviders(<FilterSizesPanel />);

    await waitFor(() => expect(screen.getByText('16×20×1')).toBeInTheDocument());
    const { length, width, thickness } = await openInlineAdd(user);
    // Fill length + thickness only — width is missing.
    await user.type(length, '16');
    await user.click(thickness);
    await user.type(thickness, '1');
    // Submit by pressing Enter from the thickness field.
    await user.keyboard('{Enter}');

    expect(
      await screen.findByText(/length, width, and thickness/i),
    ).toBeInTheDocument();
    expect(width).toHaveFocus();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('rejects duplicate inline-add (same L/W/T triple)', async () => {
    mockGetAll.mockResolvedValue([size('s1', 16, 20, 1, 0)]);
    const user = userEvent.setup();
    renderWithProviders(<FilterSizesPanel />);

    await waitFor(() => expect(screen.getByText('16×20×1')).toBeInTheDocument());
    const { length, width, thickness } = await openInlineAdd(user);
    await user.type(length, '16');
    await user.type(width, '20');
    await user.type(thickness, '1{Enter}');

    expect(
      await screen.findByText(/already in your list/i),
    ).toBeInTheDocument();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('Esc inside an inline-add field cancels the row', async () => {
    mockGetAll.mockResolvedValue([size('s1', 16, 20, 1, 0)]);
    const user = userEvent.setup();
    renderWithProviders(<FilterSizesPanel />);

    await waitFor(() => expect(screen.getByText('16×20×1')).toBeInTheDocument());
    const { length } = await openInlineAdd(user);
    await user.type(length, '14');
    await user.keyboard('{Escape}');

    // Inputs are gone; the "+ Add size" trigger is back.
    expect(
      screen.queryByRole('spinbutton', { name: /length/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getAllByRole('button', { name: /add size/i }).length,
    ).toBeGreaterThan(0);
  });

  it('opens the edit dialog from the kebab Edit action', async () => {
    mockGetAll.mockResolvedValue([size('s1', 16, 20, 1, 0)]);
    mockUpdate.mockResolvedValue(size('s1', 18, 20, 1, 0));
    const user = userEvent.setup();
    renderWithProviders(<FilterSizesPanel />);

    await waitFor(() => expect(screen.getByText('16×20×1')).toBeInTheDocument());
    const moreButtons = screen.getAllByRole('button', { name: /more options/i });
    // moreButtons[0] is the PageHead ⋯; [1] is the row's kebab.
    await user.click(moreButtons[1]);

    const editItem = await screen.findByRole('menuitem', { name: /^edit$/i });
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

  it('deletes via ConfirmDialog after confirmation', async () => {
    mockGetAll.mockResolvedValue([size('s1', 16, 20, 1, 0)]);
    mockDelete.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderWithProviders(<FilterSizesPanel />);

    await waitFor(() => expect(screen.getByText('16×20×1')).toBeInTheDocument());
    const moreButtons = screen.getAllByRole('button', { name: /more options/i });
    await user.click(moreButtons[1]);

    const deleteItem = await screen.findByRole('menuitem', { name: /^delete$/i });
    await user.click(deleteItem);

    expect(await screen.findByText(/delete "16×20×1"/i)).toBeInTheDocument();

    const confirmButtons = screen.getAllByRole('button', { name: /^delete$/i });
    await user.click(confirmButtons[confirmButtons.length - 1]);

    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith('s1'));
  });

  it('reorders rows via drag-and-drop, posting the new id order', async () => {
    mockGetAll.mockResolvedValue([
      size('s1', 16, 20, 1, 0),
      size('s2', 20, 25, 1, 1),
    ]);
    mockReorder.mockResolvedValue([]);
    renderWithProviders(<FilterSizesPanel />);

    await waitFor(() => expect(screen.getByText('16×20×1')).toBeInTheDocument());

    const firstRow = screen.getByText('16×20×1').closest('tr')!;
    const secondRow = screen.getByText('20×25×1').closest('tr')!;

    const dataTransfer = {
      effectAllowed: 'move',
      dropEffect: 'move',
      setData: vi.fn(),
      getData: vi.fn(),
      types: [],
      files: [],
      items: [],
    };

    fireEvent.dragStart(secondRow, { dataTransfer });
    fireEvent.dragOver(firstRow, { dataTransfer });
    fireEvent.drop(firstRow, { dataTransfer });

    await waitFor(() => {
      expect(mockReorder).toHaveBeenCalledWith(['s2', 's1']);
    });
  });

  it('seeds common sizes through the header ⋯ dropdown + ConfirmDialog', async () => {
    mockGetAll.mockResolvedValue([size('s1', 16, 20, 1, 0)]);
    mockSeedCommon.mockResolvedValue({ added: 9, skipped: 1 });
    const user = userEvent.setup();
    renderWithProviders(<FilterSizesPanel />);

    await waitFor(() => expect(screen.getByText('16×20×1')).toBeInTheDocument());

    // Header kebab (first ⋯ button in DOM order).
    const moreButtons = screen.getAllByRole('button', { name: /more options/i });
    await user.click(moreButtons[0]);

    const seedItem = await screen.findByRole('menuitem', {
      name: /seed common sizes/i,
    });
    await user.click(seedItem);

    expect(
      await screen.findByText(/add common filter sizes\?/i),
    ).toBeInTheDocument();
    const confirmButtons = screen.getAllByRole('button', {
      name: /seed common sizes/i,
    });
    await user.click(confirmButtons[confirmButtons.length - 1]);

    await waitFor(() => expect(mockSeedCommon).toHaveBeenCalled());
  });

  it('opens the Seed common confirm dialog from the empty state', async () => {
    mockGetAll.mockResolvedValue([]);
    mockSeedCommon.mockResolvedValue({ added: 10, skipped: 0 });
    const user = userEvent.setup();
    renderWithProviders(<FilterSizesPanel />);

    await waitFor(() =>
      expect(screen.getByText(/no filter sizes yet/i)).toBeInTheDocument(),
    );
    await user.click(
      screen.getByRole('button', { name: /seed common sizes/i }),
    );

    expect(
      await screen.findByText(/add common filter sizes\?/i),
    ).toBeInTheDocument();
  });

  it('search normalizes separators — "1620" and "16x20" both match 16×20×1', async () => {
    mockGetAll.mockResolvedValue([
      size('s1', 16, 20, 1, 0),
      size('s2', 20, 25, 1, 1),
    ]);
    const user = userEvent.setup();
    renderWithProviders(<FilterSizesPanel />);

    await waitFor(() => expect(screen.getByText('16×20×1')).toBeInTheDocument());

    const search = screen.getByPlaceholderText(/search sizes/i);

    await user.type(search, '1620');
    expect(screen.getByText('16×20×1')).toBeInTheDocument();
    expect(screen.queryByText('20×25×1')).not.toBeInTheDocument();

    await user.clear(search);
    await user.type(search, '16x20');
    expect(screen.getByText('16×20×1')).toBeInTheDocument();
    expect(screen.queryByText('20×25×1')).not.toBeInTheDocument();

    await user.clear(search);
    await user.type(search, 'zzz');
    expect(
      await screen.findByText(/no sizes match your search/i),
    ).toBeInTheDocument();
  });
});
