import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import WorkItemsTable from './WorkItemsTable';
import type { WorkItemEquipmentSummary, WorkItemResponse } from '../api';

const mockEquipmentUpdate = vi.fn();

vi.mock('../api/equipmentApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/equipmentApi')>();
  return {
    ...actual,
    equipmentApi: {
      ...actual.equipmentApi,
      update: (...args: unknown[]) => mockEquipmentUpdate(...args),
    },
  };
});

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
    mockEquipmentUpdate.mockResolvedValue({ id: 'eq-1' });
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

  it('does not render a "Last updated" column header in the table', () => {
    renderWithProviders(
      <WorkItemsTable
        workOrderId="wo-1"
        workItems={[wi('wi-1', 'Replace filter', { equipment: equip() })]}
        statuses={[]}
        workflows={[]}
        enforceWorkflow={false}
      />
    );
    // The table now has Status / Description / (actions) headers only —
    // last-updated moved into the expansion footer.
    expect(
      screen.queryByRole('columnheader', { name: /last updated/i })
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
      // Footer text only renders when expanded.
      expect(screen.queryByText(/^updated /i)).not.toBeInTheDocument();
    });

    it('expands the row to reveal equipment details and the updated footer', async () => {
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

      // Toggle flipped state.
      const toggle = screen.getByRole('button', { name: /hide details/i });
      expect(toggle).toHaveAttribute('aria-expanded', 'true');

      // Type/Category subline.
      expect(screen.getByText(/HVAC · Furnace/)).toBeInTheDocument();

      // Field grid renders each value separately (not "Carrier 58TN..." combined).
      expect(screen.getByText('Carrier')).toBeInTheDocument();
      expect(screen.getByText('58TN0A080-V17')).toBeInTheDocument();
      expect(screen.getByText('CHB1234567')).toBeInTheDocument();
      expect(screen.getByText('Basement')).toBeInTheDocument();

      // Work-item updated footer renders below the equipment block.
      expect(screen.getByText(/^updated /i)).toBeInTheDocument();
    });

    it('renders the "Edit all" button only when onEditEquipment is provided', async () => {
      const onEditEquipment = vi.fn();
      const user = userEvent.setup();
      renderWithProviders(
        <WorkItemsTable
          workOrderId="wo-1"
          workItems={[wi('wi-1', 'Replace filter', { equipment: equip({ id: 'eq-99' }) })]}
          statuses={[]}
          workflows={[]}
          enforceWorkflow={false}
          onEditEquipment={onEditEquipment}
        />
      );

      await user.click(screen.getByRole('button', { name: /show details/i }));

      const editAll = await screen.findByRole('button', { name: /edit all/i });
      await user.click(editAll);
      expect(onEditEquipment).toHaveBeenCalledWith('eq-99');
    });

    it('renders an "Open page" link to the equipment detail page when expanded', async () => {
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

      const open = await screen.findByRole('link', { name: /open page/i });
      expect(open).toHaveAttribute('href', '/equipment/eq-42');
    });

    it('omits "Edit all" in readOnly mode', async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <WorkItemsTable
          workOrderId="wo-1"
          workItems={[wi('wi-1', 'Replace filter', { equipment: equip() })]}
          statuses={[]}
          workflows={[]}
          enforceWorkflow={false}
          readOnly
          onEditEquipment={vi.fn()}
        />
      );

      await user.click(screen.getByRole('button', { name: /show details/i }));
      expect(
        screen.queryByRole('button', { name: /edit all/i })
      ).not.toBeInTheDocument();
    });

    it('inline-edits the make field via equipmentApi.update', async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <WorkItemsTable
          workOrderId="wo-1"
          workItems={[wi('wi-1', 'Replace filter', { equipment: equip({ id: 'eq-7' }) })]}
          statuses={[]}
          workflows={[]}
          enforceWorkflow={false}
        />
      );

      await user.click(screen.getByRole('button', { name: /show details/i }));

      // Click the Make field's value (EditableField in display mode renders
      // a button) — there are two grid cells with "Make" label, so target the
      // value via aria-label.
      await user.click(screen.getByRole('button', { name: /^make$/i }));
      const input = await screen.findByRole('textbox', { name: /^make$/i });
      await user.clear(input);
      await user.type(input, 'Trane');
      input.blur();

      await waitFor(() => {
        expect(mockEquipmentUpdate).toHaveBeenCalledWith('eq-7', { make: 'Trane' });
      });
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

    it('renders a colored status pill in the identity row when status is projected', async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <WorkItemsTable
          workOrderId="wo-1"
          workItems={[wi('wi-1', 'Replace filter', { equipment: equip({ status: 'ACTIVE' }) })]}
          statuses={[]}
          workflows={[]}
          enforceWorkflow={false}
        />
      );
      await user.click(screen.getByRole('button', { name: /show details/i }));
      // The pill appears as part of the identity row in the expansion. The
      // matching label in the EditableField's renderDisplay shows the badge
      // text "Active" alongside the equipment name.
      expect(screen.getAllByText(/^active$/i).length).toBeGreaterThanOrEqual(1);
    });

    it('confirms before transitioning equipment status from ACTIVE to RETIRED', async () => {
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
      const user = userEvent.setup();
      renderWithProviders(
        <WorkItemsTable
          workOrderId="wo-1"
          workItems={[wi('wi-1', 'Replace filter', { equipment: equip({ id: 'eq-9', status: 'ACTIVE' }) })]}
          statuses={[]}
          workflows={[]}
          enforceWorkflow={false}
        />
      );
      await user.click(screen.getByRole('button', { name: /show details/i }));

      // Click the status pill (EditableField renders as a button containing the badge).
      await user.click(screen.getByRole('button', { name: /^status$/i }));
      const select = await screen.findByRole('combobox', { name: /^status$/i });
      await user.selectOptions(select, 'RETIRED');
      select.blur();

      await waitFor(() => expect(confirmSpy).toHaveBeenCalled());
      await waitFor(() => {
        expect(mockEquipmentUpdate).toHaveBeenCalledWith('eq-9', { status: 'RETIRED' });
      });
      confirmSpy.mockRestore();
    });

    it('aborts the RETIRED transition when the user cancels the confirm', async () => {
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
      const user = userEvent.setup();
      renderWithProviders(
        <WorkItemsTable
          workOrderId="wo-1"
          workItems={[wi('wi-1', 'Replace filter', { equipment: equip({ id: 'eq-9', status: 'ACTIVE' }) })]}
          statuses={[]}
          workflows={[]}
          enforceWorkflow={false}
        />
      );
      await user.click(screen.getByRole('button', { name: /show details/i }));

      await user.click(screen.getByRole('button', { name: /^status$/i }));
      const select = await screen.findByRole('combobox', { name: /^status$/i });
      await user.selectOptions(select, 'RETIRED');
      select.blur();

      await waitFor(() => expect(confirmSpy).toHaveBeenCalled());
      // Mutation NOT called when the user declines the confirm.
      expect(mockEquipmentUpdate).not.toHaveBeenCalled();
      confirmSpy.mockRestore();
    });

    it('renders the asset tag field in the inline grid', async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <WorkItemsTable
          workOrderId="wo-1"
          workItems={[wi('wi-1', 'Replace filter', { equipment: equip({ id: 'eq-7', assetTag: 'TAG-77' }) })]}
          statuses={[]}
          workflows={[]}
          enforceWorkflow={false}
        />
      );
      await user.click(screen.getByRole('button', { name: /show details/i }));
      expect(screen.getByText('TAG-77')).toBeInTheDocument();
    });

    it('renders sub-unit chips when descendants are present, with truncation indicator', async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <WorkItemsTable
          workOrderId="wo-1"
          workItems={[
            wi('wi-1', 'Replace filter', {
              equipment: equip({
                id: 'eq-1',
                descendants: [
                  { id: 'sub-1', name: 'Compressor' },
                  { id: 'sub-2', name: 'Coil' },
                ],
                descendantCount: 5,
              }),
            }),
          ]}
          statuses={[]}
          workflows={[]}
          enforceWorkflow={false}
        />
      );
      await user.click(screen.getByRole('button', { name: /show details/i }));

      const compressorLink = screen.getByRole('link', { name: /compressor/i });
      expect(compressorLink).toHaveAttribute('href', '/equipment/sub-1');
      expect(screen.getByRole('link', { name: /coil/i })).toBeInTheDocument();
      expect(screen.getByText(/\+3 more/i)).toBeInTheDocument();
    });

    it('hides the sub-units row when there are no descendants', async () => {
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
      // No "(N):" label appears because the SubUnitsRow short-circuits.
      expect(screen.queryByText(/\(\d+\):/)).not.toBeInTheDocument();
    });
  });
});
