import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../../../test/utils';
import { WorkflowMatrix } from './WorkflowMatrix';
import type {
  Workflow,
  WorkflowTransition,
  WorkItemStatus,
} from '../../../api/setup';

const status = (id: string, name: string, accentId: string): WorkItemStatus => ({
  id,
  tenantId: 't',
  name,
  code: name.toUpperCase().replace(/\s+/g, '_'),
  statusCategory: 'IN_PROGRESS',
  isTerminal: false,
  isSeeded: true,
  accentId,
  isActive: true,
  sortOrder: 0,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
});

const transition = (
  from: string,
  to: string,
  requiresApproval = false,
): WorkflowTransition => ({
  id: `${from}-${to}`,
  tenantId: 't',
  workflowId: 'wf-1',
  fromStatusId: from,
  toStatusId: to,
  requiresApproval,
  approverCapabilities: requiresApproval ? ['APPROVE_WORK_ITEM_TRANSITIONS'] : [],
  approvalExpiryHours: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
});

const statuses: WorkItemStatus[] = [
  status('s-new', 'New', 'blue'),
  status('s-progress', 'In Progress', 'violet'),
  status('s-done', 'Complete', 'green'),
];

const workflow = (transitions: WorkflowTransition[]): Workflow => ({
  id: 'wf-1',
  tenantId: 't',
  workOrderTypeId: 'type-1',
  workOrderType: { id: 'type-1', name: 'Service Call', code: 'SERVICE', accentId: 'blue' },
  name: 'Service Call workflow',
  initialStatusId: 's-new',
  isSeeded: true,
  transitionCount: transitions.length,
  approvalGateCount: transitions.filter((t) => t.requiresApproval).length,
  transitions,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
});

describe('WorkflowMatrix', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders a row header and column header for every status', () => {
    renderWithProviders(
      <WorkflowMatrix
        workflow={workflow([])}
        statuses={statuses}
        onCellClick={vi.fn()}
      />,
    );
    // Each status name appears twice — once as a row header, once as a
    // (vertical) column header. Use getAllByText to handle both occurrences.
    expect(screen.getAllByText('New')).toHaveLength(2);
    expect(screen.getAllByText('In Progress')).toHaveLength(2);
    expect(screen.getAllByText('Complete')).toHaveLength(2);
  });

  it('marks the diagonal as non-interactive (no buttons for self-transitions)', () => {
    renderWithProviders(
      <WorkflowMatrix
        workflow={workflow([])}
        statuses={statuses}
        onCellClick={vi.fn()}
      />,
    );
    // 3x3 grid minus 3 diagonal cells = 6 interactive cells.
    const cellButtons = screen
      .getAllByRole('button')
      .filter((b) => /^New|^In Progress|^Complete/.test(b.getAttribute('aria-label') ?? ''));
    expect(cellButtons).toHaveLength(6);
  });

  it('fires onCellClick with the from/to statuses and any existing transition', async () => {
    const handle = vi.fn();
    const tx = transition('s-new', 's-progress');
    const user = userEvent.setup();
    renderWithProviders(
      <WorkflowMatrix
        workflow={workflow([tx])}
        statuses={statuses}
        onCellClick={handle}
      />,
    );
    // Find the cell button whose aria-label starts with the from name.
    const cell = screen
      .getAllByRole('button')
      .find((b) => /^New to In Progress/.test(b.getAttribute('aria-label') ?? ''));
    expect(cell).toBeDefined();
    await user.click(cell!);
    expect(handle).toHaveBeenCalledWith(
      expect.objectContaining({ id: 's-new' }),
      expect.objectContaining({ id: 's-progress' }),
      expect.objectContaining({ id: 's-new-s-progress' }),
    );
  });

  it('fires onCellClick with null existing when no transition is defined', async () => {
    const handle = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <WorkflowMatrix
        workflow={workflow([])}
        statuses={statuses}
        onCellClick={handle}
      />,
    );
    const cell = screen
      .getAllByRole('button')
      .find((b) => /^New to In Progress/.test(b.getAttribute('aria-label') ?? ''));
    await user.click(cell!);
    expect(handle).toHaveBeenCalledWith(
      expect.objectContaining({ id: 's-new' }),
      expect.objectContaining({ id: 's-progress' }),
      null,
    );
  });

  it('encodes the cell aria-label with the transition state', () => {
    renderWithProviders(
      <WorkflowMatrix
        workflow={workflow([
          transition('s-new', 's-progress'),
          transition('s-progress', 's-done', true),
        ])}
        statuses={statuses}
        onCellClick={vi.fn()}
      />,
    );
    expect(
      screen.getByRole('button', { name: /New to In Progress: allowed$/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: /In Progress to Complete: allowed \(requires approval\)/,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Complete to New: not allowed/ }),
    ).toBeInTheDocument();
  });

  it('summarizes counts of transitions and approval gates in the legend', () => {
    renderWithProviders(
      <WorkflowMatrix
        workflow={workflow([
          transition('s-new', 's-progress'),
          transition('s-progress', 's-done', true),
          transition('s-progress', 's-new', true),
        ])}
        statuses={statuses}
        onCellClick={vi.fn()}
      />,
    );
    // The interpolated summary key reads "{{count}} transitions · {{approvals}} approval gates"
    expect(
      screen.getByText(/3 transitions.*2 approval gates/),
    ).toBeInTheDocument();
  });

  it('warns in dev when status count grows past the v1 sweet spot', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const lots = Array.from({ length: 21 }, (_, i) =>
      status(`s-${i}`, `Status ${i}`, 'blue'),
    );
    renderWithProviders(
      <WorkflowMatrix
        workflow={workflow([])}
        statuses={lots}
        onCellClick={vi.fn()}
      />,
    );
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('21 statuses'));
    warn.mockRestore();
  });
});
