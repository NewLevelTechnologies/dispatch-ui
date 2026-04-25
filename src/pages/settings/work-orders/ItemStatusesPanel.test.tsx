import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../../../test/utils';
import ItemStatusesPanel from './ItemStatusesPanel';
import apiClient from '../../../api/client';

vi.mock('../../../api/client');

const mockStatuses = [
  {
    id: 'st-1',
    tenantId: 't-1',
    name: 'New',
    code: 'NEW',
    statusCategory: 'NOT_STARTED' as const,
    isTerminal: false,
    description: null,
    color: '#9CA3AF',
    icon: null,
    isActive: true,
    sortOrder: 0,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
  {
    id: 'st-2',
    tenantId: 't-1',
    name: 'In Progress',
    code: 'IN_PROGRESS',
    statusCategory: 'IN_PROGRESS' as const,
    isTerminal: false,
    description: null,
    color: '#3B82F6',
    icon: null,
    isActive: true,
    sortOrder: 1,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
  {
    id: 'st-3',
    tenantId: 't-1',
    name: 'Complete',
    code: 'COMPLETE',
    statusCategory: 'COMPLETED' as const,
    isTerminal: true,
    description: null,
    color: '#10B981',
    icon: null,
    isActive: true,
    sortOrder: 2,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
];

describe('ItemStatusesPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockStatuses });
  });

  it('renders statuses with category badges', async () => {
    renderWithProviders(<ItemStatusesPanel />);

    await waitFor(() => expect(screen.getByText('New')).toBeInTheDocument());
    expect(screen.getByText('Complete')).toBeInTheDocument();
    // "In Progress" appears twice (name + category badge label)
    expect(screen.getAllByText('In Progress').length).toBe(2);
    expect(screen.getByText('Not Started')).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();
  });

  it('shows Enabled marker for terminal statuses', async () => {
    renderWithProviders(<ItemStatusesPanel />);

    await waitFor(() => expect(screen.getByText('Complete')).toBeInTheDocument());

    const completeRow = screen.getByText('Complete').closest('tr')!;
    expect(within(completeRow).getByText('Enabled')).toBeInTheDocument();
  });

  it('renders empty state', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: [] });
    renderWithProviders(<ItemStatusesPanel />);

    await waitFor(() => {
      expect(screen.getByText(/no.*item statuses.*found/i)).toBeInTheDocument();
    });
  });

  it('surfaces API error message on load failure', async () => {
    const error = Object.assign(new Error('fail'), {
      response: { data: { message: 'Backend unavailable' } },
    });
    vi.mocked(apiClient.get).mockRejectedValue(error);

    renderWithProviders(<ItemStatusesPanel />);

    await waitFor(() => {
      expect(screen.getByText('Backend unavailable')).toBeInTheDocument();
    });
  });

  it('opens create dialog with category dropdown and terminal toggle', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ItemStatusesPanel />);

    await waitFor(() => expect(screen.getByText('New')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /add item status/i }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText(/category/i)).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/terminal/i)).toBeInTheDocument();
  });

  it('submits create with auto-assigned sortOrder', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.post).mockResolvedValue({ data: mockStatuses[0] });

    renderWithProviders(<ItemStatusesPanel />);

    await waitFor(() => expect(screen.getByText('New')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /add item status/i }));
    const dialog = await screen.findByRole('dialog');

    await user.type(within(dialog).getByLabelText(/name/i), 'Pending Parts');
    await user.click(within(dialog).getByRole('button', { name: /^create$/i }));

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        '/work-orders/config/item-statuses',
        expect.objectContaining({
          name: 'Pending Parts',
          code: 'PENDING_PARTS',
          sortOrder: 3, // max(0,1,2) + 1
          statusCategory: 'NOT_STARTED',
          isTerminal: false,
        })
      );
    });
  });

  it('disables code field when editing existing status', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ItemStatusesPanel />);

    // Find the row by the unique status code (codes are unique; status names may collide
    // with category labels, e.g. "In Progress").
    await waitFor(() => expect(screen.getByText('IN_PROGRESS')).toBeInTheDocument());

    const row = screen.getByText('IN_PROGRESS').closest('tr')!;
    await user.click(within(row).getByRole('button', { name: /more options/i }));
    await user.click(await screen.findByRole('menuitem', { name: /^edit$/i }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText(/code/i)).toBeDisabled();
    expect(within(dialog).getByLabelText(/name/i)).toHaveValue('In Progress');
  });

  it('reorders via the down arrow', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.post).mockResolvedValue({ data: mockStatuses });

    renderWithProviders(<ItemStatusesPanel />);

    await waitFor(() => expect(screen.getByText('New')).toBeInTheDocument());

    const newRow = screen.getByText('New').closest('tr')!;
    await user.click(within(newRow).getByRole('button', { name: /move down/i }));

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        '/work-orders/config/item-statuses/reorder',
        { orderedIds: ['st-2', 'st-1', 'st-3'] }
      );
    });
  });

  it('exercises every field in the create dialog', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.post).mockResolvedValue({ data: mockStatuses[0] });
    renderWithProviders(<ItemStatusesPanel />);

    await waitFor(() => expect(screen.getByText('New')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /add item status/i }));

    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/name/i), 'Pending Parts');
    await user.type(within(dialog).getByLabelText(/description/i), 'Waiting on parts');

    // Change category dropdown
    await user.selectOptions(within(dialog).getByLabelText(/category/i), 'BLOCKED');

    // Toggle isTerminal
    await user.click(within(dialog).getByLabelText(/terminal/i));

    // Type into the color text mirror
    const colorInputs = within(dialog).getAllByDisplayValue('#6366F1');
    const colorText = colorInputs.find((i) => (i as HTMLInputElement).type === 'text');
    if (colorText) {
      await user.clear(colorText);
      await user.type(colorText, '#FF8800');
    }

    // Manually edit the code
    const codeInput = within(dialog).getByLabelText(/code/i);
    await user.clear(codeInput);
    await user.type(codeInput, 'WAITING_PARTS');

    await user.click(within(dialog).getByRole('button', { name: /^create$/i }));

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        '/work-orders/config/item-statuses',
        expect.objectContaining({
          name: 'Pending Parts',
          code: 'WAITING_PARTS',
          description: 'Waiting on parts',
          statusCategory: 'BLOCKED',
          isTerminal: true,
          color: '#FF8800',
        })
      );
    });
  });

  it('deletes after confirmation', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.delete).mockResolvedValue({ data: undefined });
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    renderWithProviders(<ItemStatusesPanel />);

    await waitFor(() => expect(screen.getByText('Complete')).toBeInTheDocument());

    const row = screen.getByText('Complete').closest('tr')!;
    await user.click(within(row).getByRole('button', { name: /more options/i }));
    await user.click(await screen.findByRole('menuitem', { name: /^delete$/i }));

    await waitFor(() => {
      expect(apiClient.delete).toHaveBeenCalledWith('/work-orders/config/item-statuses/st-3');
    });

    confirmSpy.mockRestore();
  });
});
