import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../test/utils';
import DispatchesTab from './DispatchesTab';
import apiClient from '../api/client';
import type { DispatchBoardRow } from '../api';

vi.mock('../api/client');

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
    expect(screen.getByText(/Daniel P\./)).toBeInTheDocument();
  });

  it('renders the live (in-progress) dispatch with the On site label', () => {
    renderTab([
      row({ id: 'd-sched', status: 'SCHEDULED', assignedUserName: 'Sched Tech' }),
      row({ id: 'd-live', status: 'IN_PROGRESS', assignedUserName: 'Live Tech' }),
    ]);
    expect(screen.getByText('On site')).toBeInTheDocument();
  });

  it('calls onAssign from the Schedule button', async () => {
    const onAssign = vi.fn();
    const user = userEvent.setup();
    renderTab([row({})], { onAssign });
    // The add button reads "Schedule Dispatch" — distinct from the card button
    // (name includes the status "Scheduled") and the live card's "Reschedule".
    await user.click(screen.getByRole('button', { name: /schedule dispatch/i }));
    expect(onAssign).toHaveBeenCalled();
  });

  it('hides the Schedule button when readOnly', () => {
    renderTab([row({})], { readOnly: true });
    expect(screen.queryByRole('button', { name: /schedule dispatch/i })).not.toBeInTheDocument();
  });

  it('reschedules a live dispatch via onEdit', async () => {
    const onEdit = vi.fn();
    const user = userEvent.setup();
    renderTab([row({ id: 'd-live', status: 'IN_PROGRESS' })], { onEdit });
    await user.click(screen.getByRole('button', { name: /reschedule/i }));
    expect(onEdit).toHaveBeenCalled();
  });

  it('hides Reschedule on a live dispatch when readOnly', () => {
    renderTab([row({ id: 'd-live', status: 'IN_PROGRESS' })], { readOnly: true });
    expect(screen.queryByRole('button', { name: /reschedule/i })).not.toBeInTheDocument();
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

  it('calls onSelect when a dispatch card is clicked', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    renderTab([row({ status: 'COMPLETED' })], { onSelect });
    await user.click(screen.getByText(/Daniel P\./).closest('button')!);
    expect(onSelect).toHaveBeenCalled();
  });
});
