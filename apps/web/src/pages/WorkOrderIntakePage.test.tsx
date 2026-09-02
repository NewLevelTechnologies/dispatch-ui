import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import type { RouteObject } from 'react-router-dom';
import { renderWithProviders, userEvent } from '../test/utils';
import WorkOrderIntakePage from './WorkOrderIntakePage';
import { HEAVY_FORM_TIMEOUT } from '../test/timeouts';

const mockCreateWorkOrder = vi.fn();
const mockCreateCustomer = vi.fn();
const mockGetServiceLocationById = vi.fn();
const mockGetCustomerById = vi.fn();
const mockTypesGetAll = vi.fn();
const mockDivisionsGetAll = vi.fn();
const mockRegionsGetAll = vi.fn();
const mockEquipmentList = vi.fn();
const mockSearchCustomers = vi.fn();
const mockAddServiceLocation = vi.fn();
const mockVerifyAddress = vi.fn();

vi.mock('../api/setup', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/setup')>();
  return {
    ...actual,
    workOrderApi: { ...actual.workOrderApi, create: (...a: unknown[]) => mockCreateWorkOrder(...a) },
    workOrderTypesApi: { ...actual.workOrderTypesApi, getAll: (...a: unknown[]) => mockTypesGetAll(...a) },
    divisionsApi: { ...actual.divisionsApi, getAll: (...a: unknown[]) => mockDivisionsGetAll(...a) },
    dispatchRegionApi: { ...actual.dispatchRegionApi, getAll: (...a: unknown[]) => mockRegionsGetAll(...a) },
    customerApi: {
      ...actual.customerApi,
      create: (...a: unknown[]) => mockCreateCustomer(...a),
      getServiceLocationById: (...a: unknown[]) => mockGetServiceLocationById(...a),
      getById: (...a: unknown[]) => mockGetCustomerById(...a),
      searchServiceLocations: () => Promise.resolve({ content: [], totalElements: 0, totalPages: 0, size: 50, number: 0 }),
      getServiceLocations: () => Promise.resolve([]),
      search: (...a: unknown[]) => mockSearchCustomers(...a),
      addServiceLocation: (...a: unknown[]) => mockAddServiceLocation(...a),
      verifyAddress: (...a: unknown[]) => mockVerifyAddress(...a),
    },
    equipmentApi: { ...actual.equipmentApi, list: (...a: unknown[]) => mockEquipmentList(...a) },
    tenantSettingsApi: { ...actual.tenantSettingsApi, getSettings: () => Promise.resolve({ defaultPremiseType: 'BUSINESS' }) },
  };
});

// The mock above spreads the real api modules, so anything not overridden above
// still reaches the HTTP client. Stub it out so no test hits the network.
vi.mock('@dispatch/api/src/client');

const locationDetail = {
  id: 'loc-1',
  customerId: 'cust-1',
  customerName: 'Reyes Household',
  premiseType: 'RESIDENCE',
  dispatchRegionId: 'r-1',
  locationName: 'Reyes Residence',
  address: { streetAddress: '4821 E INDIAN SCHOOL RD', city: 'PHOENIX', state: 'AZ', zipCode: '85018' },
  additionalContacts: [],
  notes: [{ id: 'n1', body: 'Dog in the yard.', pinned: true, authorName: null, createdAt: '', updatedAt: '' }],
  arrivalFacts: [{ id: 'f1', label: 'Gate', value: '#4821', mono: true, multiline: false, authorName: null, authorUserId: null, displayOrder: 0, createdAt: '', updatedAt: '' }],
  status: 'ACTIVE' as const,
  createdAt: '',
  updatedAt: '',
  version: 1,
};

function renderIntake(initialPath = '/work-orders/new') {
  const routes: RouteObject[] = [
    { path: '/work-orders/new', element: <WorkOrderIntakePage /> },
    // eslint-disable-next-line i18next/no-literal-string
    { path: '*', element: <div>Elsewhere</div> },
  ];
  return renderWithProviders(<WorkOrderIntakePage />, { routes, initialPath });
}

