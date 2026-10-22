import { Linking } from 'react-native';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '../../../theme/ThemeProvider';
import DispatchDetailScreen from '../[id]';
import { useDispatchDetail } from '../../../dispatches/useDispatchDetail';
import { useWorkOrderContact } from '../../../dispatches/useWorkOrderContact';
import { useUpdateDispatchStatus } from '../../../dispatches/useUpdateDispatchStatus';
import { useWorkOrderAccess } from '../../../permissions/useWorkOrderAccess';
import type { Dispatch } from '@dispatch/api';

const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'd1', workOrderId: 'wo1' }),
  useRouter: () => ({ push: mockPush, back: mockBack }),
}));
jest.mock('../../../dispatches/useDispatchDetail', () => ({ useDispatchDetail: jest.fn() }));
jest.mock('../../../dispatches/useWorkOrderContact', () => ({ useWorkOrderContact: jest.fn() }));
jest.mock('../../../dispatches/useUpdateDispatchStatus', () => ({ useUpdateDispatchStatus: jest.fn() }));
jest.mock('../../../permissions/useWorkOrderAccess', () => ({ useWorkOrderAccess: jest.fn() }));

const mockUseDispatchDetail = useDispatchDetail as jest.Mock;
const mockUseWorkOrderContact = useWorkOrderContact as jest.Mock;
const mockUseUpdateDispatchStatus = useUpdateDispatchStatus as jest.Mock;
const mockUseWorkOrderAccess = useWorkOrderAccess as jest.Mock;
const mockRefetch = jest.fn();
const mockMutate = jest.fn();

const METRICS = { insets: { top: 44, left: 0, right: 0, bottom: 0 }, frame: { x: 0, y: 0, width: 390, height: 844 } };

const BASE_DISPATCH: Dispatch = {
  id: 'd1',
  workOrderId: 'wo1',
  assignedUserId: 'user-1',
  arrivalWindowStart: new Date(2026, 9, 20, 8, 0, 0).toISOString(),
  arrivalWindowEnd: new Date(2026, 9, 20, 10, 0, 0).toISOString(),
  estimatedDuration: 120,
  status: 'EN_ROUTE',
  arrivedAt: null,
  departedAt: null,
  notes: null,
  createdAt: '2026-10-16T00:00:00.000Z',
  updatedAt: '2026-10-20T08:00:00.000Z',
  lifecycle: { scheduled: '2026-10-16T00:00:00Z', notified: null, enroute: '2026-10-20T08:00:00Z', arrived: null, departed: null },
};

const BASE_CONTACT = {
  workOrderNumber: 'WO-00138',
  summary: 'No hot water, pilot will not stay lit',
  locationName: null,
  address: { streetAddress: '123 Main St', city: 'Phoenix', state: 'AZ', zipCode: '85001' },
  contactName: 'Michelle Parker',
  contactPhone: '6025550100',
  isLoading: false,
  error: null,
};

const renderDetail = () =>
  render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ThemeProvider>
        <DispatchDetailScreen />
      </ThemeProvider>
    </SafeAreaProvider>
  );

beforeEach(() => {
  jest.clearAllMocks();
  mockUseUpdateDispatchStatus.mockReturnValue({ mutate: mockMutate, isPending: false });
  mockUseWorkOrderAccess.mockReturnValue({ canEdit: true });
  mockUseWorkOrderContact.mockReturnValue(BASE_CONTACT);
  jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
});

