import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import WorkItemStatusPill from './WorkItemStatusPill';
import apiClient from '../api/client';
import type {
  StatusWorkflowRule,
  WorkItemResponse,
  WorkItemStatus,
} from '../api';

vi.mock('../api/client');

const status = (id: string, name: string, category: WorkItemStatus['statusCategory']): WorkItemStatus => ({
  id,
  tenantId: 't',
  name,
  code: name.toUpperCase().replace(/\s+/g, '_'),
  statusCategory: category,
  isTerminal: category === 'COMPLETED' || category === 'CANCELLED',
  isActive: true,
  sortOrder: 0,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
});

const allStatuses: WorkItemStatus[] = [
  status('s-pending', 'Pending', 'NOT_STARTED'),
  status('s-progress', 'In Progress', 'IN_PROGRESS'),
  status('s-blocked', 'Blocked', 'BLOCKED'),
  status('s-done', 'Done', 'COMPLETED'),
];

const baseWorkItem: WorkItemResponse = {
  id: 'wi-1',
  statusId: 's-pending',
  statusCategory: 'NOT_STARTED',
  description: 'Test item',
  equipmentId: null,
  equipment: null,
  createdAt: '2026-04-21T13:40:00Z',
  updatedAt: '2026-04-22T10:30:00Z',
};

describe('WorkItemStatusPill', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the current status name as a badge when the tenant has named it', () => {
    renderWithProviders(
      <WorkItemStatusPill
        workOrderId="wo-1"
        workItem={baseWorkItem}
        statuses={allStatuses}
        workflows={[]}
        enforceWorkflow={false}
      />
    );
    expect(screen.getByText('Pending')).toBeInTheDocument();
  });

  it('falls back to the category label when statusId is null', () => {
    renderWithProviders(
      <WorkItemStatusPill
        workOrderId="wo-1"
        workItem={{ ...baseWorkItem, statusId: null }}
        statuses={allStatuses}
        workflows={[]}
        enforceWorkflow={false}
      />
    );
    // PROGRESS_TRANSLATION_KEYS['NOT_STARTED'] = 'notStarted'; mock returns the key
    // when no translation match exists, so we see the i18n key string.
    expect(screen.getByText(/Not Started|notStarted/)).toBeInTheDocument();
  });

  it('renders read-only badge (no dropdown) when readOnly is true', () => {
    renderWithProviders(
      <WorkItemStatusPill
        workOrderId="wo-1"
        workItem={baseWorkItem}
        statuses={allStatuses}
        workflows={[]}
        enforceWorkflow={false}
        readOnly
      />
    );
    expect(screen.queryByRole('button', { name: /change status/i })).not.toBeInTheDocument();
  });

  it('shows all active statuses (except current) when workflow is not enforced', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <WorkItemStatusPill
        workOrderId="wo-1"
        workItem={baseWorkItem}
        statuses={allStatuses}
        workflows={[]}
        enforceWorkflow={false}
      />
    );
    const trigger = screen.getByRole('button', { name: /change status/i });
    await user.click(trigger);

    await waitFor(() => {
      expect(screen.getByRole('menuitem', { name: 'In Progress' })).toBeInTheDocument();
    });
    expect(screen.getByRole('menuitem', { name: 'Blocked' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Done' })).toBeInTheDocument();
    // Current status is excluded from the options
    expect(screen.queryByRole('menuitem', { name: 'Pending' })).not.toBeInTheDocument();
  });

  it('only shows allowed transitions when workflow is enforced', async () => {
    const workflows: StatusWorkflowRule[] = [
      {
        id: 'rule-1',
        tenantId: 't',
        fromStatusId: 's-pending',
        toStatusId: 's-progress',
        isAllowed: true,
        requiresApproval: false,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ];
    const user = userEvent.setup();
    renderWithProviders(
      <WorkItemStatusPill
        workOrderId="wo-1"
        workItem={baseWorkItem}
        statuses={allStatuses}
        workflows={workflows}
        enforceWorkflow
      />
    );
    const trigger = screen.getByRole('button', { name: /change status/i });
    await user.click(trigger);

    await waitFor(() => {
      expect(screen.getByRole('menuitem', { name: 'In Progress' })).toBeInTheDocument();
    });
    // Blocked and Done aren't in the workflow rules → not shown
    expect(screen.queryByRole('menuitem', { name: 'Blocked' })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Done' })).not.toBeInTheDocument();
  });

  it('falls back to read-only badge when workflow is enforced and no transitions are allowed', () => {
    renderWithProviders(
      <WorkItemStatusPill
        workOrderId="wo-1"
        workItem={baseWorkItem}
        statuses={allStatuses}
        workflows={[]}
        enforceWorkflow
      />
    );
    expect(screen.queryByRole('button', { name: /change status/i })).not.toBeInTheDocument();
    expect(screen.getByText('Pending')).toBeInTheDocument();
  });

  it('fires updateWorkItemStatus mutation when an option is selected', async () => {
    vi.mocked(apiClient.patch).mockResolvedValue({ data: {} });
    const user = userEvent.setup();
    renderWithProviders(
      <WorkItemStatusPill
        workOrderId="wo-1"
        workItem={baseWorkItem}
        statuses={allStatuses}
        workflows={[]}
        enforceWorkflow={false}
      />
    );

    await user.click(screen.getByRole('button', { name: /change status/i }));
    await waitFor(() => {
      expect(screen.getByRole('menuitem', { name: 'In Progress' })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('menuitem', { name: 'In Progress' }));

    await waitFor(() => {
      expect(apiClient.patch).toHaveBeenCalledWith(
        '/work-orders/wo-1/work-items/wi-1/status',
        { statusId: 's-progress' }
      );
    });
  });
});