describe('WorkOrderIntakePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTypesGetAll.mockResolvedValue([{ id: 'type-1', name: 'Service Call', isActive: true, sortOrder: 0 }]);
    mockDivisionsGetAll.mockResolvedValue([{ id: 'div-1', name: 'HVAC', isActive: true, sortOrder: 0 }]);
    mockRegionsGetAll.mockResolvedValue([]);
    mockGetServiceLocationById.mockResolvedValue(locationDetail);
    mockGetCustomerById.mockResolvedValue({ id: 'cust-1', name: 'Reyes Household' });
    mockEquipmentList.mockResolvedValue({ content: [], totalElements: 0, totalPages: 0, number: 0, size: 200 });
    mockCreateWorkOrder.mockResolvedValue({ id: 'wo-new' });
    mockCreateCustomer.mockResolvedValue({
      id: 'cust-new',
      name: 'Jordan Avila',
      serviceLocations: [{ id: 'loc-new', locationName: 'Jordan Avila' }],
    });
    mockSearchCustomers.mockResolvedValue({ content: [], totalElements: 0, totalPages: 0, size: 5, number: 0 });
    mockAddServiceLocation.mockResolvedValue({ id: 'loc-added' });
    // Quiet by default: located, nothing to suggest, no coordinates.
    mockVerifyAddress.mockResolvedValue({
      located: true,
      suggestedSingleLine: null,
      latitude: null,
      longitude: null,
      timeZone: null,
    });
  });

  it('renders the intake form with the location picker, classification and one work-item draft', async () => {
    renderIntake();
    expect(await screen.findByRole('heading', { name: /add work order/i, level: 1 })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/search by customer/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Type')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/no cooling upstairs/i)).toBeInTheDocument();
  });

  it('tints the selected priority with the tone that value carries elsewhere', async () => {
    const user = userEvent.setup();
    renderIntake();
    await screen.findByRole('heading', { name: /add work order/i, level: 1 });

    // Normal is the default, so it starts as the toned (info) selection.
    expect(screen.getByRole('radio', { name: 'Normal' })).toHaveAttribute('data-checked');
    expect(screen.getByRole('radio', { name: 'Normal' })).toHaveAttribute('data-tone', 'info');

    // Escalating repaints the control red rather than just moving the highlight.
    await user.click(screen.getByRole('radio', { name: 'Urgent' }));
    const urgent = screen.getByRole('radio', { name: 'Urgent' });
    expect(urgent).toHaveAttribute('data-checked');
    expect(urgent).toHaveAttribute('data-tone', 'danger');
    expect(screen.getByRole('radio', { name: 'Normal' })).not.toHaveAttribute('data-checked');
  });

  it('adds a new property to an existing account without creating a second customer', { timeout: HEAVY_FORM_TIMEOUT }, async () => {
    // Reality 2: the CUSTOMER is on file, this property isn't. Before the
    // search-first picker there was no path to this at all — a CSR would reach
    // for "New customer" and end up with a duplicate account.
    mockRegionsGetAll.mockResolvedValue([{ id: 'r-1', name: 'West' }]);
    mockSearchCustomers.mockResolvedValue({
      content: [{ id: 'cust-darden', name: 'Darden Restaurants', type: 'STANDARD', category: 'COMMERCIAL' }],
      totalElements: 1,
      totalPages: 1,
      size: 5,
      number: 0,
    });
    const user = userEvent.setup();
    renderIntake();
    await screen.findByRole('heading', { name: /add work order/i, level: 1 });
    await screen.findByRole('option', { name: 'Service Call' });

    // The account surfaces as its own result, carrying the "+ New location" affordance.
    await user.type(screen.getByPlaceholderText(/search by customer/i), 'Darden');
    await screen.findByText('Darden Restaurants');
    await user.click(screen.getByText('+ New location'));

    // The account is known, so the form asks for the address only — never the
    // customer's name, phone or email again.
    // The account card identifies the account now, not the heading — and it
    // says the account already exists, which is the anti-duplicate signal.
    expect(screen.getByText(/Existing customer/)).toBeInTheDocument();
    expect(screen.getAllByText('Darden Restaurants').length).toBeGreaterThan(0);
    expect(screen.queryByLabelText(/^phone/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^email/i)).not.toBeInTheDocument();

    // Name first and required — same rule as the Add Location page.
    await user.type(screen.getByLabelText(/location name/i), 'Red Lobster #123');
    await user.type(screen.getByLabelText(/street address/i), '2290 W Chandler Blvd');
    await user.type(screen.getByLabelText(/^city/i), 'Chandler');
    await user.type(screen.getByLabelText(/^state/i), 'AZ');
    await user.type(screen.getByLabelText(/^zip/i), '85224');
    // Staging collapses the panel and writes NOTHING — intake has no
    // server-side draft, so an abandoned call leaves no record behind.
    await user.click(screen.getByRole('button', { name: /use this location/i }));
    expect(mockAddServiceLocation).not.toHaveBeenCalled();
    expect(screen.getAllByText('Red Lobster #123').length).toBeGreaterThan(0);

    await user.selectOptions(screen.getByLabelText('Type'), 'type-1');
    await user.type(screen.getByPlaceholderText(/no cooling upstairs/i), 'Walk-in down');
    await user.click(screen.getByRole('button', { name: /add work order/i }));

    // One transaction on submit: the location, then the job against it.
    await waitFor(() =>
      expect(mockAddServiceLocation).toHaveBeenCalledWith(
        'cust-darden',
        expect.objectContaining({
          locationName: 'Red Lobster #123',
          dispatchRegionId: 'r-1',
          address: expect.objectContaining({ streetAddress: '2290 W Chandler Blvd' }),
        })
      )
    );
    // The whole point: the account was reused, not duplicated.
    expect(mockCreateCustomer).not.toHaveBeenCalled();
    expect(mockAddServiceLocation).toHaveBeenCalledTimes(1);

    await waitFor(() =>
      expect(mockCreateWorkOrder).toHaveBeenCalledWith(
        expect.objectContaining({ customerId: 'cust-darden', serviceLocationId: 'loc-added' })
      )
    );
  });

  it('accepts a new customer with only one contact channel', { timeout: HEAVY_FORM_TIMEOUT }, async () => {
    // Neither phone nor email is required on its own — having none is what's
    // invalid. The old panel demanded both.
    mockRegionsGetAll.mockResolvedValue([{ id: 'r-1', name: 'West' }]);
    const user = userEvent.setup();
    renderIntake();
    await screen.findByRole('heading', { name: /add work order/i, level: 1 });
    await screen.findByRole('option', { name: 'Service Call' });

    await user.click(screen.getByRole('button', { name: /new customer/i }));
    await user.type(screen.getByLabelText(/location name/i), 'Jordan Avila');
    await user.type(screen.getByLabelText(/^email/i), 'jordan@example.com');
    await user.type(screen.getByLabelText(/street address/i), '123 Main St');
    await user.type(screen.getByLabelText(/^city/i), 'Phoenix');
    await user.type(screen.getByLabelText(/^state/i), 'AZ');
    await user.type(screen.getByLabelText(/^zip/i), '85001');
    await user.selectOptions(screen.getByLabelText('Type'), 'type-1');
    await user.type(screen.getByPlaceholderText(/no cooling upstairs/i), 'No heat');

    await user.click(screen.getByRole('button', { name: /use this customer/i }));
    expect(mockCreateCustomer).not.toHaveBeenCalled();

    await user.selectOptions(screen.getByLabelText('Type'), 'type-1');
    await user.type(screen.getByPlaceholderText(/no cooling upstairs/i), 'No heat');
    await user.click(screen.getByRole('button', { name: /add work order/i }));

    await waitFor(() =>
      expect(mockCreateCustomer).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'jordan@example.com', phone: null })
      )
    );
  });

  it('routes the bill-to name onto the customer when someone else is invoiced', { timeout: HEAVY_FORM_TIMEOUT }, async () => {
    // Unchecking "Bill this customer directly" re-points the record: the payer
    // becomes the customer and the typed name demotes to the location, taking
    // the on-site contact with it.
    mockRegionsGetAll.mockResolvedValue([{ id: 'r-1', name: 'West' }]);
    const user = userEvent.setup();
    renderIntake();
    await screen.findByRole('heading', { name: /add work order/i, level: 1 });
    await screen.findByRole('option', { name: 'Service Call' });

    await user.click(screen.getByRole('button', { name: /new customer/i }));
    await user.type(screen.getByLabelText(/location name/i), 'Red Lobster #123');
    await user.type(screen.getByLabelText(/^phone/i), '6025550100');
    await user.type(screen.getByLabelText(/street address/i), '2290 W Chandler Blvd');
    await user.type(screen.getByLabelText(/^city/i), 'Chandler');
    await user.type(screen.getByLabelText(/^state/i), 'AZ');
    await user.type(screen.getByLabelText(/^zip/i), '85224');

    await user.click(screen.getByRole('checkbox', { name: /bill this customer directly/i }));
    const billTo = screen.getByLabelText(/bill to/i);
    await user.clear(billTo);
    await user.type(billTo, 'Darden Restaurants');
    await user.type(screen.getByLabelText(/billing street address/i), '1000 Darden Center Dr');
    // City/State/ZIP appear twice once billing splits off — the billing copies
    // are the last of each.
    const cities = screen.getAllByLabelText(/^city/i);
    await user.type(cities[cities.length - 1], 'Orlando');
    const states = screen.getAllByLabelText(/^state/i);
    await user.type(states[states.length - 1], 'FL');
    const zips = screen.getAllByLabelText(/^zip/i);
    await user.type(zips[zips.length - 1], '32837');
    await user.type(screen.getByLabelText(/billing email/i), 'ap@darden.com');

    await user.click(screen.getByRole('button', { name: /use this customer/i }));
    await user.selectOptions(screen.getByLabelText('Type'), 'type-1');
    await user.type(screen.getByPlaceholderText(/no cooling upstairs/i), 'Walk-in down');
    await user.click(screen.getByRole('button', { name: /add work order/i }));

    await waitFor(() =>
      expect(mockCreateCustomer).toHaveBeenCalledWith(
        expect.objectContaining({
          // The payer is the customer…
          name: 'Darden Restaurants',
          email: 'ap@darden.com',
          billingAddressSameAsService: false,
          // The invoice goes to the payer's AP address, NOT the job site.
          billingAddress: expect.objectContaining({ streetAddress: '1000 Darden Center Dr', city: 'Orlando' }),
          // …and the typed name names the site, keeping the on-site phone.
          serviceLocations: [
            expect.objectContaining({ locationName: 'Red Lobster #123', siteContactPhone: '6025550100' }),
          ],
        })
      )
    );
  });

  it('names who is billed only when that differs from the site', async () => {
    // Named for someone else — the CSR needs to know Reyes Household pays for
    // work at "Reyes Residence".
    renderIntake('/work-orders/new?locationId=loc-1');
    await screen.findByRole('heading', { name: /add work order/i, level: 1 });
    await waitFor(() => expect(screen.getByText('billed')).toBeInTheDocument());
    expect(screen.getByText('Reyes Household')).toBeInTheDocument();
  });

  it('omits the billed line when the site is named for its own customer', async () => {
    // Unnamed location, so the rail headline already IS the customer. Repeating
    // it as "X billed" only asks the CSR to check that the two match.
    mockGetServiceLocationById.mockResolvedValue({ ...locationDetail, locationName: null });
    renderIntake('/work-orders/new?locationId=loc-1');
    await screen.findByRole('heading', { name: /add work order/i, level: 1 });
    await waitFor(() => expect(screen.getAllByText('Reyes Household').length).toBeGreaterThan(0));
    expect(screen.queryByText('billed')).not.toBeInTheDocument();
  });

  it('keeps the create button disabled until a location, type and a complaint are present', async () => {
    const user = userEvent.setup();
    renderIntake('/work-orders/new?locationId=loc-1');
    await screen.findByRole('heading', { name: /add work order/i, level: 1 });
    // Location is prefilled; still need a type + a complaint.
    const createBtn = screen.getByRole('button', { name: /add work order/i });
    expect(createBtn).toBeDisabled();

    await screen.findByRole('option', { name: 'Service Call' });
    await user.selectOptions(screen.getByLabelText('Type'), 'type-1');
    await user.type(screen.getByPlaceholderText(/no cooling upstairs/i), 'No cooling upstairs');
    expect(createBtn).toBeEnabled();
  });

  it('submits an atomic create with the derived customer + items and routes to the new detail', async () => {
    const user = userEvent.setup();
    const { router } = renderIntake('/work-orders/new?locationId=loc-1');
    await screen.findByRole('heading', { name: /add work order/i, level: 1 });
    await screen.findByRole('option', { name: 'Service Call' });

    await user.selectOptions(screen.getByLabelText('Type'), 'type-1');
    await user.type(screen.getByPlaceholderText(/no cooling upstairs/i), 'No cooling upstairs');
    await user.click(screen.getByRole('button', { name: /add work order/i }));

    await waitFor(() =>
      expect(mockCreateWorkOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          customerId: 'cust-1',
          serviceLocationId: 'loc-1',
          workOrderTypeId: 'type-1',
          workItems: [expect.objectContaining({ description: 'No cooling upstairs' })],
        })
      )
    );
    await waitFor(() => expect(router.state.location.pathname).toBe('/work-orders/wo-new'));
  });

  it('adds and removes work-item drafts', async () => {
    const user = userEvent.setup();
    renderIntake();
    await screen.findByRole('heading', { name: /add work order/i, level: 1 });
    expect(screen.getAllByPlaceholderText(/no cooling upstairs/i)).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: /add work item/i }));
    expect(screen.getAllByPlaceholderText(/no cooling upstairs/i)).toHaveLength(2);

    await user.click(screen.getAllByRole('button', { name: /remove work item/i })[0]);
    expect(screen.getAllByPlaceholderText(/no cooling upstairs/i)).toHaveLength(1);
  });

  // Types a whole customer + address through userEvent, so it runs ~2.5s under
  // v8 coverage instrumentation and overran the 5s default in CI's coverage job.
  it('creates the customer first in new-customer mode, then the work order', { timeout: HEAVY_FORM_TIMEOUT }, async () => {
    // A single region auto-selects, satisfying the required region field.
    mockRegionsGetAll.mockResolvedValue([{ id: 'r-1', name: 'West' }]);
    const user = userEvent.setup();
    const { router } = renderIntake();
    await screen.findByRole('heading', { name: /add work order/i, level: 1 });
    await screen.findByRole('option', { name: 'Service Call' });

    // Reality 3 is reached from the picker's footer, not a mode toggle.
    await user.click(screen.getByRole('button', { name: /new customer/i }));
    // ONE name — no separate "location name" over-ask.
    await user.type(screen.getByLabelText(/location name/i), 'Jordan Avila');
    await user.type(screen.getByLabelText(/^phone/i), '6025550100');
    await user.type(screen.getByLabelText(/^email/i), 'jordan@example.com');
    await user.type(screen.getByLabelText(/street address/i), '123 Main St');
    await user.type(screen.getByLabelText(/^city/i), 'Phoenix');
    await user.type(screen.getByLabelText(/^state/i), 'AZ');
    await user.type(screen.getByLabelText(/^zip/i), '85001');
    await user.click(screen.getByRole('button', { name: /use this customer/i }));
    // Nothing written yet — one transaction on job submit.
    expect(mockCreateCustomer).not.toHaveBeenCalled();

    await user.selectOptions(screen.getByLabelText('Type'), 'type-1');
    await user.type(screen.getByPlaceholderText(/no cooling upstairs/i), 'No heat');
    await user.click(screen.getByRole('button', { name: /add work order/i }));

    // One name seeds both the customer and its first location.
    await waitFor(() =>
      expect(mockCreateCustomer).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Jordan Avila',
          serviceLocations: [expect.objectContaining({ locationName: 'Jordan Avila' })],
        })
      )
    );
    await waitFor(() =>
      expect(mockCreateWorkOrder).toHaveBeenCalledWith(
        expect.objectContaining({ customerId: 'cust-new', serviceLocationId: 'loc-new' })
      )
    );
    await waitFor(() => expect(router.state.location.pathname).toBe('/work-orders/wo-new'));
  });

  it('offers the standardized address and saves the coordinates it geocoded', { timeout: HEAVY_FORM_TIMEOUT }, async () => {
    mockRegionsGetAll.mockResolvedValue([{ id: 'r-1', name: 'West' }]);
    mockVerifyAddress.mockResolvedValue({
      located: true,
      suggestedSingleLine: '123 W MAIN ST, PHOENIX, AZ, 85001',
      latitude: 33.4484,
      longitude: -112.074,
      timeZone: 'America/Phoenix',
    });
    const user = userEvent.setup();
    renderIntake();
    await screen.findByRole('heading', { name: /add work order/i, level: 1 });
    await screen.findByRole('option', { name: 'Service Call' });

    await user.click(screen.getByRole('button', { name: /new customer/i }));
    await user.type(screen.getByLabelText(/location name/i), 'Jordan Avila');
    await user.type(screen.getByLabelText(/^phone/i), '6025550100');
    await user.type(screen.getByLabelText(/street address/i), '123 Main St');
    await user.type(screen.getByLabelText(/^city/i), 'Phoenix');
    await user.type(screen.getByLabelText(/^state/i), 'AZ');
    await user.type(screen.getByLabelText(/^zip/i), '85001');
    // Nothing is asked of the geocoder until the address is complete AND the
    // CSR has left the field — never as they type.
    expect(mockVerifyAddress).not.toHaveBeenCalled();
    await user.tab();

    // Offered, not forced: the CSR can take it or keep what they typed.
    await screen.findByText('123 W MAIN ST, PHOENIX, AZ, 85001');
    await user.click(screen.getByRole('button', { name: 'Use this' }));
    expect(screen.getByLabelText(/street address/i)).toHaveValue('123 W MAIN ST');

    await user.click(screen.getByRole('button', { name: /use this customer/i }));
    await user.selectOptions(screen.getByLabelText('Type'), 'type-1');
    await user.type(screen.getByPlaceholderText(/no cooling upstairs/i), 'No heat');
    await user.click(screen.getByRole('button', { name: /add work order/i }));

    // The coordinates ride along on the create, so the site has a map pin the
    // moment it exists rather than after the server's async backfill.
    await waitFor(() =>
      expect(mockCreateCustomer).toHaveBeenCalledWith(
        expect.objectContaining({
          serviceLocations: [
            expect.objectContaining({
              address: expect.objectContaining({ latitude: 33.4484, longitude: -112.074 }),
            }),
          ],
        })
      )
    );
  });
});
