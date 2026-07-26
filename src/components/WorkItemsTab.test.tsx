import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import WorkItemsTab from './WorkItemsTab';
import apiClient from '../api/client';
import type { WorkItemEquipmentSummary, WorkItemResponse } from '../api';

const mockImagesList = vi.fn();

// WorkItemEquipmentBlock lazy-fetches the equipment image list for the media
// row; stub it so attached cards render. (Prior-visit count comes from the
// work-orders list via the mocked api client below.)
vi.mock('../api/equipmentApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/equipmentApi')>();
  return {
    ...actual,
    equipmentImagesApi: { ...actual.equipmentImagesApi, list: (...a: unknown[]) => mockImagesList(...a) },
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
  make: 'Carrier',
  model: '58TN0A080',
  serialNumber: 'CHB1234567',
  profileImageUrl: null,
  ...overrides,
});

const baseProps = {
  workOrderId: 'wo-1',
  statuses: [],
  transitions: [],
  enforceWorkflow: false,
};

describe('WorkItemsTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockImagesList.mockResolvedValue([]);
    // Prior-visit count query (work-orders list) resolves empty by default.
    vi.mocked(apiClient.get).mockResolvedValue({ data: { content: [], totalElements: 0 } } as never);
  });

  it('shows the empty state when there are no work items', () => {
    renderWithProviders(<WorkItemsTab {...baseProps} workItems={[]} />);
    expect(screen.getByText(/no work items/i)).toBeInTheDocument();
  });

  it('renders one card per work item with its complaint', () => {
    renderWithProviders(
      <WorkItemsTab {...baseProps} workItems={[wi('wi-1', 'No cooling'), wi('wi-2', 'Loud rattle')]} />
    );
    expect(screen.getByText('No cooling')).toBeInTheDocument();
    expect(screen.getByText('Loud rattle')).toBeInTheDocument();
  });

  it('shows the diagnosis when present and a quiet add-affordance when empty', () => {
    renderWithProviders(
      <WorkItemsTab
        {...baseProps}
        workItems={[
          wi('wi-1', 'No cooling', { diagnosis: 'Run capacitor failed' }),
          wi('wi-2', 'Loud rattle'),
        ]}
        onSaveDiagnosis={vi.fn()}
      />
    );
    expect(screen.getByText('Run capacitor failed')).toBeInTheDocument();
    // Empty diagnosis is trimmed to a single "+ Add diagnosis" invite — no tinted
    // panel, no "Not yet diagnosed…" placeholder (it just restated the status).
    expect(screen.queryByText(/not yet diagnosed/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add diagnosis/i })).toBeInTheDocument();
  });

  it('renders the parts empty-state action line linking to the PO form', () => {
    renderWithProviders(<WorkItemsTab {...baseProps} workItems={[wi('wi-1', 'No cooling')]} />);
    // Card cleanup: the label + explanatory sentence are gone; only the quiet
    // action line remains, pointing at the two PO-form entry points.
    expect(screen.queryByText(/no parts identified yet/i)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /add parts/i })).toHaveAttribute(
      'href',
      '/purchase-orders/new?type=order&workOrderId=wo-1'
    );
    expect(screen.getByRole('link', { name: /record field purchase/i })).toHaveAttribute(
      'href',
      '/purchase-orders/new?type=field&workOrderId=wo-1'
    );
  });

  it('shows the open / total tally', () => {
    renderWithProviders(
      <WorkItemsTab
        {...baseProps}
        workItems={[
          wi('wi-1', 'Still open', { statusCategory: 'IN_PROGRESS' }),
          wi('wi-2', 'Finished', { statusCategory: 'COMPLETED' }),
        ]}
      />
    );
    expect(screen.getByText('1 open · 2 total')).toBeInTheDocument();
  });

  it('collapses resolved items by default and expands on click', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <WorkItemsTab
        {...baseProps}
        workItems={[wi('wi-1', 'Old repair', { statusCategory: 'COMPLETED', diagnosis: 'Replaced capacitor' })]}
      />
    );
    // Collapsed by default: the header complaint shows, the body (diagnosis) doesn't.
    expect(screen.getByText('Old repair')).toBeInTheDocument();
    expect(screen.queryByText('Replaced capacitor')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /show details/i }));
    expect(screen.getByText('Replaced capacitor')).toBeInTheDocument();
  });

  it('reorders the cards when the sort changes', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <WorkItemsTab
        {...baseProps}
        workItems={[
          wi('wi-1', 'First complaint', { sequence: 1, statusCategory: 'IN_PROGRESS' }),
          wi('wi-2', 'Second complaint', { sequence: 2, statusCategory: 'BLOCKED' }),
        ]}
      />
    );
    const order = () => screen.getAllByText(/ complaint$/).map((el) => el.textContent);
    // Default "Needs attention": blocked (wi-2) outranks in-progress (wi-1).
    expect(order()).toEqual(['Second complaint', 'First complaint']);
    // "Reported order": by sequence ascending.
    await user.selectOptions(screen.getByRole('combobox'), 'reported');
    expect(order()).toEqual(['First complaint', 'Second complaint']);
  });

  it('shows the attached equipment record', async () => {
    renderWithProviders(
      <WorkItemsTab {...baseProps} workItems={[wi('wi-1', 'No cooling', { equipmentId: 'eq-1', equipment: equip() })]} />
    );
    await waitFor(() => {
      expect(screen.getByText('Carrier 58TN0A080')).toBeInTheDocument();
    });
  });

  it('opens the inline composer and creates a work item', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.post).mockResolvedValue({ data: { id: 'wi-new', description: 'Thermostat dead' } });
    renderWithProviders(<WorkItemsTab {...baseProps} serviceLocationId="loc-1" workItems={[]} />);

    await user.click(screen.getByRole('button', { name: /add work item/i }));
    await user.type(screen.getByLabelText(/complaint/i), 'Thermostat dead');
    await user.click(screen.getByRole('button', { name: /add work item/i }));

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        expect.stringMatching(/\/work-orders\/wo-1\/work-items$/),
        expect.objectContaining({ description: 'Thermostat dead' })
      );
    });
  });

  it('surfaces an error when the composer create fails', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.post).mockRejectedValue(new Error('boom'));
    renderWithProviders(<WorkItemsTab {...baseProps} serviceLocationId="loc-1" workItems={[]} />);

    await user.click(screen.getByRole('button', { name: /add work item/i }));
    await user.type(screen.getByLabelText(/complaint/i), 'Thermostat dead');
    await user.click(screen.getByRole('button', { name: /add work item/i }));

    // The create mutation's onError path runs (toast); the composer stays open.
    await waitFor(() => expect(apiClient.post).toHaveBeenCalled());
    expect(screen.getByLabelText(/complaint/i)).toBeInTheDocument();
  });

  it('closes the inline composer on cancel', async () => {
    const user = userEvent.setup();
    renderWithProviders(<WorkItemsTab {...baseProps} serviceLocationId="loc-1" workItems={[]} />);
    await user.click(screen.getByRole('button', { name: /add work item/i }));
    expect(screen.getByLabelText(/complaint/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(screen.queryByLabelText(/complaint/i)).not.toBeInTheDocument();
  });

  it('fires onDelete from the row menu (edit is inline — no Edit item)', async () => {
    const onDelete = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <WorkItemsTab {...baseProps} workItems={[wi('wi-1', 'No cooling')]} onDelete={onDelete} />
    );
    await user.click(screen.getByRole('button', { name: /more options/i }));
    // With only onDelete wired, the menu is Delete-only (Edit description /
    // Duplicate appear only when their handlers are provided).
    expect(screen.queryByRole('menuitem', { name: /edit/i })).not.toBeInTheDocument();
    await user.click(await screen.findByRole('menuitem', { name: /delete/i }));
    expect(onDelete).toHaveBeenCalled();
  });

  it('edits the complaint inline (click the text → composer → Save)', async () => {
    const onSaveDescription = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderWithProviders(
      <WorkItemsTab {...baseProps} workItems={[wi('wi-1', 'No cooling')]} onSaveDescription={onSaveDescription} />
    );
    await user.click(screen.getByRole('button', { name: /no cooling/i }));
    const textarea = screen.getByRole('textbox');
    await user.clear(textarea);
    await user.type(textarea, 'No heat upstairs');
    await user.click(screen.getByRole('button', { name: /^save$/i }));
    await waitFor(() =>
      expect(onSaveDescription).toHaveBeenCalledWith(expect.objectContaining({ id: 'wi-1' }), 'No heat upstairs')
    );
  });

  it('edits the diagnosis inline via the Edit affordance', async () => {
    const onSaveDiagnosis = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderWithProviders(
      <WorkItemsTab
        {...baseProps}
        workItems={[wi('wi-1', 'No cooling', { diagnosis: 'Cap failed' })]}
        onSaveDiagnosis={onSaveDiagnosis}
      />
    );
    await user.click(screen.getByRole('button', { name: /^edit$/i }));
    const textarea = screen.getByRole('textbox');
    await user.clear(textarea);
    await user.type(textarea, 'Compressor seized');
    await user.click(screen.getByRole('button', { name: /^save$/i }));
    await waitFor(() =>
      expect(onSaveDiagnosis).toHaveBeenCalledWith(expect.objectContaining({ id: 'wi-1' }), 'Compressor seized')
    );
  });

  it('offers Edit description + Duplicate + Delete in the row menu', async () => {
    const onDuplicate = vi.fn();
    const onSaveDescription = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderWithProviders(
      <WorkItemsTab
        {...baseProps}
        workItems={[wi('wi-1', 'No cooling')]}
        onDelete={vi.fn()}
        onDuplicate={onDuplicate}
        onSaveDescription={onSaveDescription}
      />
    );
    await user.click(screen.getByRole('button', { name: /more options/i }));
    await user.click(await screen.findByRole('menuitem', { name: /duplicate/i }));
    expect(onDuplicate).toHaveBeenCalledWith(expect.objectContaining({ id: 'wi-1' }));
  });

  it('shows the inline attach picker and attaches on pick for a needs-attach item', async () => {
    const onAttachEquipment = vi.fn();
    const user = userEvent.setup();
    // Picker candidates come from equipmentApi.list (via the mocked api client).
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { content: [{ id: 'eq-9', name: 'Rooftop unit', make: 'Trane', model: 'XR14' }] },
    } as never);
    renderWithProviders(
      <WorkItemsTab
        {...baseProps}
        serviceLocationId="loc-1"
        workItems={[wi('wi-1', 'No cooling')]}
        onAttachEquipment={onAttachEquipment}
      />
    );
    await user.click(await screen.findByRole('button', { name: /rooftop unit/i }));
    expect(onAttachEquipment).toHaveBeenCalledWith(expect.objectContaining({ id: 'wi-1' }), 'eq-9');
  });

  it('undoes the none-needed state via Attach (sets equipmentNeeded true)', async () => {
    const onSetEquipmentNeeded = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <WorkItemsTab
        {...baseProps}
        serviceLocationId="loc-1"
        workItems={[wi('wi-1', 'Drain clog', { equipmentNeeded: false })]}
        onSetEquipmentNeeded={onSetEquipmentNeeded}
      />
    );
    await user.click(screen.getByRole('button', { name: /^attach$/i }));
    expect(onSetEquipmentNeeded).toHaveBeenCalledWith(expect.objectContaining({ id: 'wi-1' }), true);
  });

  it('marks an item as not needing equipment from the picker', async () => {
    const onSetEquipmentNeeded = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <WorkItemsTab
        {...baseProps}
        serviceLocationId="loc-1"
        workItems={[wi('wi-1', 'Drain clog')]}
        onSetEquipmentNeeded={onSetEquipmentNeeded}
      />
    );
    await user.click(await screen.findByRole('button', { name: /doesn't need/i }));
    expect(onSetEquipmentNeeded).toHaveBeenCalledWith(expect.objectContaining({ id: 'wi-1' }), false);
  });

  it('swaps an attached item to the inline picker when Change is clicked', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <WorkItemsTab
        {...baseProps}
        serviceLocationId="loc-1"
        workItems={[wi('wi-1', 'No cooling', { equipmentId: 'eq-1', equipment: equip() })]}
        onAttachEquipment={vi.fn()}
      />
    );
    await user.click(await screen.findByRole('button', { name: /^change$/i }));
    // The dashed attach panel takes over in place of the equipment block.
    expect(await screen.findByText(/pick what's installed/i)).toBeInTheDocument();
  });

  it('hides add + row actions when readOnly', () => {
    renderWithProviders(
      <WorkItemsTab {...baseProps} workItems={[wi('wi-1', 'No cooling')]} readOnly onDelete={vi.fn()} />
    );
    expect(screen.queryByRole('button', { name: /add work item/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /more options/i })).not.toBeInTheDocument();
  });
});
