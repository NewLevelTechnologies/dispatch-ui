import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import type { RouteObject } from 'react-router-dom';
import { renderWithProviders, userEvent } from '../../../test/utils';
import WorkflowEditorPage from './WorkflowEditorPage';
import { apiClient } from '../../../api/setup';

vi.mock('@dispatch/api/src/client');

const baseStatus = (id: string, name: string) => ({
  id,
  tenantId: 't',
  name,
  code: name.toUpperCase().replace(/\s+/g, '_'),
  statusCategory: 'IN_PROGRESS',
  isTerminal: false,
  isSeeded: true,
  accentId: 'blue',
  isActive: true,
  sortOrder: 0,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
});

const statuses = [
  baseStatus('s-new', 'New'),
  baseStatus('s-progress', 'In Progress'),
  baseStatus('s-done', 'Complete'),
];

const seededWorkflow = {
  id: 'wf-1',
  tenantId: 't',
  workOrderTypeId: 'type-1',
  workOrderType: {
    id: 'type-1',
    name: 'Service Call',
    code: 'SERVICE_CALL',
    accentId: 'blue',
  },
  name: 'Service Call workflow',
  initialStatusId: 's-new',
  isSeeded: true,
  transitionCount: 1,
  approvalGateCount: 0,
  transitions: [
    {
      id: 'tx-1',
      tenantId: 't',
      workflowId: 'wf-1',
      fromStatusId: 's-new',
      toStatusId: 's-progress',
      requiresApproval: false,
      approverCapabilities: [],
      approvalExpiryHours: null,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    },
  ],
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

const customWorkflow = {
  ...seededWorkflow,
  id: 'wf-2',
  isSeeded: false,
  workOrderType: {
    id: 'type-2',
    name: 'Custom',
    code: 'CUSTOM',
    accentId: 'rose',
  },
};

const baseConfig = {
  id: 'cfg-1',
  tenantId: 't',
  enforcementMode: 'OPEN' as const,
  defaultApprovalExpiryHours: 72,
  dispatchBoardType: 'STATUS_BASED' as const,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

function mockEndpoints({
  workflow = seededWorkflow,
  statusesData = statuses,
  config = baseConfig,
}: {
  workflow?: typeof seededWorkflow;
  statusesData?: typeof statuses;
  config?: typeof baseConfig;
} = {}) {
  vi.mocked(apiClient.get).mockImplementation((url) => {
    if (url.match(/^\/work-orders\/config\/workflows\/[^/]+$/)) {
      return Promise.resolve({ data: workflow });
    }
    if (url === '/work-orders/config/item-statuses') {
      return Promise.resolve({ data: statusesData });
    }
    if (url === '/work-orders/config/workflow') {
      return Promise.resolve({ data: config });
    }
    return Promise.reject(new Error(`Unmocked: ${url}`));
  });
}

const routes: RouteObject[] = [
  {
    path: '/settings/work-orders/workflows',
    // eslint-disable-next-line i18next/no-literal-string
    element: <div>Workflows List</div>,
  },
  {
    path: '/settings/work-orders/workflows/:id',
    element: <WorkflowEditorPage />,
  },
];

describe('WorkflowEditorPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the workflow header with its WO type name and Built-in pill', async () => {
    mockEndpoints();
    renderWithProviders(<WorkflowEditorPage />, {
      routes,
      initialPath: '/settings/work-orders/workflows/wf-1',
    });
    expect(await screen.findByRole('heading', { name: /Service Call/ })).toBeInTheDocument();
    expect(screen.getByText('Built-in')).toBeInTheDocument();
  });

  it('renders the matrix once the workflow loads', async () => {
    mockEndpoints();
    renderWithProviders(<WorkflowEditorPage />, {
      routes,
      initialPath: '/settings/work-orders/workflows/wf-1',
    });
    // Wait for the workflow query + matrix to render.
    await screen.findByRole('heading', { name: /Service Call/ });
    // Each status renders twice in the matrix (row header + column header).
    await waitFor(() => {
      expect(screen.getAllByText('New')).toHaveLength(2);
      expect(screen.getAllByText('In Progress')).toHaveLength(2);
      expect(screen.getAllByText('Complete')).toHaveLength(2);
    });
  });

  it('shows the Reset-to-default button only for seeded workflows', async () => {
    mockEndpoints({ workflow: customWorkflow });
    renderWithProviders(<WorkflowEditorPage />, {
      routes,
      initialPath: '/settings/work-orders/workflows/wf-2',
    });
    await screen.findByRole('heading', { name: /Custom/ });
    expect(
      screen.queryByRole('button', { name: /Reset to default/i }),
    ).not.toBeInTheDocument();
  });

  it('opens the transition edit panel when a cell is clicked', async () => {
    mockEndpoints();
    const user = userEvent.setup();
    renderWithProviders(<WorkflowEditorPage />, {
      routes,
      initialPath: '/settings/work-orders/workflows/wf-1',
    });
    await screen.findByRole('heading', { name: /Service Call/ });
    const cell = screen
      .getAllByRole('button')
      .find((b) => /^New to In Progress/.test(b.getAttribute('aria-label') ?? ''));
    expect(cell).toBeDefined();
    await user.click(cell!);
    await screen.findByRole('dialog');
    // Title within the slide-over panel
    expect(screen.getByText(/Edit transition/i)).toBeInTheDocument();
  });

  it('Reset confirm fires the reset-to-default POST', async () => {
    mockEndpoints();
    vi.mocked(apiClient.post).mockResolvedValue({ data: seededWorkflow });
    const user = userEvent.setup();
    renderWithProviders(<WorkflowEditorPage />, {
      routes,
      initialPath: '/settings/work-orders/workflows/wf-1',
    });
    await screen.findByRole('heading', { name: /Service Call/ });

    await user.click(screen.getByRole('button', { name: /Reset to default/i }));
    const confirm = await screen.findByRole('button', { name: /^Reset to default$/i });
    await user.click(confirm);

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        '/work-orders/config/workflows/wf-1/reset-to-default',
      );
    });
  });

  it('renders an error state when the workflow fetch fails', async () => {
    vi.mocked(apiClient.get).mockImplementation((url) => {
      if (url.match(/^\/work-orders\/config\/workflows\/[^/]+$/)) {
        return Promise.reject(new Error('boom'));
      }
      if (url === '/work-orders/config/item-statuses') {
        return Promise.resolve({ data: statuses });
      }
      if (url === '/work-orders/config/workflow') {
        return Promise.resolve({ data: baseConfig });
      }
      return Promise.reject(new Error(`Unmocked: ${url}`));
    });
    renderWithProviders(<WorkflowEditorPage />, {
      routes,
      initialPath: '/settings/work-orders/workflows/wf-1',
    });
    expect(
      await screen.findByText(/Couldn't load workflows/i),
    ).toBeInTheDocument();
  });

  it('shows the no-statuses callout when the tenant has no item statuses', async () => {
    mockEndpoints({ statusesData: [] });
    renderWithProviders(<WorkflowEditorPage />, {
      routes,
      initialPath: '/settings/work-orders/workflows/wf-1',
    });
    expect(
      await screen.findByText(/No statuses available/i),
    ).toBeInTheDocument();
  });
});
