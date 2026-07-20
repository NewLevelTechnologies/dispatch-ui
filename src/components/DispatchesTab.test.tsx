import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../test/utils';
import DispatchesTab from './DispatchesTab';
import apiClient from '../api/client';
import type { DispatchBoardRow, WorkItemResponse } from '../api';

vi.mock('../api/client');

const workItem = (over: Partial<WorkItemResponse> & { id: string }): WorkItemResponse => ({
  sequence: 1,
  statusId: null,
  statusCategory: 'IN_PROGRESS',
  description: 'Complaint',
  equipmentId: null,
  equipment: null,
  createdAt: '2026-05-01T00:00:00Z',
  updatedAt: '2026-05-01T00:00:00Z',
  ...over,
});

const row = (over: Partial<DispatchBoardRow>): DispatchBoardRow => ({
  id: 'd-1',
  workOrderId: 'wo-1',
  assignedUserId: 'u-1',
  arrivalWindowStart: '2026-05-18T16:00:00Z',
  arrivalWindowEnd: '2026-05-18T18:00:00Z',
  estimatedDuration: null,
  status: 'SCHEDULED',
  arrivedAt: null,
  departedAt: null,
  notes: null,
  createdAt: '2026-05-01T00:00:00Z',
  updatedAt: '2026-05-01T00:00:00Z',
  workOrderNumber: 'WO-1',
  workOrderTypeId: null,
  workOrderTypeName: null,
  workOrderSummary: null,
  customerId: null,
  customerName: null,
  serviceLocationId: null,
  serviceLocationCity: null,
  serviceLocationState: null,
  assignedUserName: 'Daniel Park',
  ...over,
});

