import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import DispatchDetailDrawer from './DispatchDetailDrawer';
import type { Dispatch, DispatchStatus, User, WorkItemResponse, WorkOrderFile } from '../api';
import type { NotificationLogDto } from '../api/notificationApi';

const mockUserGetAll = vi.fn();
const mockGetNotificationLogs = vi.fn();
const mockFilesList = vi.fn();
const mockDispatchUpdate = vi.fn();
const mockGetById = vi.fn();

vi.mock('../api/userApi', () => ({
  userApi: { getAll: (...args: unknown[]) => mockUserGetAll(...args) },
  default: { getAll: (...args: unknown[]) => mockUserGetAll(...args) },
}));

vi.mock('../api/notificationApi', async () => {
  const actual = await vi.importActual<typeof import('../api/notificationApi')>('../api/notificationApi');
  return {
    ...actual,
    notificationApi: { getNotificationLogs: (...args: unknown[]) => mockGetNotificationLogs(...args) },
  };
});

vi.mock('../api/filesApi', async () => {
  const actual = await vi.importActual<typeof import('../api/filesApi')>('../api/filesApi');
  return {
    ...actual,
    workOrderFilesApi: { ...actual.workOrderFilesApi, list: (...args: unknown[]) => mockFilesList(...args) },
  };
});

vi.mock('../api/schedulingApi', async () => {
  const actual = await vi.importActual<typeof import('../api/schedulingApi')>('../api/schedulingApi');
  return {
    ...actual,
    dispatchesApi: {
      ...actual.dispatchesApi,
      update: (...args: unknown[]) => mockDispatchUpdate(...args),
      getById: (...args: unknown[]) => mockGetById(...args),
    },
  };
});

const mockUser = (id: string, first: string, last: string): User => ({
  id,
  tenantId: 't1',
  cognitoSub: `sub-${id}`,
  email: `${first.toLowerCase()}@example.com`,
  firstName: first,
  lastName: last,
  phoneNumber: '555-1234',
  enabled: true,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
});

const mockDispatch = (overrides: Partial<Dispatch> = {}): Dispatch => ({
  id: 'd1',
  workOrderId: 'wo-1',
  assignedUserId: 'u1',
  arrivalWindowStart: '2099-05-15T14:00:00Z',
  arrivalWindowEnd: '2099-05-15T16:00:00Z',
  estimatedDuration: 90,
  status: 'SCHEDULED' as DispatchStatus,
  arrivedAt: null,
  departedAt: null,
  notes: null,
  createdAt: '2026-05-09T00:00:00Z',
  updatedAt: '2026-05-09T00:00:00Z',
  ...overrides,
});

const emptyLogsPage = {
  content: [] as NotificationLogDto[],
  totalElements: 0,
  totalPages: 0,
  last: true,
  size: 25,
  number: 0,
  numberOfElements: 0,
  first: true,
  empty: true,
};

const filesPage = (content: WorkOrderFile[] = []) => ({
  content,
  counts: { all: content.length, photos: 0, videos: 0, documents: 0 },
  totalElements: content.length,
  totalPages: content.length ? 1 : 0,
  number: 0,
  size: 100,
  first: true,
  last: true,
});

const photoFile = (over: Partial<WorkOrderFile> = {}): WorkOrderFile =>
  ({
    id: 'm1',
    kind: 'PHOTO',
    status: 'READY',
    fileName: 'before.jpg',
    url: 'https://s3/1',
    thumbnailUrl: 'https://s3/1t',
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
    dispatchId: 'd1',
    equipmentId: null,
    equipmentName: null,
    agreementId: null,
    isProfile: false,
    uploadedBy: null,
    uploadedByName: null,
    createdAt: '2099-05-15T15:00:00Z',
    ...over,
  }) as WorkOrderFile;

const renderDrawer = (dispatch: Dispatch | null, props: Partial<React.ComponentProps<typeof DispatchDetailDrawer>> = {}) => {
  // The by-id read backs lifecycle/label — echo the dispatch under test.
  if (dispatch) mockGetById.mockResolvedValue(dispatch);
  return renderWithProviders(
    <DispatchDetailDrawer
      dispatch={dispatch}
      dispatches={props.dispatches ?? (dispatch ? [dispatch] : [])}
      workItems={props.workItems}
      readOnly={props.readOnly}
      onClose={props.onClose ?? vi.fn()}
      onEdit={props.onEdit ?? vi.fn()}
      onDelete={props.onDelete ?? vi.fn()}
      onViewWorkItems={props.onViewWorkItems}
    />,
  );
};

