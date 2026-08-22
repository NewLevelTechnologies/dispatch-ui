import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../../../test/utils';
import WorkOrderTypesPanel from './WorkOrderTypesPanel';
import { apiClient } from '../../../api/setup';

vi.mock('@dispatch/api/src/client');

const EMPTY_ENVELOPE = { workOrderTypes: [], colorsInUse: {} };

const TWO_TYPES_ENVELOPE = {
  workOrderTypes: [
    {
      id: 't1',
      tenantId: 'tn',
      name: 'Service Call',
      code: 'SERVICE_CALL',
      accentId: 'blue',
      isActive: true,
      sortOrder: 0,
      createdAt: '',
      updatedAt: '',
    },
    {
      id: 't2',
      tenantId: 'tn',
      name: 'Installation',
      code: 'INSTALLATION',
      accentId: 'green',
      isActive: true,
      sortOrder: 1,
      createdAt: '',
      updatedAt: '',
    },
  ],
  colorsInUse: {
    blue: { typeId: 't1', typeName: 'Service Call' },
    green: { typeId: 't2', typeName: 'Installation' },
  },
};

describe('WorkOrderTypesPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiClient.get).mockResolvedValue({ data: EMPTY_ENVELOPE });
  });

  it('renders the Work Order Types title', async () => {
    renderWithProviders(<WorkOrderTypesPanel />);
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /work order types/i })
      ).toBeInTheDocument();
    });
  });

  it('hits the work-order-types endpoint via the underlying api', async () => {
    renderWithProviders(<WorkOrderTypesPanel />);
    await waitFor(() => {
      expect(apiClient.get).toHaveBeenCalledWith('/work-orders/config/types');
    });
  });

  it('renders the empty state when there are no types', async () => {
    renderWithProviders(<WorkOrderTypesPanel />);
    await waitFor(() => {
      expect(screen.getByText(/no work order types yet/i)).toBeInTheDocument();
    });
  });

  it('renders rows with swatch + code when types exist', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: TWO_TYPES_ENVELOPE });
    renderWithProviders(<WorkOrderTypesPanel />);
    await waitFor(() => {
      expect(screen.getByText('Service Call')).toBeInTheDocument();
      expect(screen.getByText('SERVICE_CALL')).toBeInTheDocument();
    });
  });

  it('opens the create dialog when the Add button is clicked', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: TWO_TYPES_ENVELOPE });
    const user = userEvent.setup();
    renderWithProviders(<WorkOrderTypesPanel />);

    await waitFor(() => {
      expect(screen.getByText('Service Call')).toBeInTheDocument();
    });
    // PageHead's Add button is the only one without a kebab role.
    const addButton = screen
      .getAllByRole('button')
      .find((b) => /^add /i.test(b.textContent ?? ''));
    expect(addButton).toBeDefined();
    await user.click(addButton!);

    await screen.findByText(/add work order type/i);
  });

  it('filters rows when the user types in the search box', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: TWO_TYPES_ENVELOPE });
    const user = userEvent.setup();
    renderWithProviders(<WorkOrderTypesPanel />);

    await waitFor(() => {
      expect(screen.getByText('Service Call')).toBeInTheDocument();
      expect(screen.getByText('Installation')).toBeInTheDocument();
    });

    const search = screen.getByPlaceholderText(/search types/i);
    await user.type(search, 'inst');

    await waitFor(() => {
      expect(screen.queryByText('Service Call')).not.toBeInTheDocument();
      expect(screen.getByText('Installation')).toBeInTheDocument();
    });
  });

  it('opens the edit dialog from the row kebab', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: TWO_TYPES_ENVELOPE });
    const user = userEvent.setup();
    renderWithProviders(<WorkOrderTypesPanel />);

    await waitFor(() => {
      expect(screen.getByText('Service Call')).toBeInTheDocument();
    });

    const moreButtons = screen.getAllByRole('button', { name: /more options/i });
    await user.click(moreButtons[0]);
    const editItem = await screen.findByRole('menuitem', { name: /edit/i });
    await user.click(editItem);

    await screen.findByText(/edit service call/i);
  });

  it('opens the delete confirmation from the row kebab', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: TWO_TYPES_ENVELOPE });
    const user = userEvent.setup();
    renderWithProviders(<WorkOrderTypesPanel />);

    await waitFor(() => {
      expect(screen.getByText('Service Call')).toBeInTheDocument();
    });

    const moreButtons = screen.getAllByRole('button', { name: /more options/i });
    await user.click(moreButtons[0]);
    const deleteItem = await screen.findByRole('menuitem', { name: /delete/i });
    await user.click(deleteItem);

    await screen.findByText(/delete "service call"\?/i);
  });

  it('reorders rows when Move down is picked from the kebab', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: TWO_TYPES_ENVELOPE });
    vi.mocked(apiClient.post).mockResolvedValue({ data: [] });
    const user = userEvent.setup();
    renderWithProviders(<WorkOrderTypesPanel />);

    await waitFor(() => {
      expect(screen.getByText('Service Call')).toBeInTheDocument();
    });

    // First row (Service Call) → Move down should ship a reorder POST with
    // the swapped order.
    const moreButtons = screen.getAllByRole('button', { name: /more options/i });
    await user.click(moreButtons[0]);
    const moveDown = await screen.findByRole('menuitem', { name: /move down/i });
    await user.click(moveDown);

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        '/work-orders/config/types/reorder',
        { orderedIds: ['t2', 't1'] }
      );
    });
  });

  it('moves a row up from the kebab', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: TWO_TYPES_ENVELOPE });
    vi.mocked(apiClient.post).mockResolvedValue({ data: [] });
    const user = userEvent.setup();
    renderWithProviders(<WorkOrderTypesPanel />);

    await waitFor(() => {
      expect(screen.getByText('Installation')).toBeInTheDocument();
    });

    // Second row (Installation) → Move up swaps it ahead of Service Call.
    const moreButtons = screen.getAllByRole('button', { name: /more options/i });
    await user.click(moreButtons[1]);
    const moveUp = await screen.findByRole('menuitem', { name: /move up/i });
    await user.click(moveUp);

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        '/work-orders/config/types/reorder',
        { orderedIds: ['t2', 't1'] }
      );
    });
  });

  it('deletes a type through the confirm dialog', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: TWO_TYPES_ENVELOPE });
    vi.mocked(apiClient.delete).mockResolvedValue({ data: undefined });
    const user = userEvent.setup();
    renderWithProviders(<WorkOrderTypesPanel />);

    await waitFor(() => {
      expect(screen.getByText('Service Call')).toBeInTheDocument();
    });

    const moreButtons = screen.getAllByRole('button', { name: /more options/i });
    await user.click(moreButtons[0]);
    await user.click(await screen.findByRole('menuitem', { name: /delete/i }));

    await screen.findByText(/delete "service call"\?/i);
    const confirmButtons = screen.getAllByRole('button', { name: /^delete$/i });
    await user.click(confirmButtons[confirmButtons.length - 1]);

    await waitFor(() => {
      expect(apiClient.delete).toHaveBeenCalledWith(
        '/work-orders/config/types/t1'
      );
    });
    await waitFor(() => {
      expect(screen.queryByText(/delete "service call"\?/i)).not.toBeInTheDocument();
    });
  });

  it('surfaces an error when the delete fails', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: TWO_TYPES_ENVELOPE });
    vi.mocked(apiClient.delete).mockRejectedValue(new Error('boom'));
    const user = userEvent.setup();
    renderWithProviders(<WorkOrderTypesPanel />);

    await waitFor(() => {
      expect(screen.getByText('Service Call')).toBeInTheDocument();
    });

    const moreButtons = screen.getAllByRole('button', { name: /more options/i });
    await user.click(moreButtons[0]);
    await user.click(await screen.findByRole('menuitem', { name: /delete/i }));

    await screen.findByText(/delete "service call"\?/i);
    const confirmButtons = screen.getAllByRole('button', { name: /^delete$/i });
    await user.click(confirmButtons[confirmButtons.length - 1]);

    await waitFor(() => {
      expect(apiClient.delete).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(screen.queryByText(/delete "service call"\?/i)).not.toBeInTheDocument();
    });
  });

  it('reorders rows via drag-and-drop, posting the new id order', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: TWO_TYPES_ENVELOPE });
    vi.mocked(apiClient.post).mockResolvedValue({ data: [] });
    renderWithProviders(<WorkOrderTypesPanel />);

    await waitFor(() => {
      expect(screen.getByText('Service Call')).toBeInTheDocument();
    });

    const firstRow = screen.getByText('Service Call').closest('tr')!;
    const secondRow = screen.getByText('Installation').closest('tr')!;

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
        '/work-orders/config/types/reorder',
        { orderedIds: ['t2', 't1'] }
      );
    });
  });

  it('refetches when a drag reorder fails', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: TWO_TYPES_ENVELOPE });
    vi.mocked(apiClient.post).mockRejectedValue(new Error('nope'));
    renderWithProviders(<WorkOrderTypesPanel />);

    await waitFor(() => {
      expect(screen.getByText('Service Call')).toBeInTheDocument();
    });
    expect(apiClient.get).toHaveBeenCalledTimes(1);

    const firstRow = screen.getByText('Service Call').closest('tr')!;
    const secondRow = screen.getByText('Installation').closest('tr')!;
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
    await waitFor(() => expect(apiClient.get).toHaveBeenCalledTimes(2));
  });

  it('shows an error state and retries on demand', async () => {
    vi.mocked(apiClient.get).mockRejectedValueOnce(new Error('load failed'));
    const user = userEvent.setup();
    renderWithProviders(<WorkOrderTypesPanel />);

    const tryAgain = await screen.findByRole('button', { name: /try again/i });
    vi.mocked(apiClient.get).mockResolvedValue({ data: TWO_TYPES_ENVELOPE });
    await user.click(tryAgain);

    await waitFor(() => {
      expect(screen.getByText('Service Call')).toBeInTheDocument();
    });
  });

  it('closes the create dialog on cancel', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: TWO_TYPES_ENVELOPE });
    const user = userEvent.setup();
    renderWithProviders(<WorkOrderTypesPanel />);

    await waitFor(() => {
      expect(screen.getByText('Service Call')).toBeInTheDocument();
    });
    const addButton = screen
      .getAllByRole('button')
      .find((b) => /^add /i.test(b.textContent ?? ''));
    await user.click(addButton!);

    await screen.findByText(/add work order type/i);
    await user.click(screen.getByRole('button', { name: /cancel/i }));

    await waitFor(() => {
      expect(screen.queryByText(/add work order type/i)).not.toBeInTheDocument();
    });
  });

  it('closes the delete confirmation on cancel', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: TWO_TYPES_ENVELOPE });
    const user = userEvent.setup();
    renderWithProviders(<WorkOrderTypesPanel />);

    await waitFor(() => {
      expect(screen.getByText('Service Call')).toBeInTheDocument();
    });

    const moreButtons = screen.getAllByRole('button', { name: /more options/i });
    await user.click(moreButtons[0]);
    await user.click(await screen.findByRole('menuitem', { name: /delete/i }));

    await screen.findByText(/delete "service call"\?/i);
    await user.click(screen.getByRole('button', { name: /cancel/i }));

    await waitFor(() => {
      expect(screen.queryByText(/delete "service call"\?/i)).not.toBeInTheDocument();
    });
  });
});