describe('DispatchesTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // The per-dispatch media query (fired only when there are dispatches).
    vi.mocked(apiClient.get).mockResolvedValue({
      data: {
        content: [],
        totalElements: 0,
        totalPages: 0,
        number: 0,
        size: 100,
        first: true,
        last: true,
        numberOfElements: 0,
        empty: true,
        counts: { photos: 0, videos: 0, documents: 0, total: 0 },
      },
    });
  });

  const renderTab = (
    dispatches: DispatchBoardRow[],
    props: Partial<React.ComponentProps<typeof DispatchesTab>> = {}
  ) =>
    renderWithProviders(
      <DispatchesTab
        workOrderId="wo-1"
        dispatches={dispatches}
        onAssign={vi.fn()}
        onEdit={vi.fn()}
        onSelect={vi.fn()}
        {...props}
      />
    );

  it('shows the empty state when there are no dispatches', () => {
    renderTab([]);
    expect(screen.getByText(/no .* yet/i)).toBeInTheDocument();
  });

  it('excludes cancelled dispatches from the list', () => {
    renderTab([row({ status: 'CANCELLED' })]);
    expect(screen.getByText(/no .* yet/i)).toBeInTheDocument();
  });

  it('renders a dispatch card with the tech name', () => {
    renderTab([row({})]);
    expect(screen.getByText('Daniel Park')).toBeInTheDocument();
  });

  it('shows the dispatch sequence and the addressed work-item count', () => {
    renderTab([row({ addressedWorkItemIds: ['wi-a', 'wi-b'] })]);
    expect(screen.getByText(/dispatch 1/i)).toBeInTheDocument();
    expect(screen.getByText(/2 work items/i)).toBeInTheDocument();
  });

  it('renders the live (in-progress) dispatch with the On site label', () => {
    renderTab([
      row({ id: 'd-sched', status: 'SCHEDULED', assignedUserName: 'Sched Tech' }),
      row({ id: 'd-live', status: 'IN_PROGRESS', assignedUserName: 'Live Tech' }),
    ]);
    // "On site" appears on both the status pill and the live status strip.
    expect(screen.getAllByText('On site').length).toBeGreaterThan(0);
  });

  it('calls onAssign from the Schedule button', async () => {
    const onAssign = vi.fn();
    const user = userEvent.setup();
    renderTab([row({})], { onAssign });
    // The add button reads "Schedule Dispatch" — distinct from the card button
    // (name includes the status "Scheduled") and the live card's "Edit dispatch".
    await user.click(screen.getByRole('button', { name: /schedule dispatch/i }));
    expect(onAssign).toHaveBeenCalled();
  });

  it('hides the Schedule button when readOnly', () => {
    renderTab([row({})], { readOnly: true });
    expect(screen.queryByRole('button', { name: /schedule dispatch/i })).not.toBeInTheDocument();
  });

  it('edits a live dispatch via onEdit', async () => {
    const onEdit = vi.fn();
    const user = userEvent.setup();
    renderTab([row({ id: 'd-live', status: 'IN_PROGRESS' })], { onEdit });
    await user.click(screen.getByRole('button', { name: /edit dispatch/i }));
    expect(onEdit).toHaveBeenCalled();
  });

  it('hides the edit action on a live dispatch when readOnly', () => {
    renderTab([row({ id: 'd-live', status: 'IN_PROGRESS' })], { readOnly: true });
    expect(screen.queryByRole('button', { name: /edit dispatch/i })).not.toBeInTheDocument();
  });

  it('derives photo/video counts + thumbnails from files by dispatchId', async () => {
    const woFile = (over: Record<string, unknown>) => ({
      id: 'm-x',
      kind: 'PHOTO',
      status: 'READY',
      fileName: 'p.jpg',
      url: 'https://x/p.jpg',
      thumbnailUrl: 'https://x/t.jpg',
      durationSeconds: null,
      contentType: 'image/jpeg',
      sizeBytes: 1,
      widthPx: null,
      heightPx: null,
      thumbnailWidthPx: null,
      thumbnailHeightPx: null,
      caption: null,
      workOrderId: 'wo-1',
      workOrderNumber: null,
      workItemId: null,
      dispatchId: 'd-1',
      equipmentId: null,
      equipmentName: null,
      agreementId: null,
      isProfile: false,
      uploadedBy: null,
      uploadedByName: null,
      createdAt: 'x',
      ...over,
    });
    vi.mocked(apiClient.get).mockResolvedValue({
      data: {
        content: [
          woFile({ id: 'm-1', kind: 'PHOTO' }),
          woFile({ id: 'm-2', kind: 'VIDEO', durationSeconds: 18 }),
        ],
        totalElements: 2,
        totalPages: 1,
        number: 0,
        size: 100,
        first: true,
        last: true,
        numberOfElements: 2,
        empty: false,
      },
    });
    renderTab([row({ id: 'd-1', status: 'COMPLETED' })]);
    expect(await screen.findByText(/1 photos/i)).toBeInTheDocument();
    expect(await screen.findByText(/1 video/i)).toBeInTheDocument();
  });

  it('calls onSelect when the card head is clicked', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    renderTab([row({ status: 'COMPLETED' })], { onSelect });
    await user.click(screen.getByText(/view details/i).closest('button')!);
    expect(onSelect).toHaveBeenCalled();
  });

  it('advances a live dispatch to on-site via Mark on site', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.put).mockResolvedValue({ data: row({ status: 'IN_PROGRESS' }) });
    renderTab([row({ id: 'd-live', status: 'EN_ROUTE' })]);
    await user.click(screen.getByRole('button', { name: /mark on site/i }));
    await waitFor(() =>
      expect(apiClient.put).toHaveBeenCalledWith(
        expect.stringMatching(/\/scheduling\/dispatches\/d-live$/),
        { status: 'IN_PROGRESS' },
      ),
    );
  });

  it('renders addressed work-item chips (WI-02) when work items are provided', () => {
    renderTab([row({ addressedWorkItemIds: ['wi-a', 'wi-b'] })], {
      workItems: [workItem({ id: 'wi-a', sequence: 1 }), workItem({ id: 'wi-b', sequence: 2 })],
    });
    expect(screen.getByText('WI-01')).toBeInTheDocument();
    expect(screen.getByText('WI-02')).toBeInTheDocument();
    // The vague count pill is gone once the chips resolve.
    expect(screen.queryByText(/work items/i)).not.toBeInTheDocument();
  });

  it('flags a parts-blocked visit from a blocked addressed work item', () => {
    renderTab([row({ addressedWorkItemIds: ['wi-a'] })], {
      workItems: [workItem({ id: 'wi-a', statusCategory: 'BLOCKED' })],
    });
    expect(screen.getByText(/awaiting parts/i)).toBeInTheDocument();
  });

  it('gives a scheduled card the drawer-mirrored footer (Edit + Mark en route)', () => {
    renderTab([row({ status: 'SCHEDULED' })]);
    expect(screen.getByRole('button', { name: /edit dispatch/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /mark en route/i })).toBeInTheDocument();
  });

  it('advances a scheduled dispatch to en route via Mark en route', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.put).mockResolvedValue({ data: row({ status: 'EN_ROUTE' }) });
    renderTab([row({ id: 'd-1', status: 'SCHEDULED' })]);
    await user.click(screen.getByRole('button', { name: /mark en route/i }));
    await waitFor(() =>
      expect(apiClient.put).toHaveBeenCalledWith(
        expect.stringMatching(/\/scheduling\/dispatches\/d-1$/),
        { status: 'EN_ROUTE' },
      ),
    );
  });

  it('reads differently for an en-route visit (live status strip + committed ETA)', () => {
    renderTab([row({ id: 'd-live', status: 'EN_ROUTE' })]);
    expect(screen.getByText(/arriving by/i)).toBeInTheDocument();
    expect(screen.getByText(/self-reported/i)).toBeInTheDocument();
  });

  it('shows the visit note on the card', () => {
    renderTab([row({ status: 'COMPLETED', notes: 'Replaced the run capacitor.' })]);
    expect(screen.getByText('Replaced the run capacitor.')).toBeInTheDocument();
  });

  it('offers View invoice on a completed card and calls onViewInvoice', async () => {
    const onViewInvoice = vi.fn();
    const user = userEvent.setup();
    renderTab([row({ status: 'COMPLETED' })], { onViewInvoice });
    await user.click(screen.getByRole('button', { name: /view invoice/i }));
    expect(onViewInvoice).toHaveBeenCalled();
  });
});