describe('DispatchDetailDrawer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUserGetAll.mockResolvedValue([mockUser('u1', 'Jason', 'Smith')]);
    mockGetNotificationLogs.mockResolvedValue(emptyLogsPage);
    mockFilesList.mockResolvedValue(filesPage([]));
    mockDispatchUpdate.mockResolvedValue(mockDispatch({ status: 'IN_PROGRESS' }));
    mockGetById.mockResolvedValue(mockDispatch());
  });

  it('renders nothing when dispatch is null', () => {
    renderDrawer(null);
    expect(screen.queryByText('Jason Smith')).not.toBeInTheDocument();
    expect(screen.queryByText(/dispatch timeline/i)).not.toBeInTheDocument();
  });

  it('renders the sequence header, status, and tech with Call/Text', async () => {
    renderDrawer(mockDispatch());
    // seq derives from the dispatches prop (this is the only visit → Dispatch 1).
    expect(await screen.findByText('Dispatch 1')).toBeInTheDocument();
    expect(await screen.findByText('Jason Smith')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /call/i })).toHaveAttribute('href', 'tel:5551234');
    expect(screen.getByRole('link', { name: /text/i })).toHaveAttribute('href', 'sms:5551234');
  });

  it('renders the visit timeline with reached and hollow steps', async () => {
    renderDrawer(mockDispatch());
    expect(await screen.findByText('Dispatch timeline')).toBeInTheDocument();
    expect(screen.getByText('Tech notified')).toBeInTheDocument();
    expect(screen.getByText('Customer notified')).toBeInTheDocument();
    expect(screen.getByText('En route')).toBeInTheDocument();
    expect(screen.getByText('Arrived on site')).toBeInTheDocument();
    // En route (never), Arrived, Departed all hollow for a fresh SCHEDULED visit.
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(3);
  });

  it('derives "captured this visit" media from files keyed by dispatchId', async () => {
    mockFilesList.mockResolvedValue(filesPage([photoFile()]));
    renderDrawer(mockDispatch());
    expect(await screen.findByText('Captured this dispatch')).toBeInTheDocument();
    expect(screen.getByAltText('before.jpg')).toBeInTheDocument();
  });

  it('renders the notifications empty state and scopes the query to the dispatch', async () => {
    renderDrawer(mockDispatch());
    await waitFor(() => expect(screen.getByText(/no notifications sent yet/i)).toBeInTheDocument());
    expect(mockGetNotificationLogs).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: 'DISPATCH', entityId: 'd1' }),
    );
  });

  it('renders notification log rows when present', async () => {
    mockGetNotificationLogs.mockResolvedValue({
      ...emptyLogsPage,
      empty: false,
      numberOfElements: 1,
      totalElements: 1,
      content: [
        {
          id: 'n1',
          notificationId: 'nid1',
          notificationTypeId: 'nt1',
          notificationTypeName: 'Dispatch Assigned',
          channel: 'SMS',
          recipientName: 'Jason Smith',
          recipientPhone: '555-1234',
          status: 'DELIVERED',
          entityType: 'DISPATCH',
          entityId: 'd1',
          body: 'Daniel is on the way — ETA ~12:38p.',
          createdAt: '2099-05-15T13:55:00Z',
          sentAt: '2099-05-15T13:55:01Z',
          retryCount: 0,
        } satisfies NotificationLogDto,
      ],
    });
    renderDrawer(mockDispatch());
    // Status enum renders title-cased (DELIVERED → Delivered).
    expect(await screen.findByText('Delivered')).toBeInTheDocument();
    // The rendered SMS body appears when present.
    expect(screen.getByText('Daniel is on the way — ETA ~12:38p.')).toBeInTheDocument();
  });

  it('renders the notes section only when notes are present', async () => {
    const { unmount } = renderDrawer(mockDispatch({ notes: 'Customer prefers AM' }));
    expect(await screen.findByText('Customer prefers AM')).toBeInTheDocument();
    unmount();

    renderDrawer(mockDispatch({ notes: null }));
    await screen.findByText('Jason Smith');
    expect(screen.queryByText('Customer prefers AM')).not.toBeInTheDocument();
  });

  it('SCHEDULED footer: Reassign opens edit; Mark en route transitions to EN_ROUTE', async () => {
    const onEdit = vi.fn();
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderDrawer(mockDispatch(), { onEdit, onClose });

    await user.click(await screen.findByRole('button', { name: /reassign/i }));
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 'd1' }));

    await user.click(screen.getByRole('button', { name: /mark en route/i }));
    await waitFor(() => expect(mockDispatchUpdate).toHaveBeenCalledWith('d1', { status: 'EN_ROUTE' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('EN_ROUTE footer: Mark on site transitions to IN_PROGRESS', async () => {
    const user = userEvent.setup();
    renderDrawer(mockDispatch({ status: 'EN_ROUTE' }));
    await user.click(await screen.findByRole('button', { name: /mark on site/i }));
    await waitFor(() => expect(mockDispatchUpdate).toHaveBeenCalledWith('d1', { status: 'IN_PROGRESS' }));
    expect(screen.queryByRole('button', { name: /mark en route/i })).not.toBeInTheDocument();
  });

  it('IN_PROGRESS footer: Complete visit transitions to COMPLETED (no Mark on site)', async () => {
    const user = userEvent.setup();
    renderDrawer(mockDispatch({ status: 'IN_PROGRESS' }));
    await user.click(await screen.findByRole('button', { name: /complete dispatch/i }));
    await waitFor(() => expect(mockDispatchUpdate).toHaveBeenCalledWith('d1', { status: 'COMPLETED' }));
    expect(screen.queryByRole('button', { name: /mark on site/i })).not.toBeInTheDocument();
  });

  it('renders the timeline from the by-id lifecycle (only unreached steps show —)', async () => {
    renderDrawer(
      mockDispatch({
        status: 'IN_PROGRESS',
        arrivedAt: '2099-05-15T14:31:00Z',
        lifecycle: {
          scheduled: '2099-05-14T15:48:00Z',
          techNotified: '2099-05-14T15:55:00Z',
          notified: '2099-05-14T16:02:00Z',
          enroute: '2099-05-15T14:12:00Z',
          arrived: '2099-05-15T14:31:00Z',
          departed: null,
        },
      }),
    );
    // Scheduled/notified/enroute/arrived reached → only Departed shows the dash.
    expect(await screen.findByText('En route')).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByText('—')).toHaveLength(1));
  });

  it('COMPLETED footer: shows completed time + Delete, no transitions', async () => {
    const onDelete = vi.fn();
    const user = userEvent.setup();
    renderDrawer(
      mockDispatch({ status: 'COMPLETED', arrivedAt: '2099-05-15T14:05:00Z', departedAt: '2099-05-15T15:30:00Z' }),
      { onDelete },
    );
    await user.click(await screen.findByRole('button', { name: /^delete$/i }));
    expect(onDelete).toHaveBeenCalledWith(expect.objectContaining({ id: 'd1' }));
    expect(screen.queryByRole('button', { name: /mark on site/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /complete dispatch/i })).not.toBeInTheDocument();
  });

  it('hides all footer actions in read-only mode', async () => {
    renderDrawer(mockDispatch(), { readOnly: true });
    await screen.findByText('Jason Smith');
    expect(screen.queryByRole('button', { name: /reassign/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /mark en route/i })).not.toBeInTheDocument();
  });

  it('lists the work items this visit addresses and links out', async () => {
    const onViewWorkItems = vi.fn();
    const user = userEvent.setup();
    const workItems = [
      {
        id: 'wi-1',
        statusId: null,
        statusCategory: 'IN_PROGRESS',
        description: 'No cooling — upstairs condenser',
        equipmentId: null,
        equipment: null,
        createdAt: '2099-05-01T00:00:00Z',
        updatedAt: '2099-05-01T00:00:00Z',
      },
    ] as unknown as WorkItemResponse[];
    renderDrawer(mockDispatch({ addressedWorkItemIds: ['wi-1'] }), { workItems, onViewWorkItems });

    expect(await screen.findByText('Work addressed')).toBeInTheDocument();
    await user.click(await screen.findByText('No cooling — upstairs condenser'));
    expect(onViewWorkItems).toHaveBeenCalled();
  });

  it('hides Work addressed when the visit is unscoped (no addressed items)', async () => {
    renderDrawer(mockDispatch());
    await screen.findByText('Jason Smith');
    expect(screen.queryByText('Work addressed')).not.toBeInTheDocument();
  });

  it('invokes onClose when the X button is clicked', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderDrawer(mockDispatch(), { onClose });
    await user.click(await screen.findByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
