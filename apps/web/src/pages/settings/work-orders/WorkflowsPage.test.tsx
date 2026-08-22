import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import type { RouteObject } from 'react-router-dom';
import { renderWithProviders, userEvent } from '../../../test/utils';
import WorkflowsPage from './WorkflowsPage';
import { apiClient } from '../../../api/setup';
import type { WorkflowConfig, WorkflowSummary } from '../../../api/setup';

vi.mock('@dispatch/api/src/client');

const baseConfig: WorkflowConfig = {
  id: 'cfg-1',
  tenantId: 't',
  enforcementMode: 'OPEN',
  defaultApprovalExpiryHours: 72,
  defaultWorkOrderTypeId: null,
  defaultWorkItemStatusId: null,
  dispatchBoardType: 'STATUS_BASED',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

const seededWorkflow: WorkflowSummary = {
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
  transitionCount: 18,
  approvalGateCount: 0,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

const customWorkflow: WorkflowSummary = {
  ...seededWorkflow,
  id: 'wf-2',
  workOrderTypeId: 'type-2',
  workOrderType: {
    id: 'type-2',
    name: 'Custom Type',
    code: 'CUSTOM',
    accentId: 'rose',
  },
  name: 'Custom workflow',
  isSeeded: false,
  transitionCount: 3,
  approvalGateCount: 1,
};

function mockGetEndpoints({
  workflows = [seededWorkflow],
  config = baseConfig,
}: {
  workflows?: WorkflowSummary[];
  config?: WorkflowConfig;
} = {}) {
  vi.mocked(apiClient.get).mockImplementation((url) => {
    if (url === '/work-orders/config/workflows') {
      return Promise.resolve({ data: workflows });
    }
    if (url === '/work-orders/config/workflow') {
      return Promise.resolve({ data: config });
    }
    return Promise.reject(new Error(`Unmocked: ${url}`));
  });
}

// Route stub so navigation lands somewhere with identifiable text.
const editorRoute: RouteObject[] = [
  {
    path: '/settings/work-orders/workflows',
    element: <WorkflowsPage />,
  },
  {
    path: '/settings/work-orders/workflows/:id',
    // eslint-disable-next-line i18next/no-literal-string
    element: <div>Editor Page</div>,
  },
];

describe('WorkflowsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the page title and subtitle', async () => {
    mockGetEndpoints({ workflows: [] });
    renderWithProviders(<WorkflowsPage />, {
      routes: editorRoute,
      initialPath: '/settings/work-orders/workflows',
    });
    expect(await screen.findByRole('heading', { name: /Workflows/i })).toBeInTheDocument();
  });

  it('renders the enforcement card with the current mode active', async () => {
    mockGetEndpoints({
      workflows: [],
      config: { ...baseConfig, enforcementMode: 'STRICT' },
    });
    renderWithProviders(<WorkflowsPage />, {
      routes: editorRoute,
      initialPath: '/settings/work-orders/workflows',
    });
    await waitFor(() => {
      // The Strict option should be marked aria-checked when STRICT is active.
      const strictOption = screen.getByRole('radio', { name: 'Strict' });
      expect(strictOption).toHaveAttribute('aria-checked', 'true');
    });
  });

  it('PATCHes the workflow config when the user flips Open → Strict', async () => {
    mockGetEndpoints();
    vi.mocked(apiClient.patch).mockResolvedValue({
      data: { ...baseConfig, enforcementMode: 'STRICT' },
    });
    const user = userEvent.setup();
    renderWithProviders(<WorkflowsPage />, {
      routes: editorRoute,
      initialPath: '/settings/work-orders/workflows',
    });
    await screen.findByText('Service Call');

    await user.click(screen.getByRole('radio', { name: 'Strict' }));

    await waitFor(() => {
      expect(apiClient.patch).toHaveBeenCalledWith(
        '/work-orders/config/workflow',
        { enforcementMode: 'STRICT' },
      );
    });
  });

  it('renders a row per workflow with the BUILT-IN pill for seeded ones', async () => {
    mockGetEndpoints({ workflows: [seededWorkflow, customWorkflow] });
    renderWithProviders(<WorkflowsPage />, {
      routes: editorRoute,
      initialPath: '/settings/work-orders/workflows',
    });
    await screen.findByText('Service Call');
    expect(screen.getByText('Custom Type')).toBeInTheDocument();
    // Built-in pill only on the seeded row.
    expect(screen.getAllByText('Built-in')).toHaveLength(1);
  });

  it('renders the approval-gates pill only when approvalGateCount > 0', async () => {
    mockGetEndpoints({ workflows: [seededWorkflow, customWorkflow] });
    renderWithProviders(<WorkflowsPage />, {
      routes: editorRoute,
      initialPath: '/settings/work-orders/workflows',
    });
    await screen.findByText('Service Call');
    expect(screen.getByText(/1 approval gate/i)).toBeInTheDocument();
  });

  it('clicking a row navigates to the editor page', async () => {
    mockGetEndpoints();
    const user = userEvent.setup();
    renderWithProviders(<WorkflowsPage />, {
      routes: editorRoute,
      initialPath: '/settings/work-orders/workflows',
    });
    await user.click(await screen.findByText('Service Call'));
    expect(await screen.findByText('Editor Page')).toBeInTheDocument();
  });

  it('renders the empty state when there are no workflows', async () => {
    mockGetEndpoints({ workflows: [] });
    renderWithProviders(<WorkflowsPage />, {
      routes: editorRoute,
      initialPath: '/settings/work-orders/workflows',
    });
    expect(await screen.findByText(/No workflows yet/i)).toBeInTheDocument();
  });

  it('renders an error state when the workflow list fetch fails', async () => {
    vi.mocked(apiClient.get).mockImplementation((url) => {
      if (url === '/work-orders/config/workflows') {
        return Promise.reject(new Error('boom'));
      }
      if (url === '/work-orders/config/workflow') {
        return Promise.resolve({ data: baseConfig });
      }
      return Promise.reject(new Error(`Unmocked: ${url}`));
    });
    renderWithProviders(<WorkflowsPage />, {
      routes: editorRoute,
      initialPath: '/settings/work-orders/workflows',
    });
    expect(await screen.findByText(/Couldn't load workflows/i)).toBeInTheDocument();
  });

  it('Reset-to-default opens a confirm dialog and POSTs on confirm', async () => {
    mockGetEndpoints();
    vi.mocked(apiClient.post).mockResolvedValue({ data: seededWorkflow });
    const user = userEvent.setup();
    renderWithProviders(<WorkflowsPage />, {
      routes: editorRoute,
      initialPath: '/settings/work-orders/workflows',
    });
    await screen.findByText('Service Call');

    // Open the kebab menu on the seeded row.
    const kebab = screen.getByRole('button', { name: /More options/i });
    await user.click(kebab);

    const reset = await screen.findByRole('menuitem', { name: /Reset to default/i });
    await user.click(reset);

    // Confirm dialog appears with the WO type name.
    await screen.findByText(/Reset Service Call workflow to default/i);
    const confirm = screen.getByRole('button', { name: /^Reset to default$/i });
    await user.click(confirm);

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        '/work-orders/config/workflows/wf-1/reset-to-default',
      );
    });
  });
});
