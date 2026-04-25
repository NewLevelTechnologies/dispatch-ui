import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../../../test/utils';
import StatusWorkflowsPanel from './StatusWorkflowsPanel';
import apiClient from '../../../api/client';

vi.mock('../../../api/client');

const mockStatuses = [
  { id: 'st-1', tenantId: 't', name: 'New', code: 'NEW', statusCategory: 'NOT_STARTED' as const, isTerminal: false, isActive: true, sortOrder: 0, createdAt: '', updatedAt: '' },
  { id: 'st-2', tenantId: 't', name: 'In Progress', code: 'IN_PROGRESS', statusCategory: 'IN_PROGRESS' as const, isTerminal: false, isActive: true, sortOrder: 1, createdAt: '', updatedAt: '' },
  { id: 'st-3', tenantId: 't', name: 'Complete', code: 'COMPLETE', statusCategory: 'COMPLETED' as const, isTerminal: true, isActive: true, sortOrder: 2, createdAt: '', updatedAt: '' },
];

const mockRules = [
  { id: 'r-1', tenantId: 't', fromStatusId: 'st-1', toStatusId: 'st-2', isAllowed: true, requiresApproval: false, approvalRole: null, createdAt: '', updatedAt: '' },
  { id: 'r-2', tenantId: 't', fromStatusId: 'st-2', toStatusId: 'st-3', isAllowed: true, requiresApproval: true, approvalRole: 'SUPERVISOR', createdAt: '', updatedAt: '' },
];

function setupApi(rules = mockRules) {
  vi.mocked(apiClient.get).mockImplementation((url: string) => {
    if (url.endsWith('/status-workflows')) return Promise.resolve({ data: rules });
    if (url.endsWith('/item-statuses')) return Promise.resolve({ data: mockStatuses });
    return Promise.reject(new Error(`unexpected GET ${url}`));
  });
}

describe('StatusWorkflowsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders rules with from/to status names', async () => {
    setupApi();
    renderWithProviders(<StatusWorkflowsPanel />);

    await waitFor(() => {
      expect(screen.getByText('New')).toBeInTheDocument();
    });
    // "In Progress" appears twice (from of rule 1, to of rule 2)
    expect(screen.getAllByText('In Progress').length).toBe(2);
    expect(screen.getByText('Complete')).toBeInTheDocument();
  });

  it('renders approval badge when requiresApproval is set', async () => {
    setupApi();
    renderWithProviders(<StatusWorkflowsPanel />);

    await waitFor(() => {
      expect(screen.getByText(/requires supervisor/i)).toBeInTheDocument();
    });
  });

  it('renders empty state when there are no rules', async () => {
    setupApi([]);
    renderWithProviders(<StatusWorkflowsPanel />);

    await waitFor(() => {
      expect(screen.getByText(/no transition rules/i)).toBeInTheDocument();
    });
  });

  it('opens add transition dialog and submits new rule', async () => {
    const user = userEvent.setup();
    setupApi();
    vi.mocked(apiClient.post).mockResolvedValue({ data: mockRules[0] });

    renderWithProviders(<StatusWorkflowsPanel />);

    await waitFor(() => expect(screen.getByText('New')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /add transition/i }));

    const dialog = await screen.findByRole('dialog');
    await user.selectOptions(within(dialog).getByLabelText(/from/i), 'st-1');
    await user.selectOptions(within(dialog).getByLabelText(/to/i), 'st-3');
    await user.click(within(dialog).getByRole('button', { name: /^create$/i }));

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        '/work-orders/config/status-workflows',
        expect.objectContaining({
          fromStatusId: 'st-1',
          toStatusId: 'st-3',
          isAllowed: true,
          requiresApproval: false,
        })
      );
    });
  });

  it('deletes a rule after confirmation', async () => {
    const user = userEvent.setup();
    setupApi();
    vi.mocked(apiClient.delete).mockResolvedValue({ data: undefined });
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    renderWithProviders(<StatusWorkflowsPanel />);

    await waitFor(() => expect(screen.getByText('New')).toBeInTheDocument());

    // Each rule has a delete (trash) button. Click the first one.
    const deleteButtons = screen.getAllByRole('button', { name: /delete/i });
    await user.click(deleteButtons[0]);

    expect(confirmSpy).toHaveBeenCalled();
    await waitFor(() => {
      expect(apiClient.delete).toHaveBeenCalledWith('/work-orders/config/status-workflows/r-1');
    });

    confirmSpy.mockRestore();
  });

  it('disables Add Transition when fewer than 2 statuses exist', async () => {
    vi.mocked(apiClient.get).mockImplementation((url: string) => {
      if (url.endsWith('/status-workflows')) return Promise.resolve({ data: [] });
      if (url.endsWith('/item-statuses')) return Promise.resolve({ data: [mockStatuses[0]] });
      return Promise.reject(new Error('unexpected'));
    });

    renderWithProviders(<StatusWorkflowsPanel />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /add transition/i })).toBeDisabled();
    });
  });
});
