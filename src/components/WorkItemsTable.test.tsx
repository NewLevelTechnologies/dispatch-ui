import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../test/utils';
import WorkItemsTable from './WorkItemsTable';
import type { WorkItemResponse } from '../api';

vi.mock('../api/client');

const wi = (id: string, description: string): WorkItemResponse => ({
  id,
  statusId: null,
  statusCategory: 'NOT_STARTED',
  description,
  createdAt: '2026-04-21T13:40:00Z',
  updatedAt: '2026-04-22T10:30:00Z',
});

describe('WorkItemsTable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the empty state when there are no work items', () => {
    renderWithProviders(
      <WorkItemsTable
        workOrderId="wo-1"
        workItems={[]}
        statuses={[]}
        workflows={[]}
        enforceWorkflow={false}
      />
    );
    expect(screen.getByText(/no work items/i)).toBeInTheDocument();
  });

  it('renders one row per work item with the description', () => {
    renderWithProviders(
      <WorkItemsTable
        workOrderId="wo-1"
        workItems={[wi('wi-1', 'Replace filter'), wi('wi-2', 'Inspect coils')]}
        statuses={[]}
        workflows={[]}
        enforceWorkflow={false}
      />
    );
    expect(screen.getByText('Replace filter')).toBeInTheDocument();
    expect(screen.getByText('Inspect coils')).toBeInTheDocument();
  });

  it('passes readOnly through to the status pills', () => {
    renderWithProviders(
      <WorkItemsTable
        workOrderId="wo-1"
        workItems={[wi('wi-1', 'Replace filter')]}
        statuses={[]}
        workflows={[]}
        enforceWorkflow={false}
        readOnly
      />
    );
    // No interactive change-status button when readOnly
    expect(
      screen.queryByRole('button', { name: /change status/i })
    ).not.toBeInTheDocument();
  });
});
