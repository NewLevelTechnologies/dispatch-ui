import { Linking } from 'react-native';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '../../../theme/ThemeProvider';
import WorkOrderDetailScreen from '../[id]';
import { useWorkOrderDetail } from '../../../work-orders/useWorkOrderDetail';
import { useServiceLocationDetail } from '../../../work-orders/useServiceLocationDetail';
import { useWorkItemStatuses } from '../../../work-orders/useWorkItemStatuses';
import { useWorkOrderPhotos } from '../../../work-orders/useWorkOrderFiles';
import { useWorkOrderNotes } from '../../../work-orders/useWorkOrderNotes';
import type { WorkOrder, WorkOrderNote, WorkItemResponse } from '@dispatch/api';

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'wo1' }),
}));
jest.mock('../../../work-orders/useWorkOrderDetail', () => ({ useWorkOrderDetail: jest.fn() }));
jest.mock('../../../work-orders/useServiceLocationDetail', () => ({ useServiceLocationDetail: jest.fn() }));
jest.mock('../../../work-orders/useWorkItemStatuses', () => ({ useWorkItemStatuses: jest.fn() }));
jest.mock('../../../work-orders/useWorkOrderFiles', () => ({ useWorkOrderPhotos: jest.fn() }));
jest.mock('../../../work-orders/useWorkOrderNotes', () => ({ useWorkOrderNotes: jest.fn() }));

const mockUseWorkOrderDetail = useWorkOrderDetail as jest.Mock;
const mockUseServiceLocationDetail = useServiceLocationDetail as jest.Mock;
const mockUseWorkItemStatuses = useWorkItemStatuses as jest.Mock;
const mockUseWorkOrderPhotos = useWorkOrderPhotos as jest.Mock;
const mockUseWorkOrderNotes = useWorkOrderNotes as jest.Mock;
const mockRefetch = jest.fn();
const mockAddNote = jest.fn();

const METRICS = { insets: { top: 44, left: 0, right: 0, bottom: 0 }, frame: { x: 0, y: 0, width: 390, height: 844 } };

const WORK_ITEM: WorkItemResponse = {
  id: 'wi1',
  sequence: 1,
  statusId: 'status-open',
  statusCategory: 'IN_PROGRESS',
  description: 'No hot water, pilot will not stay lit',
  diagnosis: null,
  equipmentId: null,
  equipment: null,
  equipmentNeeded: true,
  createdAt: '2026-10-16T00:00:00.000Z',
  updatedAt: '2026-10-20T08:00:00.000Z',
};

const BASE_WORK_ORDER: WorkOrder = {
  id: 'wo1',
  workOrderNumber: 'WO-00138',
  lifecycleState: 'ACTIVE',
  progressCategory: 'IN_PROGRESS',
  priority: 'NORMAL',
  summary: 'No hot water, pilot will not stay lit',
  serviceLocation: {
    id: 'loc1',
    address: { streetAddress: '123 Main St', city: 'Phoenix', state: 'AZ', zipCode: '85001' },
    siteContactName: 'Michelle Parker',
    siteContactPhone: '6025550100',
  },
  workItemCount: 1,
  workItems: [WORK_ITEM],
  createdAt: '2026-10-16T00:00:00.000Z',
  updatedAt: '2026-10-20T08:00:00.000Z',
};

const NOTE: WorkOrderNote = {
  id: 'n1',
  workOrderId: 'wo1',
  body: 'Customer called ahead',
  pinned: false,
  createdByUserId: 'user-1',
  createdByUserName: 'Jake Morrison',
  createdAt: '2026-10-19T12:00:00.000Z',
  updatedAt: '2026-10-19T12:00:00.000Z',
};

const renderDetail = () =>
  render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ThemeProvider>
        <WorkOrderDetailScreen />
      </ThemeProvider>
    </SafeAreaProvider>
  );

beforeEach(() => {
  jest.clearAllMocks();
  mockUseServiceLocationDetail.mockReturnValue({ serviceLocation: undefined, isLoading: false, error: null });
  mockUseWorkItemStatuses.mockReturnValue({ statuses: [], labelFor: () => null, isLoading: false, error: null });
  mockUseWorkOrderPhotos.mockReturnValue({ photos: [], isLoading: false, error: null });
  mockUseWorkOrderNotes.mockReturnValue({
    notes: [],
    isLoading: false,
    error: null,
    addNote: mockAddNote,
    isAdding: false,
    addNoteError: null,
  });
  jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
});

