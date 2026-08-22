import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, within, fireEvent } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../../test/utils';
import DispatchRegionsPanel from './DispatchRegionsPanel';
import { apiClient } from '../../api/setup';
import { showError } from '../../lib/toast';

vi.mock('@dispatch/api/src/client');

vi.mock('../../lib/toast', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/toast')>();
  return {
    ...actual,
    showSuccess: vi.fn(),
    showError: vi.fn(),
  };
});

const mockRegions = [
  {
    id: 'r-1',
    name: 'Georgia',
    abbreviation: 'GA',
    sortOrder: 0,
    isActive: true,
    createdAt: '',
    updatedAt: '',
    version: 0,
  },
  {
    id: 'r-2',
    name: 'South Carolina',
    abbreviation: 'SC',
    sortOrder: 1,
    isActive: true,
    createdAt: '',
    updatedAt: '',
    version: 0,
  },
  {
    id: 'r-3',
    name: 'Old Florida',
    abbreviation: 'FL',
    sortOrder: 2,
    isActive: false,
    createdAt: '',
    updatedAt: '',
    version: 0,
  },
];

describe('DispatchRegionsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockRegions });
  });

  it('renders regions with active dot and disabled Pill', async () => {
    renderWithProviders(<DispatchRegionsPanel />);

    await waitFor(() => expect(screen.getByText('Georgia')).toBeInTheDocument());
    expect(screen.getByText('South Carolina')).toBeInTheDocument();
    expect(screen.getByText('Old Florida')).toBeInTheDocument();
    expect(screen.getAllByText('Active').length).toBe(2);
    expect(screen.getByText('Disabled')).toBeInTheDocument();
  });

  it('only active rows are draggable (inactive rows have no drag handle)', async () => {
    renderWithProviders(<DispatchRegionsPanel />);

    await waitFor(() => expect(screen.getByText('Old Florida')).toBeInTheDocument());

    const inactiveRow = screen.getByText('Old Florida').closest('tr')!;
    expect(
      within(inactiveRow).queryByRole('img', { name: /drag to reorder/i }),
    ).not.toBeInTheDocument();
    expect(inactiveRow).not.toHaveAttribute('draggable', 'true');

    const activeRow = screen.getByText('Georgia').closest('tr')!;
    expect(
      within(activeRow).getByRole('img', { name: /drag to reorder/i }),
    ).toBeInTheDocument();
  });

  it('reorders only active regions via drag-and-drop', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ data: mockRegions });

    renderWithProviders(<DispatchRegionsPanel />);

    await waitFor(() => expect(screen.getByText('South Carolina')).toBeInTheDocument());

    const gaRow = screen.getByText('Georgia').closest('tr')!;
    const scRow = screen.getByText('South Carolina').closest('tr')!;

    const dataTransfer = {
      effectAllowed: 'move',
      dropEffect: 'move',
      setData: vi.fn(),
      getData: vi.fn(),
      types: [],
      files: [],
      items: [],
    };

    fireEvent.dragStart(scRow, { dataTransfer });
    fireEvent.dragOver(gaRow, { dataTransfer });
    fireEvent.drop(gaRow, { dataTransfer });

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith('/tenant/dispatch-regions/reorder', {
        orderedIds: ['r-2', 'r-1'],
      });
    });
  });

  it('opens add dialog when Add is clicked', async () => {
    const user = userEvent.setup();
    renderWithProviders(<DispatchRegionsPanel />);

    await waitFor(() => expect(screen.getByText('Georgia')).toBeInTheDocument());

    const addButton = screen.getAllByRole('button').find((b) =>
      /add.*region/i.test(b.textContent ?? ''),
    );
    expect(addButton).toBeDefined();
    await user.click(addButton!);

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('disables an active region via ConfirmDialog', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.delete).mockResolvedValue({ data: undefined });

    renderWithProviders(<DispatchRegionsPanel />);

    await waitFor(() => expect(screen.getByText('Georgia')).toBeInTheDocument());

    const row = screen.getByText('Georgia').closest('tr')!;
    await user.click(within(row).getByRole('button', { name: /more options/i }));
    await user.click(await screen.findByRole('menuitem', { name: /^disable$/i }));

    // ConfirmDialog appears with title containing the region name.
    expect(await screen.findByText(/disable "georgia"\?/i)).toBeInTheDocument();

    // Two "Disable" labels are now visible: the menuitem (closed) is gone;
    // the dialog's confirm button is the only remaining one. Click it.
    const confirmButtons = screen.getAllByRole('button', { name: /^disable$/i });
    await user.click(confirmButtons[confirmButtons.length - 1]);

    await waitFor(() => {
      expect(apiClient.delete).toHaveBeenCalledWith('/tenant/dispatch-regions/r-1');
    });
  });

  it('enables an inactive region immediately (no confirm)', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.post).mockResolvedValue({ data: mockRegions[2] });

    renderWithProviders(<DispatchRegionsPanel />);

    await waitFor(() => expect(screen.getByText('Old Florida')).toBeInTheDocument());

    const row = screen.getByText('Old Florida').closest('tr')!;
    await user.click(within(row).getByRole('button', { name: /more options/i }));
    await user.click(await screen.findByRole('menuitem', { name: /^enable$/i }));

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith('/tenant/dispatch-regions/r-3/reactivate');
    });
  });

  it('opens edit dialog populated with region data', async () => {
    const user = userEvent.setup();
    renderWithProviders(<DispatchRegionsPanel />);

    await waitFor(() => expect(screen.getByText('Georgia')).toBeInTheDocument());

    const row = screen.getByText('Georgia').closest('tr')!;
    await user.click(within(row).getByRole('button', { name: /more options/i }));
    await user.click(await screen.findByRole('menuitem', { name: /^edit$/i }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText(/name/i)).toHaveValue('Georgia');
    expect(within(dialog).getByLabelText(/abbreviation/i)).toHaveValue('GA');
  });

  it('does not disable if confirm dialog is cancelled', async () => {
    const user = userEvent.setup();
    renderWithProviders(<DispatchRegionsPanel />);

    await waitFor(() => expect(screen.getByText('Georgia')).toBeInTheDocument());

    const row = screen.getByText('Georgia').closest('tr')!;
    await user.click(within(row).getByRole('button', { name: /more options/i }));
    await user.click(await screen.findByRole('menuitem', { name: /^disable$/i }));

    expect(await screen.findByText(/disable "georgia"\?/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^cancel$/i }));

    expect(apiClient.delete).not.toHaveBeenCalled();
  });

  it('filters rows by search query (name + abbreviation)', async () => {
    const user = userEvent.setup();
    renderWithProviders(<DispatchRegionsPanel />);

    await waitFor(() => expect(screen.getByText('Georgia')).toBeInTheDocument());

    const search = screen.getByPlaceholderText(/search/i);
    await user.type(search, 'sc');

    expect(screen.getByText('South Carolina')).toBeInTheDocument();
    expect(screen.queryByText('Georgia')).not.toBeInTheDocument();
    expect(screen.queryByText('Old Florida')).not.toBeInTheDocument();
  });

  it('surfaces API error on load failure', async () => {
    const error = Object.assign(new Error('fail'), {
      response: { data: { message: 'Region service down' } },
    });
    vi.mocked(apiClient.get).mockRejectedValue(error);

    renderWithProviders(<DispatchRegionsPanel />);

    await waitFor(() => {
      expect(screen.getByText('Region service down')).toBeInTheDocument();
    });
  });

  it('refetches when the error-state retry is clicked', async () => {
    const error = Object.assign(new Error('fail'), {
      response: { data: { message: 'Region service down' } },
    });
    vi.mocked(apiClient.get).mockRejectedValueOnce(error);

    const user = userEvent.setup();
    renderWithProviders(<DispatchRegionsPanel />);

    await waitFor(() =>
      expect(screen.getByText('Region service down')).toBeInTheDocument()
    );

    vi.mocked(apiClient.get).mockResolvedValue({ data: mockRegions });
    await user.click(screen.getByRole('button', { name: /try again/i }));

    await waitFor(() => expect(screen.getByText('Georgia')).toBeInTheDocument());
  });

  it('opens the add dialog from the empty state', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: [] });

    const user = userEvent.setup();
    renderWithProviders(<DispatchRegionsPanel />);

    // Empty-state copy renders once the (empty) list resolves.
    const addButtons = await screen.findAllByRole('button', {
      name: /add.*region/i,
    });
    // The empty-state action is the trailing add affordance (header add leads).
    await user.click(addButtons[addButtons.length - 1]);

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('clears the search from the no-match empty state', async () => {
    const user = userEvent.setup();
    renderWithProviders(<DispatchRegionsPanel />);

    await waitFor(() => expect(screen.getByText('Georgia')).toBeInTheDocument());

    await user.type(screen.getByPlaceholderText(/search/i), 'zzzzz');

    await waitFor(() =>
      expect(screen.queryByText('Georgia')).not.toBeInTheDocument()
    );

    await user.click(screen.getByRole('button', { name: /clear search/i }));

    await waitFor(() => expect(screen.getByText('Georgia')).toBeInTheDocument());
  });

  it('closes the form dialog on Escape', async () => {
    const user = userEvent.setup();
    renderWithProviders(<DispatchRegionsPanel />);

    await waitFor(() => expect(screen.getByText('Georgia')).toBeInTheDocument());

    const row = screen.getByText('Georgia').closest('tr')!;
    await user.click(within(row).getByRole('button', { name: /more options/i }));
    await user.click(await screen.findByRole('menuitem', { name: /^edit$/i }));

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    await user.keyboard('{Escape}');

    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    );
  });

  it('surfaces a toast when disabling a region fails', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.delete).mockRejectedValue(new Error('boom'));

    renderWithProviders(<DispatchRegionsPanel />);

    await waitFor(() => expect(screen.getByText('Georgia')).toBeInTheDocument());

    const row = screen.getByText('Georgia').closest('tr')!;
    await user.click(within(row).getByRole('button', { name: /more options/i }));
    await user.click(await screen.findByRole('menuitem', { name: /^disable$/i }));

    const confirmButtons = screen.getAllByRole('button', { name: /^disable$/i });
    await user.click(confirmButtons[confirmButtons.length - 1]);

    await waitFor(() => expect(vi.mocked(showError)).toHaveBeenCalled());
  });

  it('surfaces a toast when enabling a region fails', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.post).mockRejectedValue(new Error('boom'));

    renderWithProviders(<DispatchRegionsPanel />);

    await waitFor(() => expect(screen.getByText('Old Florida')).toBeInTheDocument());

    const row = screen.getByText('Old Florida').closest('tr')!;
    await user.click(within(row).getByRole('button', { name: /more options/i }));
    await user.click(await screen.findByRole('menuitem', { name: /^enable$/i }));

    await waitFor(() => expect(vi.mocked(showError)).toHaveBeenCalled());
  });

  it('surfaces a toast when reordering fails', async () => {
    vi.mocked(apiClient.post).mockRejectedValue(new Error('boom'));

    renderWithProviders(<DispatchRegionsPanel />);

    await waitFor(() => expect(screen.getByText('South Carolina')).toBeInTheDocument());

    const gaRow = screen.getByText('Georgia').closest('tr')!;
    const scRow = screen.getByText('South Carolina').closest('tr')!;
    const dataTransfer = {
      effectAllowed: 'move',
      dropEffect: 'move',
      setData: vi.fn(),
      getData: vi.fn(),
      types: [],
      files: [],
      items: [],
    };

    fireEvent.dragStart(scRow, { dataTransfer });
    fireEvent.dragOver(gaRow, { dataTransfer });
    fireEvent.drop(gaRow, { dataTransfer });

    await waitFor(() => expect(vi.mocked(showError)).toHaveBeenCalled());
  });
});
