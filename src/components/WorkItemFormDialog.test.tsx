import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import WorkItemFormDialog from './WorkItemFormDialog';
import apiClient from '../api/client';
import type { WorkItemResponse, WorkItemStatus } from '../api';

vi.mock('../api/client');

const status = (id: string, name: string): WorkItemStatus => ({
  id,
  tenantId: 't',
  name,
  code: name.toUpperCase().replace(/\s+/g, '_'),
  statusCategory: 'NOT_STARTED',
  isTerminal: false,
  isActive: true,
  sortOrder: 0,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
});

const allStatuses: WorkItemStatus[] = [
  status('s-pending', 'Pending'),
  status('s-progress', 'In Progress'),
];

const existingItem: WorkItemResponse = {
  id: 'wi-1',
  statusId: 's-pending',
  statusCategory: 'NOT_STARTED',
  description: 'Replace filter',
  createdAt: '2026-04-21T13:40:00Z',
  updatedAt: '2026-04-22T10:30:00Z',
};

describe('WorkItemFormDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiClient.get).mockResolvedValue({ data: allStatuses });
  });

  it('renders nothing when isOpen is false', () => {
    renderWithProviders(
      <WorkItemFormDialog isOpen={false} onClose={vi.fn()} workOrderId="wo-1" />
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows "Add Work Item" title in create mode', async () => {
    renderWithProviders(
      <WorkItemFormDialog isOpen={true} onClose={vi.fn()} workOrderId="wo-1" />
    );
    await waitFor(() => {
      expect(screen.getAllByText('Add Work Item').length).toBeGreaterThan(0);
    });
  });

  it('shows "Edit Work Item" title and pre-fills description in edit mode', async () => {
    renderWithProviders(
      <WorkItemFormDialog
        isOpen={true}
        onClose={vi.fn()}
        workOrderId="wo-1"
        workItem={existingItem}
      />
    );
    await waitFor(() => {
      expect(screen.getAllByText('Edit Work Item').length).toBeGreaterThan(0);
    });
    expect(screen.getByRole('textbox')).toHaveValue('Replace filter');
  });

  it('POSTs to /work-orders/:id/work-items on create', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({
      data: { ...existingItem, id: 'wi-new', description: 'New job' },
    });
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <WorkItemFormDialog isOpen={true} onClose={onClose} workOrderId="wo-1" />
    );

    await user.type(screen.getByRole('textbox'), 'New job');
    await user.click(screen.getByRole('button', { name: /create/i }));

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        '/work-orders/wo-1/work-items',
        { description: 'New job', statusId: undefined }
      );
    });
    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('PATCHes to /work-orders/:id/work-items/:itemId on update', async () => {
    vi.mocked(apiClient.patch).mockResolvedValue({
      data: { ...existingItem, description: 'Replace filter and check coils' },
    });
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <WorkItemFormDialog
        isOpen={true}
        onClose={onClose}
        workOrderId="wo-1"
        workItem={existingItem}
      />
    );

    const textarea = screen.getByRole('textbox');
    await user.clear(textarea);
    await user.type(textarea, 'Replace filter and check coils');
    await user.click(screen.getByRole('button', { name: /update/i }));

    await waitFor(() => {
      expect(apiClient.patch).toHaveBeenCalledWith(
        '/work-orders/wo-1/work-items/wi-1',
        {
          description: 'Replace filter and check coils',
          statusId: 's-pending',
        }
      );
    });
    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('rejects submission with whitespace-only description', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const user = userEvent.setup();
    renderWithProviders(
      <WorkItemFormDialog isOpen={true} onClose={vi.fn()} workOrderId="wo-1" />
    );

    const textarea = screen.getByRole('textbox');
    await user.type(textarea, '   ');
    // Native required validation may fire; submit programmatically to verify
    // our explicit alert path runs even when the browser would have allowed it.
    const form = document.getElementById('work-item-form');
    form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('Description is required');
    });
    expect(apiClient.post).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it('shows Close button (no Save) and disables the textarea when readOnly', async () => {
    renderWithProviders(
      <WorkItemFormDialog
        isOpen={true}
        onClose={vi.fn()}
        workOrderId="wo-1"
        workItem={existingItem}
        readOnly
      />
    );
    await waitFor(() => {
      expect(screen.getByRole('textbox')).toBeDisabled();
    });
    expect(screen.getByRole('button', { name: /close/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /update/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /create/i })).not.toBeInTheDocument();
  });
});