describe('DispatchDetailScreen', () => {
  it('shows a loading state', async () => {
    mockUseDispatchDetail.mockReturnValue({ dispatch: undefined, isLoading: true, error: null, refetch: mockRefetch });
    await renderDetail();
    expect(screen.queryByText('No hot water, pilot will not stay lit')).toBeNull();
  });

  it('can navigate back while loading', async () => {
    mockUseDispatchDetail.mockReturnValue({ dispatch: undefined, isLoading: true, error: null, refetch: mockRefetch });
    await renderDetail();
    await fireEvent.press(screen.getByLabelText('Back'));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('can navigate back on error', async () => {
    mockUseDispatchDetail.mockReturnValue({ dispatch: undefined, isLoading: false, error: new Error('x'), refetch: mockRefetch });
    await renderDetail();
    await fireEvent.press(screen.getByLabelText('Back'));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('can navigate back once loaded', async () => {
    mockUseDispatchDetail.mockReturnValue({ dispatch: BASE_DISPATCH, isLoading: false, error: null, refetch: mockRefetch });
    await renderDetail();
    await fireEvent.press(screen.getByLabelText('Back'));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('shows the error state with a working retry', async () => {
    mockUseDispatchDetail.mockReturnValue({
      dispatch: undefined,
      isLoading: false,
      error: new Error('network'),
      refetch: mockRefetch,
    });
    await renderDetail();

    expect(screen.getByText('Couldn’t load this visit')).toBeTruthy();
    await fireEvent.press(screen.getByText('Try again'));
    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });

  it('renders the header, status, timeline and location once loaded', async () => {
    mockUseDispatchDetail.mockReturnValue({ dispatch: BASE_DISPATCH, isLoading: false, error: null, refetch: mockRefetch });
    await renderDetail();

    expect(screen.getByText('No hot water, pilot will not stay lit')).toBeTruthy();
    expect(screen.getByText('WO-00138')).toBeTruthy();
    expect(screen.getByText('123 Main St, Phoenix, AZ 85001')).toBeTruthy();
    expect(screen.getByText('Michelle Parker')).toBeTruthy();
    // "En route" appears twice — the status pill and the timeline step both
    // use the same word for the same status.
    expect(screen.getAllByText('En route').length).toBe(2);
    // Lifecycle timeline labels
    expect(screen.getByText('Scheduled')).toBeTruthy();
    expect(screen.getByText('Departed')).toBeTruthy();
  });

  it('shows "On site" rather than "In Progress" for an IN_PROGRESS dispatch', async () => {
    mockUseDispatchDetail.mockReturnValue({
      dispatch: { ...BASE_DISPATCH, status: 'IN_PROGRESS' },
      isLoading: false,
      error: null,
      refetch: mockRefetch,
    });
    await renderDetail();
    expect(screen.getByText('On site')).toBeTruthy();
    expect(screen.queryByText('In Progress')).toBeNull();
  });

  it('navigates to the work order when "View Work Order" is pressed', async () => {
    mockUseDispatchDetail.mockReturnValue({ dispatch: BASE_DISPATCH, isLoading: false, error: null, refetch: mockRefetch });
    await renderDetail();

    await fireEvent.press(screen.getByText('View Work Order'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/work-order/[id]', params: { id: 'wo1' } });
  });

  it('calls the site contact when Call is pressed', async () => {
    mockUseDispatchDetail.mockReturnValue({ dispatch: BASE_DISPATCH, isLoading: false, error: null, refetch: mockRefetch });
    await renderDetail();

    await fireEvent.press(screen.getByText('Call'));
    expect(Linking.openURL).toHaveBeenCalledWith('tel:6025550100');
  });

  it('opens directions when Directions is pressed', async () => {
    mockUseDispatchDetail.mockReturnValue({ dispatch: BASE_DISPATCH, isLoading: false, error: null, refetch: mockRefetch });
    await renderDetail();

    await fireEvent.press(screen.getByText('Directions'));
    expect(Linking.openURL).toHaveBeenCalledWith(
      'https://www.google.com/maps/search/?api=1&query=123%20Main%20St%2C%20Phoenix%2C%20AZ%2085001'
    );
  });

  it('omits Call when there is no contact phone', async () => {
    mockUseWorkOrderContact.mockReturnValue({ ...BASE_CONTACT, contactPhone: null });
    mockUseDispatchDetail.mockReturnValue({ dispatch: BASE_DISPATCH, isLoading: false, error: null, refetch: mockRefetch });
    await renderDetail();
    expect(screen.queryByText('Call')).toBeNull();
  });

  it('hides every status action when the role may not edit this job', async () => {
    mockUseWorkOrderAccess.mockReturnValue({ canEdit: false });
    mockUseDispatchDetail.mockReturnValue({ dispatch: BASE_DISPATCH, isLoading: false, error: null, refetch: mockRefetch });
    await renderDetail();

    expect(screen.queryByText('Mark en route')).toBeNull();
    expect(screen.queryByText('Mark arrived')).toBeNull();
    expect(screen.queryByText('Mark completed')).toBeNull();
    // The screen still reads — only acting on it is gated.
    expect(screen.getByText('123 Main St, Phoenix, AZ 85001')).toBeTruthy();
    expect(screen.getAllByText('En route').length).toBeGreaterThan(0);
  });

  it('asks about access for the dispatch’s own assignee', async () => {
    mockUseDispatchDetail.mockReturnValue({ dispatch: BASE_DISPATCH, isLoading: false, error: null, refetch: mockRefetch });
    await renderDetail();

    expect(mockUseWorkOrderAccess).toHaveBeenCalledWith('user-1');
  });

  it('offers only "Mark arrived" and "Mark completed" while en route', async () => {
    mockUseDispatchDetail.mockReturnValue({ dispatch: BASE_DISPATCH, isLoading: false, error: null, refetch: mockRefetch });
    await renderDetail();

    expect(screen.queryByText('Mark en route')).toBeNull();
    expect(screen.getByText('Mark arrived')).toBeTruthy();
    expect(screen.getByText('Mark completed')).toBeTruthy();

    await fireEvent.press(screen.getByText('Mark arrived'));
    expect(mockMutate).toHaveBeenCalledWith('IN_PROGRESS');
  });

  it('offers "Mark en route" while scheduled, and marks it correctly', async () => {
    mockUseDispatchDetail.mockReturnValue({
      dispatch: { ...BASE_DISPATCH, status: 'SCHEDULED' },
      isLoading: false,
      error: null,
      refetch: mockRefetch,
    });
    await renderDetail();

    await fireEvent.press(screen.getByText('Mark en route'));
    expect(mockMutate).toHaveBeenCalledWith('EN_ROUTE');
  });

  it('offers no status actions once completed', async () => {
    mockUseDispatchDetail.mockReturnValue({
      dispatch: { ...BASE_DISPATCH, status: 'COMPLETED' },
      isLoading: false,
      error: null,
      refetch: mockRefetch,
    });
    await renderDetail();

    expect(screen.queryByText('Mark en route')).toBeNull();
    expect(screen.queryByText('Mark arrived')).toBeNull();
    expect(screen.queryByText('Mark completed')).toBeNull();
  });
});
