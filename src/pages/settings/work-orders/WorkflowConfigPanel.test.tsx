import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../../../test/utils';
import WorkflowConfigPanel from './WorkflowConfigPanel';
import apiClient from '../../../api/client';
import type { WorkflowConfig } from '../../../api';

vi.mock('../../../api/client');

const mockTypes = [
  { id: 'type-1', tenantId: 't', name: 'Service Call', code: 'SERVICE_CALL', isActive: true, sortOrder: 0, createdAt: '', updatedAt: '' },
  { id: 'type-2', tenantId: 't', name: 'Installation', code: 'INSTALLATION', isActive: true, sortOrder: 1, createdAt: '', updatedAt: '' },
];

const mockStatuses = [
  { id: 'st-1', tenantId: 't', name: 'New', code: 'NEW', statusCategory: 'NOT_STARTED' as const, isTerminal: false, isActive: true, sortOrder: 0, createdAt: '', updatedAt: '' },
  { id: 'st-2', tenantId: 't', name: 'In Progress', code: 'IN_PROGRESS', statusCategory: 'IN_PROGRESS' as const, isTerminal: false, isActive: true, sortOrder: 1, createdAt: '', updatedAt: '' },
];

const mockConfig: WorkflowConfig = {
  id: 'cfg-1',
  tenantId: 't',
  enforceStatusWorkflow: false,
  defaultWorkOrderTypeId: 'type-1',
  defaultWorkItemStatusId: 'st-1',
  dispatchBoardType: 'STATUS_BASED',
  createdAt: '',
  updatedAt: '',
};

function mockApis(config: WorkflowConfig = mockConfig) {
  vi.mocked(apiClient.get).mockImplementation((url: string) => {
    if (url.endsWith('/workflow')) return Promise.resolve({ data: config });
    if (url.endsWith('/types')) return Promise.resolve({ data: mockTypes });
    if (url.endsWith('/item-statuses')) return Promise.resolve({ data: mockStatuses });
    return Promise.reject(new Error(`unexpected GET ${url}`));
  });
}

describe('WorkflowConfigPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders config in view mode with looked-up names', async () => {
    mockApis();
    renderWithProviders(<WorkflowConfigPanel />);

    await waitFor(() => {
      expect(screen.getByText('Service Call')).toBeInTheDocument();
    });
    expect(screen.getByText('New')).toBeInTheDocument();
    expect(screen.getByText('Status-based')).toBeInTheDocument();
    expect(screen.getByText('Disabled')).toBeInTheDocument();
  });

  it('shows "None" when no defaults are set', async () => {
    mockApis({ ...mockConfig, defaultWorkOrderTypeId: null, defaultWorkItemStatusId: null });
    renderWithProviders(<WorkflowConfigPanel />);

    await waitFor(() => {
      expect(screen.getAllByText('None').length).toBeGreaterThan(0);
    });
  });

  it('switches to edit mode and shows form fields', async () => {
    const user = userEvent.setup();
    mockApis();
    renderWithProviders(<WorkflowConfigPanel />);

    await waitFor(() => expect(screen.getByText('Service Call')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /^edit$/i }));

    expect(screen.getByLabelText(/default work order type/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/default item status/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/dispatch board type/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/enforce status workflow/i)).toBeInTheDocument();
  });

  it('submits the update with modified fields', async () => {
    const user = userEvent.setup();
    mockApis();
    vi.mocked(apiClient.patch).mockResolvedValue({ data: mockConfig });

    renderWithProviders(<WorkflowConfigPanel />);

    await waitFor(() => expect(screen.getByText('Service Call')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /^edit$/i }));

    await user.selectOptions(screen.getByLabelText(/default work order type/i), 'type-2');
    await user.click(screen.getByLabelText(/enforce status workflow/i));
    await user.click(screen.getByRole('button', { name: /^update$/i }));

    await waitFor(() => {
      expect(apiClient.patch).toHaveBeenCalledWith(
        '/work-orders/config/workflow',
        expect.objectContaining({
          defaultWorkOrderTypeId: 'type-2',
          enforceStatusWorkflow: true,
        })
      );
    });
  });

  it('cancel button reverts to view mode without submitting', async () => {
    const user = userEvent.setup();
    mockApis();
    renderWithProviders(<WorkflowConfigPanel />);

    await waitFor(() => expect(screen.getByText('Service Call')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /^edit$/i }));
    await user.click(screen.getByRole('button', { name: /^cancel$/i }));

    // Edit button is back, meaning we're in view mode
    expect(screen.getByRole('button', { name: /^edit$/i })).toBeInTheDocument();
    expect(apiClient.patch).not.toHaveBeenCalled();
  });

  it('surfaces API error message when load fails', async () => {
    const error = Object.assign(new Error('fail'), {
      response: { data: { message: 'Workflow config not initialized' } },
    });
    vi.mocked(apiClient.get).mockRejectedValue(error);

    renderWithProviders(<WorkflowConfigPanel />);

    await waitFor(() => {
      expect(screen.getByText('Workflow config not initialized')).toBeInTheDocument();
    });
  });
});
