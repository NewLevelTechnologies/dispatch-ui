import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import { useCurrentUser } from '../hooks/useCurrentUser';
import type { MyDayStop } from '../api/setup';
import MyDayPage from './MyDayPage';

const mockGetDay = vi.fn();
const mockUpdate = vi.fn();
const mockWorkOrder = vi.fn();
const mockWorkOrders = vi.fn();
const mockQuotes = vi.fn();
const mockStatuses = vi.fn();
const mockShowError = vi.fn();

vi.mock('../api/setup', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/setup')>();
  return {
    ...actual,
    myDayApi: { getDay: (...a: unknown[]) => mockGetDay(...a) },
    dispatchesApi: { ...actual.dispatchesApi, update: (...a: unknown[]) => mockUpdate(...a) },
    workOrderApi: {
      ...actual.workOrderApi,
      getById: (...a: unknown[]) => mockWorkOrder(...a),
      getAll: (...a: unknown[]) => mockWorkOrders(...a),
    },
    quotesApi: { ...actual.quotesApi, getAll: (...a: unknown[]) => mockQuotes(...a) },
    workItemStatusesApi: { ...actual.workItemStatusesApi, getAll: () => mockStatuses() },
    workOrderTypesApi: { ...actual.workOrderTypesApi, getAll: () => Promise.resolve([]) },
    tenantSettingsApi: {
      ...actual.tenantSettingsApi,
      getSettings: () => Promise.resolve({ timezone: 'America/Phoenix', phone: '(602) 555-0100' }),
    },
  };
});

vi.mock('@dispatch/api/src/client');

vi.mock('../lib/toast', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/toast')>();
  return { ...actual, showError: (...a: unknown[]) => mockShowError(...a) };
});

// Phoenix has no DST, so UTC-7 all year: 15:00Z is 8a.
const stop = (over: Partial<MyDayStop>): MyDayStop => ({
  dispatchId: 'd',
  seq: 1,
  status: 'SCHEDULED',
  arrivalWindowStart: '2026-10-21T15:00:00Z',
  arrivalWindowEnd: '2026-10-21T16:00:00Z',
  releasedAt: '2026-10-20T22:00:00Z',
  version: 3,
  estimatedDuration: 60,
  enRouteAt: null,
  arrivedAt: null,
  departedAt: null,
  driveMinFromPrev: null,
  workOrderId: 'wo',
  workOrderNumber: 'WO-1',
  workOrderSummary: 'Job',
  workOrderTypeId: null,
  priority: 'NORMAL',
  recurring: false,
  customerId: 'c1',
  customerName: 'Iverson Properties',
  serviceLocationId: 'l1',
  serviceLocationName: null,
  serviceLocationStreet: null,
  serviceLocationCity: 'PHOENIX',
  serviceLocationState: 'AZ',
  serviceLocationZip: null,
  latitude: null,
  longitude: null,
  ...over,
});

const MIDDAY: MyDayStop[] = [
  stop({
    dispatchId: 'd1', workOrderId: 'wo1', workOrderNumber: 'WO-4250', workOrderSummary: 'No heat — back office',
    status: 'COMPLETED', arrivedAt: '2026-10-21T14:58:00Z', departedAt: '2026-10-21T16:04:00Z',
  }),
  stop({
    dispatchId: 'd2', workOrderId: 'wo2', workOrderNumber: 'WO-4236', workOrderSummary: 'Fall PM — rooftop units',
    status: 'COMPLETED', arrivalWindowStart: '2026-10-21T16:30:00Z', arrivalWindowEnd: '2026-10-21T17:30:00Z',
    arrivedAt: '2026-10-21T16:27:00Z', departedAt: '2026-10-21T17:21:00Z', recurring: true,
  }),
  stop({
    dispatchId: 'd3', workOrderId: 'wo3', workOrderNumber: 'WO-4203', workOrderSummary: 'No AC — server room',
    status: 'IN_PROGRESS', arrivalWindowStart: '2026-10-21T17:30:00Z', arrivalWindowEnd: '2026-10-21T19:00:00Z',
    arrivedAt: '2026-10-21T17:42:00Z', priority: 'URGENT', serviceLocationName: 'Headquarters',
    serviceLocationStreet: '1820 W MCDOWELL RD', serviceLocationZip: '85007',
  }),
  stop({
    dispatchId: 'd4', workOrderId: 'wo4', workOrderNumber: 'WO-4251', workOrderSummary: 'Capacitor replacement',
    arrivalWindowStart: '2026-10-21T20:00:00Z', arrivalWindowEnd: '2026-10-21T21:30:00Z',
    priority: 'HIGH', driveMinFromPrev: 12, recurring: true,
  }),
];