describe('WorkOrderDetailScreen', () => {
  it('shows a loading state', async () => {
    mockUseWorkOrderDetail.mockReturnValue({ workOrder: undefined, isLoading: true, error: null, refetch: mockRefetch });
    await renderDetail();
    expect(screen.queryByText('WO-00138')).toBeNull();
  });

  it('shows the error state with a working retry', async () => {
    mockUseWorkOrderDetail.mockReturnValue({
      workOrder: undefined,
      isLoading: false,
      error: new Error('network'),
      refetch: mockRefetch,
    });
    await renderDetail();

    expect(screen.getByText('Couldn’t load this work order')).toBeTruthy();
    await fireEvent.press(screen.getByText('Try again'));
    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });

  it('renders the header, site contact, and work items once loaded', async () => {
    mockUseWorkOrderDetail.mockReturnValue({ workOrder: BASE_WORK_ORDER, isLoading: false, error: null, refetch: mockRefetch });
    await renderDetail();

    expect(screen.getAllByText('No hot water, pilot will not stay lit').length).toBeGreaterThan(0);
    expect(screen.getByText('WO-00138')).toBeTruthy();
    expect(screen.getByText('123 Main St, Phoenix, AZ 85001')).toBeTruthy();
    expect(screen.getByText('Michelle Parker')).toBeTruthy();
    expect(screen.getByText('Attach equipment on site')).toBeTruthy();
    expect(screen.getByText('Not yet diagnosed')).toBeTruthy();
  });

  it('shows "No equipment" when the work item does not need one', async () => {
    mockUseWorkOrderDetail.mockReturnValue({
      workOrder: { ...BASE_WORK_ORDER, workItems: [{ ...WORK_ITEM, equipmentNeeded: false }] },
      isLoading: false,
      error: null,
      refetch: mockRefetch,
    });
    await renderDetail();
    expect(screen.getByText('No equipment')).toBeTruthy();
  });

  it('shows the equipment name when assigned', async () => {
    mockUseWorkOrderDetail.mockReturnValue({
      workOrder: {
        ...BASE_WORK_ORDER,
        workItems: [{ ...WORK_ITEM, equipmentId: 'eq1', equipment: { id: 'eq1', name: 'Rheem 50-gal water heater' } }],
      },
      isLoading: false,
      error: null,
      refetch: mockRefetch,
    });
    await renderDetail();
    expect(screen.getByText('Rheem 50-gal water heater')).toBeTruthy();
  });

  it('shows access instructions and arrival facts from the service location detail', async () => {
    mockUseServiceLocationDetail.mockReturnValue({
      serviceLocation: {
        id: 'loc1',
        address: { streetAddress: '123 Main St', city: 'Phoenix', state: 'AZ', zipCode: '85001' },
        siteContactName: 'Michelle Parker',
        siteContactPhone: '6025550100',
        accessInstructions: 'Dog in backyard, use front gate',
        arrivalFacts: [{ id: 'fact1', label: 'Gate code', value: '4521', mono: true }],
      },
      isLoading: false,
      error: null,
    });
    mockUseWorkOrderDetail.mockReturnValue({ workOrder: BASE_WORK_ORDER, isLoading: false, error: null, refetch: mockRefetch });
    await renderDetail();

    expect(screen.getByText('Dog in backyard, use front gate')).toBeTruthy();
    expect(screen.getByText('Gate code:')).toBeTruthy();
    expect(screen.getByText('4521')).toBeTruthy();
  });

  it('shows photo thumbnails grouped onto their work item', async () => {
    mockUseWorkOrderPhotos.mockReturnValue({
      photos: [
        { id: 'f1', workItemId: 'wi1', url: 'https://files.example/f1.jpg', thumbnailUrl: 'https://files.example/f1-thumb.jpg' },
      ],
      isLoading: false,
      error: null,
    });
    mockUseWorkOrderDetail.mockReturnValue({ workOrder: BASE_WORK_ORDER, isLoading: false, error: null, refetch: mockRefetch });
    await renderDetail();

    expect(screen.getByTestId('photo-f1').props.source).toEqual({ uri: 'https://files.example/f1-thumb.jpg' });
  });

  it('calls the site contact when Call is pressed', async () => {
    mockUseWorkOrderDetail.mockReturnValue({ workOrder: BASE_WORK_ORDER, isLoading: false, error: null, refetch: mockRefetch });
    await renderDetail();

    await fireEvent.press(screen.getByText('Call'));
    expect(Linking.openURL).toHaveBeenCalledWith('tel:6025550100');
  });

  it('opens directions when Directions is pressed', async () => {
    mockUseWorkOrderDetail.mockReturnValue({ workOrder: BASE_WORK_ORDER, isLoading: false, error: null, refetch: mockRefetch });
    await renderDetail();

    await fireEvent.press(screen.getByText('Directions'));
    expect(Linking.openURL).toHaveBeenCalledWith(
      'https://www.google.com/maps/search/?api=1&query=123%20Main%20St%2C%20Phoenix%2C%20AZ%2085001'
    );
  });

  it('shows an empty state when there are no notes', async () => {
    mockUseWorkOrderDetail.mockReturnValue({ workOrder: BASE_WORK_ORDER, isLoading: false, error: null, refetch: mockRefetch });
    await renderDetail();
    expect(screen.getByText('No notes yet.')).toBeTruthy();
  });

  it('lists existing notes with author and date', async () => {
    mockUseWorkOrderNotes.mockReturnValue({
      notes: [NOTE],
      isLoading: false,
      error: null,
      addNote: mockAddNote,
      isAdding: false,
      addNoteError: null,
    });
    mockUseWorkOrderDetail.mockReturnValue({ workOrder: BASE_WORK_ORDER, isLoading: false, error: null, refetch: mockRefetch });
    await renderDetail();

    expect(screen.getByText('Customer called ahead')).toBeTruthy();
    expect(screen.getByText('Jake Morrison · Oct 19')).toBeTruthy();
  });

  it('adds a note and clears the composer', async () => {
    mockUseWorkOrderDetail.mockReturnValue({ workOrder: BASE_WORK_ORDER, isLoading: false, error: null, refetch: mockRefetch });
    await renderDetail();

    const input = screen.getByPlaceholderText('Add a note…');
    await fireEvent.changeText(input, 'Parts on order');
    await fireEvent.press(screen.getByText('Add note'));

    expect(mockAddNote).toHaveBeenCalledWith('Parts on order');
  });
});
