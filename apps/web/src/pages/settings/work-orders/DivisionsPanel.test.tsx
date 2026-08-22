import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../../../test/utils';
import DivisionsPanel from './DivisionsPanel';
import { apiClient } from '../../../api/setup';

vi.mock('@dispatch/api/src/client');

const TWO_DIVISIONS = [
  {
    id: 'd1',
    tenantId: 'tn',
    name: 'HVAC',
    code: 'HVAC_CODE',
    isActive: true,
    sortOrder: 0,
    createdAt: '',
    updatedAt: '',
  },
  {
    id: 'd2',
    tenantId: 'tn',
    name: 'Plumbing',
    code: 'PLUMBING',
    isActive: true,
    sortOrder: 1,
    createdAt: '',
    updatedAt: '',
  },
];

describe('DivisionsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiClient.get).mockResolvedValue({ data: [] });
  });

  it('renders the Divisions title', async () => {
    renderWithProviders(<DivisionsPanel />);
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /divisions/i })
      ).toBeInTheDocument();
    });
  });

  it('hits the divisions endpoint via the underlying api', async () => {
    renderWithProviders(<DivisionsPanel />);
    await waitFor(() => {
      expect(apiClient.get).toHaveBeenCalledWith(
        '/work-orders/config/divisions'
      );
    });
  });

  it('renders the empty state when there are no divisions', async () => {
    renderWithProviders(<DivisionsPanel />);
    await waitFor(() => {
      expect(screen.getByText(/no divisions yet/i)).toBeInTheDocument();
    });
  });

  it('renders rows with name + code when divisions exist', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: TWO_DIVISIONS });
    renderWithProviders(<DivisionsPanel />);
    await waitFor(() => {
      expect(screen.getByText('HVAC')).toBeInTheDocument();
      expect(screen.getByText('HVAC_CODE')).toBeInTheDocument();
    });
  });

  it('opens the create dialog when the Add button is clicked', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: TWO_DIVISIONS });
    const user = userEvent.setup();
    renderWithProviders(<DivisionsPanel />);

    await waitFor(() => {
      expect(screen.getByText('HVAC')).toBeInTheDocument();
    });
    const addButton = screen
      .getAllByRole('button')
      .find((b) => /^add /i.test(b.textContent ?? ''));
    expect(addButton).toBeDefined();
    await user.click(addButton!);

    // The dialog renders a Create button — the page header's button stays as Add.
    await screen.findByRole('button', { name: /create division/i });
  });

  it('filters rows when the user types in the search box', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: TWO_DIVISIONS });
    const user = userEvent.setup();
    renderWithProviders(<DivisionsPanel />);

    await waitFor(() => {
      expect(screen.getByText('HVAC')).toBeInTheDocument();
      expect(screen.getByText('Plumbing')).toBeInTheDocument();
    });

    const search = screen.getByPlaceholderText(/search divisions/i);
    await user.type(search, 'plum');

    await waitFor(() => {
      expect(screen.queryByText('HVAC')).not.toBeInTheDocument();
      expect(screen.getByText('Plumbing')).toBeInTheDocument();
    });
  });

  it('opens the edit dialog from the row kebab', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: TWO_DIVISIONS });
    const user = userEvent.setup();
    renderWithProviders(<DivisionsPanel />);

    await waitFor(() => {
      expect(screen.getByText('HVAC')).toBeInTheDocument();
    });

    const moreButtons = screen.getAllByRole('button', { name: /more options/i });
    await user.click(moreButtons[0]);
    const editItem = await screen.findByRole('menuitem', { name: /edit/i });
    await user.click(editItem);

    await screen.findByText(/edit hvac/i);
  });

  it('opens the delete confirmation from the row kebab', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: TWO_DIVISIONS });
    const user = userEvent.setup();
    renderWithProviders(<DivisionsPanel />);

    await waitFor(() => {
      expect(screen.getByText('HVAC')).toBeInTheDocument();
    });

    const moreButtons = screen.getAllByRole('button', { name: /more options/i });
    await user.click(moreButtons[0]);
    const deleteItem = await screen.findByRole('menuitem', { name: /delete/i });
    await user.click(deleteItem);

    await screen.findByText(/delete "hvac"\?/i);
  });

  it('reorders rows when Move down is picked from the kebab', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: TWO_DIVISIONS });
    vi.mocked(apiClient.post).mockResolvedValue({ data: [] });
    const user = userEvent.setup();
    renderWithProviders(<DivisionsPanel />);

    await waitFor(() => {
      expect(screen.getByText('HVAC')).toBeInTheDocument();
    });

    const moreButtons = screen.getAllByRole('button', { name: /more options/i });
    await user.click(moreButtons[0]);
    const moveDown = await screen.findByRole('menuitem', { name: /move down/i });
    await user.click(moveDown);

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        '/work-orders/config/divisions/reorder',
        { orderedIds: ['d2', 'd1'] }
      );
    });
  });

  it('moves a row up from the kebab', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: TWO_DIVISIONS });
    vi.mocked(apiClient.post).mockResolvedValue({ data: [] });
    const user = userEvent.setup();
    renderWithProviders(<DivisionsPanel />);

    await waitFor(() => {
      expect(screen.getByText('Plumbing')).toBeInTheDocument();
    });

    // Second row (Plumbing) → Move up swaps it ahead of HVAC.
    const moreButtons = screen.getAllByRole('button', { name: /more options/i });
    await user.click(moreButtons[1]);
    const moveUp = await screen.findByRole('menuitem', { name: /move up/i });
    await user.click(moveUp);

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        '/work-orders/config/divisions/reorder',
        { orderedIds: ['d2', 'd1'] }
      );
    });
  });

  it('deletes a division through the confirm dialog', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: TWO_DIVISIONS });
    vi.mocked(apiClient.delete).mockResolvedValue({ data: undefined });
    const user = userEvent.setup();
    renderWithProviders(<DivisionsPanel />);

    await waitFor(() => {
      expect(screen.getByText('HVAC')).toBeInTheDocument();
    });

    const moreButtons = screen.getAllByRole('button', { name: /more options/i });
    await user.click(moreButtons[0]);
    await user.click(await screen.findByRole('menuitem', { name: /delete/i }));

    await screen.findByText(/delete "hvac"\?/i);
    const confirmButtons = screen.getAllByRole('button', { name: /^delete$/i });
    await user.click(confirmButtons[confirmButtons.length - 1]);

    await waitFor(() => {
      expect(apiClient.delete).toHaveBeenCalledWith(
        '/work-orders/config/divisions/d1'
      );
    });
    // onSettled clears pendingDelete, which closes the confirm dialog.
    await waitFor(() => {
      expect(screen.queryByText(/delete "hvac"\?/i)).not.toBeInTheDocument();
    });
  });

  it('surfaces an error when the delete fails', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: TWO_DIVISIONS });
    vi.mocked(apiClient.delete).mockRejectedValue(new Error('boom'));
    const user = userEvent.setup();
    renderWithProviders(<DivisionsPanel />);

    await waitFor(() => {
      expect(screen.getByText('HVAC')).toBeInTheDocument();
    });

    const moreButtons = screen.getAllByRole('button', { name: /more options/i });
    await user.click(moreButtons[0]);
    await user.click(await screen.findByRole('menuitem', { name: /delete/i }));

    await screen.findByText(/delete "hvac"\?/i);
    const confirmButtons = screen.getAllByRole('button', { name: /^delete$/i });
    await user.click(confirmButtons[confirmButtons.length - 1]);

    await waitFor(() => {
      expect(apiClient.delete).toHaveBeenCalled();
    });
    // Even on failure, onSettled closes the dialog.
    await waitFor(() => {
      expect(screen.queryByText(/delete "hvac"\?/i)).not.toBeInTheDocument();
    });
  });

  it('reorders rows via drag-and-drop, posting the new id order', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: TWO_DIVISIONS });
    vi.mocked(apiClient.post).mockResolvedValue({ data: [] });
    renderWithProviders(<DivisionsPanel />);

    await waitFor(() => {
      expect(screen.getByText('HVAC')).toBeInTheDocument();
    });

    const firstRow = screen.getByText('HVAC').closest('tr')!;
    const secondRow = screen.getByText('Plumbing').closest('tr')!;

    const dataTransfer = {
      effectAllowed: 'move',
      dropEffect: 'move',
      setData: vi.fn(),
      getData: vi.fn(),
      types: [],
      files: [],
      items: [],
    };

    fireEvent.dragStart(firstRow, { dataTransfer });
    fireEvent.dragOver(secondRow, { dataTransfer });
    fireEvent.dragLeave(secondRow, { dataTransfer });
    fireEvent.dragOver(secondRow, { dataTransfer });
    fireEvent.drop(secondRow, { dataTransfer });
    fireEvent.dragEnd(firstRow, { dataTransfer });

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        '/work-orders/config/divisions/reorder',
        { orderedIds: ['d2', 'd1'] }
      );
    });
  });

  it('refetches when a drag reorder fails', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: TWO_DIVISIONS });
    vi.mocked(apiClient.post).mockRejectedValue(new Error('nope'));
    renderWithProviders(<DivisionsPanel />);

    await waitFor(() => {
      expect(screen.getByText('HVAC')).toBeInTheDocument();
    });
    expect(apiClient.get).toHaveBeenCalledTimes(1);

    const firstRow = screen.getByText('HVAC').closest('tr')!;
    const secondRow = screen.getByText('Plumbing').closest('tr')!;
    const dataTransfer = {
      effectAllowed: 'move',
      dropEffect: 'move',
      setData: vi.fn(),
      getData: vi.fn(),
      types: [],
      files: [],
      items: [],
    };

    fireEvent.dragStart(firstRow, { dataTransfer });
    fireEvent.dragOver(secondRow, { dataTransfer });
    fireEvent.drop(secondRow, { dataTransfer });

    await waitFor(() => expect(apiClient.post).toHaveBeenCalled());
    // onError invalidates the query, triggering a refetch.
    await waitFor(() => expect(apiClient.get).toHaveBeenCalledTimes(2));
  });

  it('shows an error state and retries on demand', async () => {
    vi.mocked(apiClient.get).mockRejectedValueOnce(new Error('load failed'));
    const user = userEvent.setup();
    renderWithProviders(<DivisionsPanel />);

    const tryAgain = await screen.findByRole('button', { name: /try again/i });
    vi.mocked(apiClient.get).mockResolvedValue({ data: TWO_DIVISIONS });
    await user.click(tryAgain);

    await waitFor(() => {
      expect(screen.getByText('HVAC')).toBeInTheDocument();
    });
  });

  it('closes the create dialog on cancel', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: TWO_DIVISIONS });
    const user = userEvent.setup();
    renderWithProviders(<DivisionsPanel />);

    await waitFor(() => {
      expect(screen.getByText('HVAC')).toBeInTheDocument();
    });
    const addButton = screen
      .getAllByRole('button')
      .find((b) => /^add /i.test(b.textContent ?? ''));
    await user.click(addButton!);

    await screen.findByRole('button', { name: /create division/i });
    await user.click(screen.getByRole('button', { name: /cancel/i }));

    await waitFor(() => {
      expect(
        screen.queryByRole('button', { name: /create division/i })
      ).not.toBeInTheDocument();
    });
  });

  it('closes the delete confirmation on cancel', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: TWO_DIVISIONS });
    const user = userEvent.setup();
    renderWithProviders(<DivisionsPanel />);

    await waitFor(() => {
      expect(screen.getByText('HVAC')).toBeInTheDocument();
    });

    const moreButtons = screen.getAllByRole('button', { name: /more options/i });
    await user.click(moreButtons[0]);
    await user.click(await screen.findByRole('menuitem', { name: /delete/i }));

    await screen.findByText(/delete "hvac"\?/i);
    await user.click(screen.getByRole('button', { name: /cancel/i }));

    await waitFor(() => {
      expect(screen.queryByText(/delete "hvac"\?/i)).not.toBeInTheDocument();
    });
  });
});
