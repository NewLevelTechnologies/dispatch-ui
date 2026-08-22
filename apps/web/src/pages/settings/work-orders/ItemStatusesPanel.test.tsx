import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, within, fireEvent } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../../../test/utils';
import ItemStatusesPanel from './ItemStatusesPanel';
import { apiClient } from '../../../api/setup';

vi.mock('@dispatch/api/src/client');

const mockStatuses = [
  {
    id: 'st-1',
    tenantId: 't-1',
    name: 'New',
    code: 'NEW',
    statusCategory: 'NOT_STARTED' as const,
    isTerminal: false,
    isSeeded: true,
    accentId: 'blue',
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
    isSeeded: true,
    accentId: 'amber',
    icon: null,
    isActive: true,
    sortOrder: 1,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
  {
    id: 'st-3',
    tenantId: 't-1',
    name: 'Parts Arrived',
    code: 'PARTS_ARRIVED',
    statusCategory: 'AWAITING_SCHEDULE' as const,
    isTerminal: false,
    isSeeded: true,
    accentId: 'green',
    icon: null,
    isActive: true,
    sortOrder: 2,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
  {
    id: 'st-4',
    tenantId: 't-1',
    name: 'Tenant Custom',
    code: 'CUSTOM_STATE',
    statusCategory: 'BLOCKED' as const,
    isTerminal: false,
    isSeeded: false,
    accentId: 'coral',
    icon: null,
    isActive: true,
    sortOrder: 3,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
  {
    id: 'st-5',
    tenantId: 't-1',
    name: 'Complete',
    code: 'COMPLETE',
    statusCategory: 'COMPLETED' as const,
    isTerminal: true,
    isSeeded: true,
    accentId: 'green',
    icon: null,
    isActive: true,
    sortOrder: 4,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
];

describe('ItemStatusesPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockStatuses });
  });

  it('renders statuses with category pills', async () => {
    renderWithProviders(<ItemStatusesPanel />);

    await waitFor(() => expect(screen.getByText('New')).toBeInTheDocument());
    expect(screen.getByText('Complete')).toBeInTheDocument();
    expect(screen.getByText('Parts Arrived')).toBeInTheDocument();
    // Category label for the new AWAITING_SCHEDULE category is present
    expect(screen.getByText('Awaiting Schedule')).toBeInTheDocument();
    expect(screen.getByText('Not Started')).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();
  });

  it('shows the Terminal badge for terminal statuses', async () => {
    renderWithProviders(<ItemStatusesPanel />);

    await waitFor(() => expect(screen.getByText('Complete')).toBeInTheDocument());

    const completeRow = screen.getByText('Complete').closest('tr')!;
    expect(within(completeRow).getByText('Terminal')).toBeInTheDocument();
  });

  it('shows the Built-in badge for seeded statuses', async () => {
    renderWithProviders(<ItemStatusesPanel />);

    await waitFor(() => expect(screen.getByText('New')).toBeInTheDocument());

    const seededRow = screen.getByText('New').closest('tr')!;
    expect(within(seededRow).getByText('Built-in')).toBeInTheDocument();

    // The tenant-custom row should NOT carry the Built-in pill.
    const customRow = screen.getByText('Tenant Custom').closest('tr')!;
    expect(within(customRow).queryByText('Built-in')).not.toBeInTheDocument();
  });

  it('renders empty state when the API returns no statuses', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: [] });
    renderWithProviders(<ItemStatusesPanel />);

    await waitFor(() => {
      expect(screen.getByText(/no.*statuses yet/i)).toBeInTheDocument();
    });
  });

  it('surfaces the API error message on load failure', async () => {
    const error = Object.assign(new Error('fail'), {
      response: { data: { message: 'Backend unavailable' } },
    });
    vi.mocked(apiClient.get).mockRejectedValue(error);

    renderWithProviders(<ItemStatusesPanel />);

    await waitFor(() => {
      expect(screen.getByText('Backend unavailable')).toBeInTheDocument();
    });
  });

  it('opens the create dialog with category select and terminal toggle', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ItemStatusesPanel />);

    await waitFor(() => expect(screen.getByText('New')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /^add status$/i }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText(/category/i)).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/terminal/i)).toBeInTheDocument();
    // No more freeform "description" or hex color picker in the new dialog.
    expect(within(dialog).queryByLabelText(/description/i)).not.toBeInTheDocument();
  });

  it('submits create with auto-assigned sortOrder and accentId', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.post).mockResolvedValue({ data: mockStatuses[0] });

    renderWithProviders(<ItemStatusesPanel />);

    await waitFor(() => expect(screen.getByText('New')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /^add status$/i }));
    const dialog = await screen.findByRole('dialog');

    await user.type(within(dialog).getByLabelText(/name/i), 'Pending Parts');
    await user.click(within(dialog).getByRole('button', { name: /^create status$/i }));

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        '/work-orders/config/item-statuses',
        expect.objectContaining({
          name: 'Pending Parts',
          code: 'PENDING_PARTS',
          sortOrder: 5, // max(0..4) + 1
          statusCategory: 'NOT_STARTED',
          isTerminal: false,
          accentId: 'blue', // first swatch is the default
        })
      );
    });
  });

  it('disables the code field when editing a seeded status', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ItemStatusesPanel />);

    // Find the row by the unique code (names like "In Progress" also appear
    // in the category column).
    await waitFor(() => expect(screen.getByText('IN_PROGRESS')).toBeInTheDocument());

    const row = screen.getByText('IN_PROGRESS').closest('tr')!;
    await user.click(within(row).getByRole('button', { name: /more options/i }));
    await user.click(await screen.findByRole('menuitem', { name: /^edit$/i }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText(/code/i)).toBeDisabled();
    expect(within(dialog).getByLabelText(/name/i)).toHaveValue('In Progress');
  });

  it('leaves the code field editable for a tenant-created status', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ItemStatusesPanel />);

    await waitFor(() => expect(screen.getByText('CUSTOM_STATE')).toBeInTheDocument());

    const row = screen.getByText('CUSTOM_STATE').closest('tr')!;
    await user.click(within(row).getByRole('button', { name: /more options/i }));
    await user.click(await screen.findByRole('menuitem', { name: /^edit$/i }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText(/code/i)).not.toBeDisabled();
  });

  it('disables Delete on seeded statuses', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ItemStatusesPanel />);

    await waitFor(() => expect(screen.getByText('NEW')).toBeInTheDocument());

    const seededRow = screen.getByText('NEW').closest('tr')!;
    await user.click(within(seededRow).getByRole('button', { name: /more options/i }));
    const deleteItem = await screen.findByRole('menuitem', { name: /delete/i });
    expect(deleteItem).toHaveAttribute('aria-disabled', 'true');
  });

  it('reorders rows via drag-and-drop, posting the new id order', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ data: mockStatuses });

    renderWithProviders(<ItemStatusesPanel />);

    await waitFor(() => expect(screen.getByText('New')).toBeInTheDocument());

    // Drag "In Progress" (st-2) onto "New" (st-1) → [st-2, st-1, st-3, st-4, st-5].
    const newRow = screen.getByText('NEW').closest('tr')!;
    const inProgressRow = screen.getByText('IN_PROGRESS').closest('tr')!;

    const dataTransfer = {
      effectAllowed: 'move',
      dropEffect: 'move',
      setData: vi.fn(),
      getData: vi.fn(),
      types: [],
      files: [],
      items: [],
    };

    fireEvent.dragStart(inProgressRow, { dataTransfer });
    fireEvent.dragOver(newRow, { dataTransfer });
    fireEvent.drop(newRow, { dataTransfer });

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        '/work-orders/config/item-statuses/reorder',
        { orderedIds: ['st-2', 'st-1', 'st-3', 'st-4', 'st-5'] }
      );
    });
  });

  it('opens the confirm dialog when deleting a tenant-created status', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ItemStatusesPanel />);

    await waitFor(() => expect(screen.getByText('Tenant Custom')).toBeInTheDocument());

    const row = screen.getByText('Tenant Custom').closest('tr')!;
    await user.click(within(row).getByRole('button', { name: /more options/i }));
    await user.click(await screen.findByRole('menuitem', { name: /^delete$/i }));

    await screen.findByText(/delete "tenant custom"\?/i);
  });

  it('warns when the category is changed on a seeded status', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ItemStatusesPanel />);

    await waitFor(() => expect(screen.getByText('NEW')).toBeInTheDocument());

    const seededRow = screen.getByText('NEW').closest('tr')!;
    await user.click(within(seededRow).getByRole('button', { name: /more options/i }));
    await user.click(await screen.findByRole('menuitem', { name: /^edit$/i }));

    const dialog = await screen.findByRole('dialog');
    await user.selectOptions(
      within(dialog).getByLabelText(/category/i),
      'AWAITING_SCHEDULE'
    );

    expect(
      within(dialog).getByText(/may affect dispatch queue and progress rollups/i)
    ).toBeInTheDocument();
  });
});
