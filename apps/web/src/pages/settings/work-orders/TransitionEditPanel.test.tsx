import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../../../test/utils';
import TransitionEditPanel from './TransitionEditPanel';
import { apiClient } from '../../../api/setup';
import type { WorkflowTransition, WorkItemStatus } from '../../../api/setup';

vi.mock('@dispatch/api/src/client');

const status = (id: string, name: string): WorkItemStatus => ({
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

const from = status('s-new', 'New');
const to = status('s-progress', 'In Progress');

const existingTransition: WorkflowTransition = {
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
};

const baseProps = {
  open: true,
  workflowId: 'wf-1',
  from,
  to,
  existing: null as WorkflowTransition | null,
  tenantDefaultExpiryHours: 72,
  onClose: vi.fn(),
  canEdit: true,
};

// Stub the capabilities catalogue so the approver picker renders a row when
// Require Approval is on. Real UI fetches /users/capabilities/grouped.
const mockCapabilitiesResponse = {
  data: {
    groups: [
      {
        featureArea: 'WORKFLOWS',
        displayName: 'Workflows',
        capabilities: [
          {
            name: 'APPROVE_WORK_ITEM_TRANSITIONS',
            displayName: 'Approve work item transitions',
            description: 'Can approve held transitions.',
          },
        ],
      },
    ],
  },
};

describe('TransitionEditPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiClient.get).mockResolvedValue(mockCapabilitiesResponse);
    vi.mocked(apiClient.post).mockResolvedValue({ data: existingTransition });
    vi.mocked(apiClient.patch).mockResolvedValue({ data: existingTransition });
    vi.mocked(apiClient.delete).mockResolvedValue({ data: {} });
  });

  it('renders empty form for a brand new transition (no existing row)', () => {
    const props = { ...baseProps, onClose: vi.fn() };
    renderWithProviders(<TransitionEditPanel {...props} />);
    // The Allow switch is off by default — the approval sub-form is hidden.
    expect(screen.queryByText(/Require approval/i)).not.toBeInTheDocument();
    // Delete button only shows when editing an existing transition.
    expect(screen.queryByRole('button', { name: /Delete transition/i })).not.toBeInTheDocument();
  });

  it('pre-fills the form when editing an existing transition', () => {
    const tx: WorkflowTransition = {
      ...existingTransition,
      requiresApproval: true,
      approverCapabilities: ['APPROVE_WORK_ITEM_TRANSITIONS'],
      approvalExpiryHours: 48,
    };
    renderWithProviders(
      <TransitionEditPanel {...baseProps} existing={tx} onClose={vi.fn()} />,
    );
    expect(screen.getByText(/Require approval/i)).toBeInTheDocument();
    // Expiry input pre-fills to "48".
    expect(screen.getByDisplayValue('48')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Delete transition/i })).toBeInTheDocument();
  });

  it('cancel button calls onClose without firing any mutation', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<TransitionEditPanel {...baseProps} onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: /^Cancel$/i }));
    expect(onClose).toHaveBeenCalled();
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it('creates a transition when Allow is on and there is no existing row', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<TransitionEditPanel {...baseProps} onClose={onClose} />);

    // Flip Allow on — the Switch surfaces as a Headless switch button. Click it.
    const allowSwitch = screen.getAllByRole('switch')[0];
    await user.click(allowSwitch);

    await user.click(screen.getByRole('button', { name: /^Save$/i }));

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        '/work-orders/config/workflows/wf-1/transitions',
        expect.objectContaining({
          fromStatusId: 's-new',
          toStatusId: 's-progress',
          requiresApproval: false,
          approverCapabilities: [],
        }),
      );
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('updates an existing transition (PATCH) when saving over a pre-filled form', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <TransitionEditPanel
        {...baseProps}
        existing={existingTransition}
        onClose={onClose}
      />,
    );
    await user.click(screen.getByRole('button', { name: /^Save$/i }));
    await waitFor(() => {
      expect(apiClient.patch).toHaveBeenCalledWith(
        '/work-orders/config/workflows/wf-1/transitions/tx-1',
        expect.objectContaining({ fromStatusId: 's-new', toStatusId: 's-progress' }),
      );
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('deletes an existing transition when Allow is toggled off + Save', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <TransitionEditPanel
        {...baseProps}
        existing={existingTransition}
        onClose={onClose}
      />,
    );
    // Toggle Allow off
    const allowSwitch = screen.getAllByRole('switch')[0];
    await user.click(allowSwitch);
    await user.click(screen.getByRole('button', { name: /^Save$/i }));

    await waitFor(() => {
      expect(apiClient.delete).toHaveBeenCalledWith(
        '/work-orders/config/workflows/wf-1/transitions/tx-1',
      );
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('disables Save when approval is required but no capabilities are selected', async () => {
    // Stub capabilities to return empty list so the auto-select doesn't kick in
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { groups: [{ featureArea: 'X', displayName: 'X', capabilities: [] }] },
    });
    const user = userEvent.setup();
    renderWithProviders(<TransitionEditPanel {...baseProps} />);
    const allowSwitch = screen.getAllByRole('switch')[0];
    await user.click(allowSwitch);
    // Now the Require Approval switch is in the DOM. Click it (index 1).
    const approvalSwitch = screen.getAllByRole('switch')[1];
    await user.click(approvalSwitch);

    const save = screen.getByRole('button', { name: /^Save$/i });
    expect(save).toBeDisabled();
  });

  it('flags an out-of-range expiry value with an error message', async () => {
    const tx: WorkflowTransition = {
      ...existingTransition,
      requiresApproval: true,
      approverCapabilities: ['APPROVE_WORK_ITEM_TRANSITIONS'],
      approvalExpiryHours: 48,
    };
    const user = userEvent.setup();
    renderWithProviders(<TransitionEditPanel {...baseProps} existing={tx} />);
    const expiryInput = screen.getByDisplayValue('48');
    await user.clear(expiryInput);
    await user.type(expiryInput, '900');
    expect(screen.getByText(/Enter a value between 1 and 720/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Save$/i })).toBeDisabled();
  });
});