const TECH_CAPS = ['VIEW_ASSIGNED_WORK_ORDERS', 'EDIT_ASSIGNED_WORK_ORDERS'];

function serve(today: MyDayStop[], tomorrow: MyDayStop[] = []) {
  mockGetDay.mockImplementation((date?: string) =>
    Promise.resolve(
      date
        ? { date, timeZone: 'America/Phoenix', stops: tomorrow }
        : { date: '2026-10-21', timeZone: 'America/Phoenix', stops: today },
    ),
  );
}

describe('MyDayPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useCurrentUser).mockReturnValue({
      data: { id: 'tech-1', firstName: 'Daniel', lastName: 'Park', capabilities: TECH_CAPS },
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useCurrentUser>);
    serve(MIDDAY);
    mockWorkOrder.mockResolvedValue({
      id: 'wo3',
      customer: { id: 'c1', name: 'Iverson Properties', phone: '(602) 555-0142' },
      serviceLocation: {
        id: 'l1',
        address: { streetAddress: 'SHOULD NOT BE USED', city: 'X', state: 'AZ', zipCode: '0' },
        siteContactName: 'Tom Reyes',
        siteContactPhone: '(602) 555-0199',
      },
      equip: { label: 'Carrier 38AUZ — RTU-2', count: 1 },
    });
    mockWorkOrders.mockResolvedValue({ content: [], totalElements: 0 });
    mockQuotes.mockResolvedValue({ content: [] });
    mockStatuses.mockResolvedValue([]);
  });

  it('reads today without sending a date, then tomorrow by the day the server named', async () => {
    renderWithProviders(<MyDayPage />);
    expect(await screen.findByRole('heading', { level: 1, name: /Daniel$/ })).toBeInTheDocument();
    expect(mockGetDay).toHaveBeenCalledWith(undefined);
    await waitFor(() => expect(mockGetDay).toHaveBeenCalledWith('2026-10-22'));
    expect(await screen.findByText(/Wednesday, October 21/)).toBeInTheDocument();
  });

  it('focuses the live stop with the released address, priority and the site contact', async () => {
    renderWithProviders(<MyDayPage />);
    const focus = await screen.findByRole('region', { name: 'Current stop' });
    expect(within(focus).getByText('On site · since 10:42a')).toBeInTheDocument();
    expect(within(focus).getByText('Urgent')).toBeInTheDocument();
    expect(within(focus).getByText(/Headquarters/)).toBeInTheDocument();
    expect(within(focus).getByText('1820 W Mcdowell Rd, Phoenix')).toBeInTheDocument();
    expect(within(focus).getByRole('link', { name: /Navigate/ }).getAttribute('href')).toContain(
      encodeURIComponent('1820 W MCDOWELL RD, PHOENIX, AZ, 85007'),
    );
    expect(await within(focus).findByRole('link', { name: /Call Tom/ })).toHaveAttribute('href', 'tel:6025550199');
  });

  it('collapses completed stops and marks the rest with drive time, priority and agreement', async () => {
    renderWithProviders(<MyDayPage />);
    const toggle = await screen.findByRole('button', { name: /2 completed stops · 7:58a – 10:21a/ });
    expect(screen.queryByText('No heat — back office')).not.toBeInTheDocument();

    const next = screen.getByText('Capacitor replacement').closest('a')!;
    expect(within(next).getByText('12 min drive')).toBeInTheDocument();
    expect(within(next).getByText('High')).toBeInTheDocument();
    expect(within(next).getByText('Agreement')).toBeInTheDocument();

    await userEvent.click(toggle);
    expect(screen.getByText('No heat — back office')).toBeInTheDocument();
  });

  it('hands "Complete visit" to the work order instead of flipping the status', async () => {
    const { router } = renderWithProviders(<MyDayPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Complete visit' }));
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(router.state.location.pathname).toBe('/work-orders/wo3');
    expect(router.state.location.search).toBe('?tab=trips');
  });

  it('starts the first stop of the morning with a version-guarded status write', async () => {
    serve(MIDDAY.map((s) => ({ ...s, status: 'SCHEDULED' as const, arrivedAt: null, departedAt: null })));
    mockUpdate.mockResolvedValue({});
    renderWithProviders(<MyDayPage />);
    const focus = await screen.findByRole('region', { name: 'Current stop' });
    expect(within(focus).getByText('Up next')).toBeInTheDocument();
    await userEvent.click(within(focus).getByRole('button', { name: 'Start driving' }));
    expect(mockUpdate).toHaveBeenCalledWith('d1', { status: 'EN_ROUTE', version: 3 });
  });

  it('says the office changed the job when a status write 404s on a pending removal', async () => {
    serve([stop({ dispatchId: 'gone', version: null })]);
    mockUpdate.mockRejectedValue(Object.assign(new Error('Not found'), { response: { status: 404, data: {} } }));
    renderWithProviders(<MyDayPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Start driving' }));
    expect(mockUpdate).toHaveBeenCalledWith('gone', { status: 'EN_ROUTE' });
    await waitFor(() => expect(mockShowError).toHaveBeenCalledWith('myDay.errors.changed'));
  });

  it('replaces the focus card with a quiet summary when the day is done', async () => {
    serve(MIDDAY.slice(0, 2));
    renderWithProviders(<MyDayPage />);
    expect(await screen.findByText('Day complete')).toBeInTheDocument();
    expect(screen.getByText(/2 of 2 stops completed/)).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Current stop' })).not.toBeInTheDocument();
    // Fully expanded — nothing left to collapse behind.
    expect(screen.getByText('No heat — back office')).toBeInTheDocument();
  });

  it('shows an empty day with a way to reach dispatch', async () => {
    serve([]);
    renderWithProviders(<MyDayPage />);
    expect(await screen.findByText('No stops today')).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: /Call dispatch/ })).toHaveAttribute('href', 'tel:6025550100');
  });

  it('lists carry-over that is not already on today’s route', async () => {
    mockStatuses.mockResolvedValue([{ id: 'st-parts', code: 'PENDING_PARTS', name: 'Pending parts', isActive: true }]);
    mockWorkOrders.mockResolvedValue({
      content: [
        { id: 'wo4', workOrderNumber: 'WO-4251', summary: 'Capacitor replacement' },
        { id: 'wo8', workOrderNumber: 'WO-4248', summary: 'Refrigerant leak', customer: { id: 'c', name: 'Lena Ortiz' } },
      ],
    });
    mockQuotes.mockResolvedValue({
      content: [{ id: 'q1', quoteNumber: 'Q-1182', title: null, customerName: 'Iverson', totalAmount: 2340, lastSentAt: null }],
    });
    renderWithProviders(<MyDayPage />);
    expect(await screen.findByText('Unfinished')).toBeInTheDocument();
    expect(await screen.findByText('WO-4248')).toBeInTheDocument();
    expect(screen.getByText('Q-1182')).toBeInTheDocument();
    expect(mockWorkOrders).toHaveBeenCalledWith(
      expect.objectContaining({ assignedUserId: 'tech-1', workItemStatusIds: ['st-parts'] }),
    );
    expect(mockQuotes).toHaveBeenCalledWith(expect.objectContaining({ status: ['SENT'], createdByUserId: 'tech-1' }));
  });

  it('gives a technician the trimmed field nav', async () => {
    renderWithProviders(<MyDayPage />, { initialPath: '/my-day' });
    await screen.findByRole('region', { name: 'Current stop' });
    expect(screen.getAllByRole('link', { name: 'My day' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: /My work orders/i }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('link', { name: 'Customers' })).not.toBeInTheDocument();
  });
});
