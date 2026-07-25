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

  it('shows the diagnosis when present and the empty state when not', () => {
    renderWithProviders(
      <WorkItemsTab
        {...baseProps}
        workItems={[
          wi('wi-1', 'No cooling', { diagnosis: 'Run capacitor failed' }),
          wi('wi-2', 'Loud rattle'),
        ]}
      />
    );
    expect(screen.getByText('Run capacitor failed')).toBeInTheDocument();
    expect(screen.getByText(/not yet diagnosed/i)).toBeInTheDocument();
  });

  it('renders the parts & readiness empty state (parts are backend-deferred)', () => {
    renderWithProviders(<WorkItemsTab {...baseProps} workItems={[wi('wi-1', 'No cooling')]} />);
    expect(screen.getByText(/no parts identified yet/i)).toBeInTheDocument();
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

  it('fires onEdit and onDelete from the row menu', async () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <WorkItemsTab {...baseProps} workItems={[wi('wi-1', 'No cooling')]} onEdit={onEdit} onDelete={onDelete} />
    );
    await user.click(screen.getByRole('button', { name: /more options/i }));
    await user.click(await screen.findByRole('menuitem', { name: /edit/i }));
    expect(onEdit).toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /more options/i }));
    await user.click(await screen.findByRole('menuitem', { name: /delete/i }));
    expect(onDelete).toHaveBeenCalled();
  });

  it('hides add + row actions when readOnly', () => {
    renderWithProviders(
      <WorkItemsTab {...baseProps} workItems={[wi('wi-1', 'No cooling')]} readOnly onEdit={vi.fn()} onDelete={vi.fn()} />
    );
    expect(screen.queryByRole('button', { name: /add work item/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /more options/i })).not.toBeInTheDocument();
  });
});
