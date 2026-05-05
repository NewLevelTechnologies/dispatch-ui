import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import WorkItemsTable from './WorkItemsTable';
import type { WorkItemEquipmentSummary, WorkItemResponse } from '../api';

vi.mock('../api/client');

const wi = (
  id: string,
  description: string,
  overrides: Partial<WorkItemResponse> = {}
): WorkItemResponse => ({
  id,
  statusId: null,
  statusCategory: 'NOT_STARTED',
  description,
  equipmentId: null,
  equipment: null,
  createdAt: '2026-04-21T13:40:00Z',
  updatedAt: '2026-04-22T10:30:00Z',
  ...overrides,
});

const equip = (overrides: Partial<WorkItemEquipmentSummary> = {}): WorkItemEquipmentSummary => ({
  id: 'eq-1',
  name: 'Upstairs Furnace',
  equipmentTypeName: 'HVAC',
  equipmentCategoryName: 'Furnace',
  make: 'Carrier',
  model: '58TN0A080-V17',
  serialNumber: 'CHB1234567',
  locationOnSite: 'Basement',
  profileImageUrl: null,
  ...overrides,
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

  describe('row expansion', () => {
    it('renders a collapsed row with an expand toggle', () => {
      renderWithProviders(
        <WorkItemsTable
          workOrderId="wo-1"
          workItems={[wi('wi-1', 'Replace filter', { equipment: equip() })]}
          statuses={[]}
          workflows={[]}
          enforceWorkflow={false}
        />
      );
      const toggle = screen.getByRole('button', { name: /show details/i });
      expect(toggle).toHaveAttribute('aria-expanded', 'false');
      // Equipment detail content should not be in the document yet.
      expect(screen.queryByText('Carrier 58TN0A080-V17')).not.toBeInTheDocument();
    });

    it('expands the row to reveal equipment details when the toggle is clicked', async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <WorkItemsTable
          workOrderId="wo-1"
          workItems={[wi('wi-1', 'Replace filter', { equipment: equip() })]}
          statuses={[]}
          workflows={[]}
          enforceWorkflow={false}
        />
      );

      await user.click(screen.getByRole('button', { name: /show details/i }));

      // Toggle now reads as collapse, aria-expanded flipped.
      const toggle = screen.getByRole('button', { name: /hide details/i });
      expect(toggle).toHaveAttribute('aria-expanded', 'true');

      // Equipment fields show.
      expect(screen.getByText('Carrier 58TN0A080-V17')).toBeInTheDocument();
      expect(screen.getByText('CHB1234567')).toBeInTheDocument();
      expect(screen.getByText('Basement')).toBeInTheDocument();
      expect(screen.getByText(/HVAC · Furnace/)).toBeInTheDocument();
    });

    it('collapses the row when the toggle is clicked again', async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <WorkItemsTable
          workOrderId="wo-1"
          workItems={[wi('wi-1', 'Replace filter', { equipment: equip() })]}
          statuses={[]}
          workflows={[]}
          enforceWorkflow={false}
        />
      );

      await user.click(screen.getByRole('button', { name: /show details/i }));
      expect(screen.getByText('CHB1234567')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /hide details/i }));
      expect(screen.queryByText('CHB1234567')).not.toBeInTheDocument();
    });

    it('allows multiple rows to be expanded simultaneously', async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <WorkItemsTable
          workOrderId="wo-1"
          workItems={[
            wi('wi-1', 'Replace filter', {
              equipment: equip({ id: 'eq-1', name: 'Upstairs Furnace', serialNumber: 'SN-A' }),
            }),
            wi('wi-2', 'Inspect coils', {
              equipment: equip({ id: 'eq-2', name: 'Walk-in Cooler', serialNumber: 'SN-B' }),
            }),
          ]}
          statuses={[]}
          workflows={[]}
          enforceWorkflow={false}
        />
      );

      const toggles = screen.getAllByRole('button', { name: /show details/i });
      await user.click(toggles[0]);
      await user.click(toggles[1]);

      expect(screen.getByText('SN-A')).toBeInTheDocument();
      expect(screen.getByText('SN-B')).toBeInTheDocument();
    });

    it('renders the equipment name as a link to its detail page when expanded', async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <WorkItemsTable
          workOrderId="wo-1"
          workItems={[wi('wi-1', 'Replace filter', { equipment: equip({ id: 'eq-42' }) })]}
          statuses={[]}
          workflows={[]}
          enforceWorkflow={false}
        />
      );

      await user.click(screen.getByRole('button', { name: /show details/i }));

      // Two links to /equipment/eq-42 on the row when expanded — the inline
      // hint in the description cell and the section header in the expansion.
      const links = screen.getAllByRole('link', { name: 'Upstairs Furnace' });
      expect(links.length).toBeGreaterThanOrEqual(1);
      expect(links[0]).toHaveAttribute('href', '/equipment/eq-42');
    });

    it('shows an empty state with an Add Equipment action when no equipment is linked', async () => {
      const onEdit = vi.fn();
      const user = userEvent.setup();
      renderWithProviders(
        <WorkItemsTable
          workOrderId="wo-1"
          workItems={[wi('wi-1', 'Inspect ductwork')]}
          statuses={[]}
          workflows={[]}
          enforceWorkflow={false}
          onEdit={onEdit}
          onDelete={vi.fn()}
        />
      );

      await user.click(screen.getByRole('button', { name: /show details/i }));

      expect(screen.getByText(/no equipment linked/i)).toBeInTheDocument();

      const addButton = screen.getByRole('button', { name: /add equipment/i });
      await user.click(addButton);
      expect(onEdit).toHaveBeenCalledTimes(1);
    });

    it('omits the Add Equipment action in readOnly mode', async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <WorkItemsTable
          workOrderId="wo-1"
          workItems={[wi('wi-1', 'Inspect ductwork')]}
          statuses={[]}
          workflows={[]}
          enforceWorkflow={false}
          readOnly
        />
      );

      await user.click(screen.getByRole('button', { name: /show details/i }));

      expect(screen.getByText(/no equipment linked/i)).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /add equipment/i })
      ).not.toBeInTheDocument();
    });
  });
});
