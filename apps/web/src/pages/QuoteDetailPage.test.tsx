/* eslint-disable i18next/no-literal-string -- route placeholders + assertion strings in a test fixture. */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import QuoteDetailPage from './QuoteDetailPage';
import { apiClient, type Quote } from '../api/setup';

vi.mock('@dispatch/api/src/client');

const member = { sourceType: 'AGREEMENT' as const, sourceId: 'agr-1', sourceLabel: 'Comfort Club', reasonCode: 'MEMBER' as const };
const audit = { reasonNote: null, createdByUserId: null, createdAt: '2026-10-07T15:00:00Z' };

// Trip fee waived for members, 15% member labor discount, a $12 goodwill
// document discount spread over the two lines still carrying money.
const quote: Quote = {
  id: 'q-1',
  customerId: 'cust-1',
  customerName: 'Tanya Reyes',
  workOrderId: 'wo-1',
  serviceLocationId: 'loc-1',
  customerPoNumber: 'PO-77',
  quoteNumber: 'Q-1882',
  status: 'SENT',
  revision: 2,
  version: 7,
  pricingModel: 'ENGINE',
  quoteDate: '2026-10-07',
  expirationDate: '2026-11-06',
  grossSubtotal: 382.2,
  adjustmentTotal: 138.5,
  subtotal: 243.7,
  taxRate: 0,
  taxAmount: 3.54,
  totalAmount: 247.24,
  ratePlanName: 'Standard',
  tax: { jurisdictionId: 'j-1', jurisdictionName: 'Phoenix, AZ', jurisdictionRate: 0.086, exempt: false, exemptCertificate: null },
  warnings: [],
  adjustments: [
    { id: 'a1', lineId: 'l1', kind: 'WAIVE', value: null, computedAmount: 89, ...member, ...audit },
    { id: 'a2', lineId: 'l2', kind: 'PERCENT', value: 0.15, computedAmount: 37.5, ...member, ...audit },
    { id: 'a3', lineId: null, kind: 'AMOUNT', value: 12, reasonCode: 'GOODWILL', sourceType: 'MANUAL', computedAmount: 12, ...audit },
  ],
  lineItems: [
    // Out of order on purpose: the page sorts by sortOrder.
    {
      id: 'l3', sortOrder: 2, type: 'MATERIAL', description: 'Capacitor 45/5', itemId: 'it-3', itemSku: 'CAP-455',
      quantity: 1, unit: 'ea', unitPrice: 43.2, catalogUnitPrice: 48, pricingRule: 'PRICE_MULTIPLIER', pricingRuleValue: 0.9,
      lineTotal: 43.2, adjustmentAmount: 2, netAmount: 41.2, taxClass: 'MATERIALS', taxable: true, taxRate: 0.086, taxAmount: 3.54, unitCost: 18.75,
    },
    {
      id: 'l1', sortOrder: 0, type: 'FEE', description: 'Trip charge', itemId: 'it-1', itemSku: 'FEE-TRIP', feeRole: 'TRIP',
      quantity: 1, unit: 'ea', unitPrice: 89, lineTotal: 89, adjustmentAmount: 89, netAmount: 0, taxClass: 'FEE', taxable: false, unitCost: null,
    },
    {
      id: 'l2', sortOrder: 1, type: 'LABOR', description: 'Regular', laborRateTypeId: 'rt-1', laborRateTypeName: 'Regular',
      quantity: 2, unit: 'hr', unitPrice: 125, lineTotal: 250, adjustmentAmount: 47.5, netAmount: 202.5, taxClass: 'LABOR', taxable: false, unitCost: 48,
    },
  ],
  notes: 'Upstairs unit only.',
  firstSentAt: '2026-10-08T16:00:00Z',
  decidedAt: null,
  firstViewedAt: null,
  lastSentAt: '2026-10-08T16:00:00Z',
  lastSentToEmails: 'tanya@example.com',
  createdAt: '2026-10-07T15:00:00Z',
  updatedAt: '2026-10-08T16:00:00Z',
};

const customer = { id: 'cust-1', name: 'Tanya Reyes', email: 'tanya@example.com', type: 'STANDARD', paymentTermsDays: 0 };
const workOrder = {
  id: 'wo-1',
  workOrderNumber: 'WO-3892',
  summary: 'AC not cooling, upstairs',
  notToExceed: null,
  serviceLocation: {
    id: 'loc-1',
    locationName: null,
    address: { streetAddress: '4821 E INDIAN SCHOOL RD', city: 'PHOENIX', state: 'AZ', zipCode: '85018' },
  },
};

function mockApi(doc: Quote) {
  vi.mocked(apiClient.get).mockImplementation((url: string) => {
    if (url === '/financial/quotes/q-1') return Promise.resolve({ data: doc });
    if (url === '/customers/cust-1') return Promise.resolve({ data: customer });
    if (url === '/work-orders/wo-1') return Promise.resolve({ data: workOrder });
    return Promise.reject(new Error(`unexpected GET ${url}`));
  });
}

const routes = [
  { path: '/quotes/:id', element: <QuoteDetailPage /> },
  { path: '/work-orders/:id', element: <div>WO page</div> },
];
const renderPage = () => renderWithProviders(<div />, { routes, initialPath: '/quotes/q-1' });

describe('QuoteDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi(quote);
  });

  it('leads with who pays, where, and what the quote comes to', async () => {
    renderPage();

    expect(await screen.findByText('Q-1882')).toBeInTheDocument();
    expect(screen.getByText('Rev 2')).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Tanya Reyes' })).toHaveAttribute('href', '/customers/cust-1');
    expect(screen.getByText('Due on receipt · tanya@example.com')).toBeInTheDocument();
    // Location from the work order, title-cased.
    expect(await screen.findByRole('link', { name: '4821 E Indian School Rd' })).toHaveAttribute('href', '/service-locations/loc-1');
    expect(screen.getByText('PO-77')).toBeInTheDocument();
    expect(screen.getByText('Comfort Club')).toBeInTheDocument();
    expect(screen.getAllByText('$247.24').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('Expires Nov 6, 2026')).toBeInTheDocument();
    expect(screen.getByText('Includes $126.50 member savings')).toBeInTheDocument();
    // Back to the job it belongs to.
    expect(screen.getByRole('link', { name: /WO-3892 · AC not cooling/ })).toHaveAttribute('href', '/work-orders/wo-1');
  });

  it('shows each line priced as the server returned it, in sortOrder', async () => {
    renderPage();
    await screen.findByText('Q-1882');

    const rows = screen.getAllByRole('row').slice(1);
    expect(rows.map((r) => within(r).queryByText(/^(Trip charge|Regular|Capacitor 45\/5)$/)?.textContent)).toEqual([
      'Trip charge',
      'Regular',
      'Capacitor 45/5',
    ]);

    const [trip, labor, part] = rows;
    expect(within(trip).getByText('FEE-TRIP')).toBeInTheDocument();
    expect(within(trip).getByText('Waived · Comfort Club member')).toBeInTheDocument();
    expect(within(trip).getByText('Not taxed')).toBeInTheDocument();

    expect(within(labor).getByText('Labor · Regular')).toBeInTheDocument();
    expect(within(labor).getByText('−15% · Comfort Club member')).toBeInTheDocument();
    // Its share of the document discount = adjustmentAmount − its own adjustments.
    expect(within(labor).getByText('Doc discount −$10.00')).toBeInTheDocument();
    expect(within(labor).getByText('$250.00')).toHaveClass('line-through');
    expect(within(labor).getByText('$202.50')).toBeInTheDocument();

    // What the rate plan did: list price and the multiplier.
    expect(within(part).getByText('list $48.00 · × 0.9 · plan')).toBeInTheDocument();
    expect(within(part).getByText('8.6% · $3.54')).toBeInTheDocument();
  });

  it('totals: gross subtotal, savings by reason, the spread document discount, per-jurisdiction tax', async () => {
    renderPage();
    await screen.findByText('Q-1882');

    expect(screen.getByText('$382.20')).toBeInTheDocument();
    expect(screen.getByText('Comfort Club member')).toBeInTheDocument();
    expect(screen.getByText('−$126.50')).toBeInTheDocument();
    expect(screen.getByText('Document discount · Goodwill')).toBeInTheDocument();
    expect(screen.getByText('Spread across 2 lines before tax')).toBeInTheDocument();
    expect(screen.getByText('Tax · Phoenix, AZ 8.6%')).toBeInTheDocument();
    expect(screen.getByText('on $41.20 taxable')).toBeInTheDocument();
  });

  it('hides internal cost and margin behind the toggle', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Q-1882');

    expect(screen.getByRole('columnheader', { name: 'Cost' })).toBeInTheDocument();
    // Unknown cost (the fee) is left out of margin, and said so.
    expect(screen.getByText('1 line with unknown cost left out.')).toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: /cost & margin/i }));
    expect(screen.queryByRole('columnheader', { name: 'Cost' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Internal · known cost/)).not.toBeInTheDocument();
  });

  it('words pricing warnings from their code, never the server message', async () => {
    mockApi({
      ...quote,
      status: 'DRAFT',
      warnings: [{ code: 'TAX_RATE_NOT_SET', message: 'Tax rate not set for Phoenix, AZ, so no tax was charged' }],
    });
    renderPage();

    expect(await screen.findByText('Phoenix, AZ has no tax rate set yet.')).toBeInTheDocument();
    expect(screen.queryByText(/so no tax was charged/)).not.toBeInTheDocument();
  });

  it('says who accepted it and that it is locked', async () => {
    mockApi({ ...quote, status: 'ACCEPTED', decidedAt: '2026-10-09T18:00:00Z', acceptedRevision: 2, acceptedByUserId: 'u-1' });
    renderPage();

    expect(await screen.findByText(/recorded by the office · Rev 2\. Accepted quotes are locked\./)).toBeInTheDocument();
  });

  it('names the customer who signed when they approved on their link', async () => {
    mockApi({ ...quote, status: 'ACCEPTED', decidedAt: '2026-10-09T18:00:00Z', acceptedRevision: 2, acceptedByUserId: null, approvedByName: 'Karen Wu' });
    renderPage();

    expect(await screen.findByText(/by Karen Wu, signed on the customer's link · Rev 2\./)).toBeInTheDocument();
  });

  it('shows a legacy quote at its header tax rate, without engine columns', async () => {
    mockApi({
      ...quote,
      pricingModel: 'LEGACY',
      adjustments: [],
      tax: null,
      taxRate: 8,
      subtotal: 100,
      taxAmount: 8,
      totalAmount: 108,
      lineItems: [{ id: 'x', description: 'Lump sum', quantity: 1, unitPrice: 100, lineTotal: 100 }],
    });
    renderPage();

    expect(await screen.findByText(/Created before line pricing/)).toBeInTheDocument();
    expect(screen.getByText('Tax · 8%')).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Adjustments' })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /cost & margin/i })).not.toBeInTheDocument();
  });
});

describe('QuoteDetailPage editing', () => {
  const freeform = {
    id: 'f1', sortOrder: 0, type: 'SERVICE' as const, description: 'Flush drain line', quantity: 1, unitPrice: 95,
    lineTotal: 95, adjustmentAmount: 0, netAmount: 95, taxClass: 'LABOR' as const, taxable: false, unitCost: null,
  };
  const part = {
    id: 'p1', sortOrder: 1, type: 'MATERIAL' as const, description: 'Capacitor 45/5', itemId: 'it-3', itemSku: 'CAP-455',
    quantity: 1, unit: 'ea', unitPrice: 48, lineTotal: 48, adjustmentAmount: 0, netAmount: 48, taxClass: 'MATERIALS' as const,
    taxable: false, unitCost: 18.75,
  };
  const draft: Quote = {
    ...quote, status: 'DRAFT', revision: 1, version: 7, firstSentAt: null, lastSentAt: null,
    adjustments: [], lineItems: [freeform, part], grossSubtotal: 143, adjustmentTotal: 0, subtotal: 143, taxAmount: 0, totalAmount: 143,
  };
  const conflict = (code: string) => Object.assign(new Error(code), { response: { status: 409, data: { code, message: 'server words' } } });

  beforeEach(() => {
    vi.clearAllMocks();
    mockApi(draft);
  });

  it('saves a quantity edit with the version, sending the whole line back', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.put).mockResolvedValue({ data: { ...draft, version: 8, totalAmount: 238 } });
    renderPage();

    const qty = (await screen.findAllByRole('textbox', { name: 'Quantity' }))[0];
    await user.clear(qty);
    await user.type(qty, '2{Enter}');

    expect(apiClient.put).toHaveBeenCalledWith('/financial/quotes/q-1/lines/f1', {
      version: 7, type: 'SERVICE', description: 'Flush drain line', quantity: 2, unitPrice: 95, taxClass: 'LABOR',
    });
    expect((await screen.findAllByText('$238.00')).length).toBeGreaterThan(0);
  });

  it('types description and price only on hand-priced lines; pricebook lines edit quantity', async () => {
    renderPage();
    await screen.findByText('Q-1882');
    expect(screen.getAllByRole('textbox', { name: 'Description' })).toHaveLength(1);
    expect(screen.getAllByRole('textbox', { name: 'Unit price' })).toHaveLength(1);
    expect(screen.getAllByRole('textbox', { name: 'Quantity' })).toHaveLength(2);
  });

  it('queues rapid edits so each goes out with the version the last one returned', async () => {
    const user = userEvent.setup();
    let resolveFirst!: (v: unknown) => void;
    vi.mocked(apiClient.put)
      .mockImplementationOnce(() => new Promise((r) => { resolveFirst = r; }))
      .mockResolvedValueOnce({ data: { ...draft, version: 9 } });
    renderPage();

    const [qty1, qty2] = await screen.findAllByRole('textbox', { name: 'Quantity' });
    await user.clear(qty1);
    await user.type(qty1, '3');
    await user.clear(qty2);
    await user.type(qty2, '4{Enter}');
    expect(apiClient.put).toHaveBeenCalledTimes(1);

    resolveFirst({ data: { ...draft, version: 8, lineItems: [{ ...freeform, quantity: 3 }, part] } });
    await vi.waitFor(() => expect(apiClient.put).toHaveBeenCalledTimes(2));
    expect(vi.mocked(apiClient.put).mock.calls[1][1]).toMatchObject({ version: 8, itemId: 'it-3', quantity: 4 });
  });

  it('reloads on a stale version and says the change was not saved', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.put).mockRejectedValue(conflict('STALE_VERSION'));
    renderPage();

    const qty = (await screen.findAllByRole('textbox', { name: 'Quantity' }))[0];
    await user.clear(qty);
    await user.type(qty, '2{Enter}');

    expect(await screen.findByText(/changed somewhere else/)).toBeInTheDocument();
    expect(screen.getByText(/your last change wasn’t saved/)).toBeInTheDocument();
    expect(vi.mocked(apiClient.get).mock.calls.filter(([u]) => u === '/financial/quotes/q-1').length).toBeGreaterThan(1);
    expect(screen.queryByText('server words')).not.toBeInTheDocument();
  });

  it('adds a freeform line', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.post).mockResolvedValue({ data: { ...draft, version: 8 } });
    renderPage();

    await user.click(await screen.findByRole('button', { name: '+ Add line' }));
    await user.click(screen.getByRole('tab', { name: 'Freeform' }));
    const form = screen.getByRole('form', { name: 'Add freeform line' });
    await user.type(within(form).getByRole('textbox', { name: 'Description' }), 'Haul away old unit');
    await user.selectOptions(within(form).getByRole('combobox', { name: 'Type' }), 'FEE');
    await user.type(within(form).getByRole('textbox', { name: 'Unit price' }), '75');
    await user.click(within(form).getByRole('button', { name: 'Add' }));

    expect(apiClient.post).toHaveBeenCalledWith('/financial/quotes/q-1/lines', {
      version: 7, type: 'FEE', description: 'Haul away old unit', quantity: 1, unitPrice: 75,
    });
  });

  const rates = [
    { id: 'r-reg', name: 'Regular', role: 'REGULAR', billRate: 95, costRate: 38, sortOrder: 0, active: true, createdAt: null, updatedAt: null },
    { id: 'r-ot', name: 'Overtime', role: 'OVERTIME', billRate: 142.5, costRate: 57, sortOrder: 1, active: true, createdAt: null, updatedAt: null },
    { id: 'r-em', name: 'Emergency', role: null, billRate: null, costRate: null, sortOrder: 4, active: true, createdAt: null, updatedAt: null },
    { id: 'r-old', name: 'Saturday', role: null, billRate: 120, costRate: null, sortOrder: 5, active: false, createdAt: null, updatedAt: null },
  ];
  const withRates = (doc: Quote) => {
    vi.mocked(apiClient.get).mockImplementation((url: string) => {
      if (url === '/financial/quotes/q-1') return Promise.resolve({ data: doc });
      if (url === '/financial/labor-rates') return Promise.resolve({ data: rates });
      if (url === '/customers/cust-1') return Promise.resolve({ data: customer });
      if (url === '/work-orders/wo-1') return Promise.resolve({ data: workOrder });
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });
  };

  it('adds labor at a rate type, offering only active rates', async () => {
    const user = userEvent.setup();
    withRates(draft);
    vi.mocked(apiClient.post).mockResolvedValue({ data: { ...draft, version: 8 } });
    renderPage();

    await screen.findByText('Q-1882');
    await vi.waitFor(() => expect(apiClient.get).toHaveBeenCalledWith('/financial/labor-rates'));
    await user.click(screen.getByRole('button', { name: '+ Add line' }));
    await user.click(screen.getByRole('tab', { name: 'Labor' }));
    const form = await screen.findByRole('form', { name: 'Add labor line' });
    expect(within(form).getByRole('radio', { name: /Regular/ })).toBeChecked();
    // A rate with no bill rate shows, but can't be picked.
    expect(within(form).getByRole('radio', { name: /Emergency/ })).toHaveTextContent('Not set');
    expect(within(form).getByRole('radio', { name: /Emergency/ })).toHaveAttribute('aria-disabled', 'true');
    expect(within(form).queryByRole('radio', { name: /Saturday/ })).not.toBeInTheDocument();

    await user.click(within(form).getByRole('radio', { name: /Overtime/ }));
    const hours = within(form).getByRole('textbox', { name: 'Hours' });
    await user.clear(hours);
    await user.type(hours, '2.5');
    expect(within(form).getByText('$356.25')).toBeInTheDocument();
    await user.click(within(form).getByRole('button', { name: 'Add' }));

    expect(apiClient.post).toHaveBeenCalledWith('/financial/quotes/q-1/lines', {
      version: 7, type: 'LABOR', laborRateTypeId: 'r-ot', quantity: 2.5,
    });
  });

  const capItem = {
    id: 'it-9', itemType: 'MATERIAL', feeRole: null, name: 'Capacitor 45/5', sku: 'CAP-455', categoryId: null, unit: 'ea',
    taxClass: 'MATERIALS', pricingMode: 'FIXED', unitPrice: 48, unitCost: 18.75, markupPct: null, laborHours: null,
    materialsCost: null, active: true, version: 1, createdAt: null, updatedAt: null,
  };
  const withPricebook = (results: unknown[], frequent: unknown[] = []) => {
    vi.mocked(apiClient.get).mockImplementation((url: string) => {
      if (url === '/financial/quotes/q-1') return Promise.resolve({ data: draft });
      if (url === '/financial/pricebook/items') return Promise.resolve({ data: { content: results, totalElements: results.length } });
      if (url === '/financial/pricebook/items/frequent') return Promise.resolve({ data: frequent });
      if (url === '/customers/cust-1') return Promise.resolve({ data: customer });
      if (url === '/work-orders/wo-1') return Promise.resolve({ data: workOrder });
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });
  };

  it('adds from the pricebook by keyboard, staying open for the next item', async () => {
    const user = userEvent.setup();
    withPricebook([capItem]);
    vi.mocked(apiClient.post).mockResolvedValue({ data: { ...draft, version: 8 } });
    renderPage();

    await user.click(await screen.findByRole('button', { name: '+ Add line' }));
    expect(screen.getByRole('button', { name: '+ Add line' })).toHaveAttribute('aria-pressed', 'true');
    const search = screen.getByRole('combobox', { name: 'Search pricebook' });
    await user.type(search, 'cap');
    expect(await screen.findByRole('option', { name: /Capacitor 45\/5/ })).toHaveAttribute('aria-selected', 'true');
    expect(apiClient.get).toHaveBeenCalledWith('/financial/pricebook/items', { params: { q: 'cap', active: true, size: 20, billToCustomerId: 'cust-1' } });
    await user.keyboard('{Enter}');

    expect(apiClient.post).toHaveBeenCalledWith('/financial/quotes/q-1/lines', { version: 7, itemId: 'it-9', quantity: 1 });
    expect(await screen.findByText('Added Capacitor 45/5')).toBeInTheDocument();
    expect(search).toHaveValue('');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('combobox', { name: 'Search pricebook' })).not.toBeInTheDocument();
  });

  it('shows frequently used items priced at the customer’s plan before anything is typed', async () => {
    const user = userEvent.setup();
    withPricebook([], [{ ...capItem, planUnitPrice: 43.2, pricingRule: 'PRICE_MULTIPLIER', pricingRuleValue: 0.9 }]);
    vi.mocked(apiClient.post).mockResolvedValue({ data: { ...draft, version: 8 } });
    renderPage();

    await user.click(await screen.findByRole('button', { name: '+ Add line' }));
    expect(await screen.findByText('Frequently used')).toBeInTheDocument();
    expect(apiClient.get).toHaveBeenCalledWith('/financial/pricebook/items/frequent', { params: { size: 6, billToCustomerId: 'cust-1' } });
    const option = screen.getByRole('option', { name: /Capacitor 45\/5/ });
    expect(option).toHaveTextContent('list $48.00 · × 0.9 · plan');
    expect(option).toHaveTextContent('$43.20');
    await user.keyboard('{Enter}');
    expect(apiClient.post).toHaveBeenCalledWith('/financial/quotes/q-1/lines', { version: 7, itemId: 'it-9', quantity: 1 });
  });

  it('says an undated draft gets its expiry when it’s sent', async () => {
    mockApi({ ...draft, quoteDate: null, expirationDate: null });
    renderPage();

    expect(await screen.findByText('Not sent · expiry set when sent')).toBeInTheDocument();
  });

  it('opens a just-created draft ready for its first line, the pricebook search focused', async () => {
    withPricebook([]);
    renderWithProviders(<div />, { routes, initialPath: '/quotes/q-1?add=pricebook' });

    const search = await screen.findByRole('combobox', { name: 'Search pricebook' });
    expect(search).toHaveFocus();
    expect(screen.getByRole('button', { name: '+ Add line' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('says where lines come from on an empty draft', async () => {
    mockApi({ ...draft, lineItems: [], grossSubtotal: 0, subtotal: 0, totalAmount: 0 });
    renderPage();

    expect(await screen.findByText('No lines yet. Add from the pricebook, labor, or a freeform line.')).toBeInTheDocument();
  });

  it('offers a freeform line when nothing in the pricebook matches', async () => {
    const user = userEvent.setup();
    withPricebook([]);
    renderPage();

    await user.click(await screen.findByRole('button', { name: '+ Add line' }));
    await user.type(screen.getByRole('combobox', { name: 'Search pricebook' }), 'Crane rental');
    await user.click(await screen.findByRole('button', { name: 'Add it as a freeform line' }));
    const form = screen.getByRole('form', { name: 'Add freeform line' });
    expect(within(form).getByRole('textbox', { name: 'Description' })).toHaveValue('Crane rental');
  });

  it('switches a labor line to another rate, letting the server reprice and rename it', async () => {
    const user = userEvent.setup();
    const labor = {
      id: 'l1', sortOrder: 2, type: 'LABOR' as const, description: 'Regular', laborRateTypeId: 'r-reg', laborRateTypeName: 'Regular',
      quantity: 2, unit: 'hr', unitPrice: 95, lineTotal: 190, adjustmentAmount: 0, netAmount: 190, taxClass: 'LABOR' as const,
      taxable: false, unitCost: 38,
    };
    withRates({ ...draft, lineItems: [freeform, part, labor] });
    vi.mocked(apiClient.put).mockResolvedValue({ data: { ...draft, version: 8 } });
    renderPage();

    const picker = await screen.findByRole('combobox', { name: 'Labor rate for Regular' });
    await vi.waitFor(() => expect(within(picker).getAllByRole('option')).toHaveLength(3));
    await user.selectOptions(picker, 'r-ot');

    expect(apiClient.put).toHaveBeenCalledWith('/financial/quotes/q-1/lines/l1', {
      version: 7, type: 'LABOR', quantity: 2, taxClass: 'LABOR', laborRateTypeId: 'r-ot',
    });
  });

  it('removes a line with the version as a query param', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.delete).mockResolvedValue({ data: { ...draft, version: 8, lineItems: [part] } });
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Remove Flush drain line' }));
    expect(apiClient.delete).toHaveBeenCalledWith('/financial/quotes/q-1/lines/f1', { params: { version: 7 } });
  });

  it('adds a percent discount to a line, as a fraction, with its reason', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.post).mockResolvedValue({ data: { ...draft, version: 8 } });
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Adjust Flush drain line' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Flush drain line$95.00');
    // Waiving is for fee lines only.
    expect(within(dialog).queryByRole('radio', { name: 'Waive' })).not.toBeInTheDocument();
    await user.type(within(dialog).getByRole('textbox', { name: 'Percent' }), '12.5');
    expect(within(dialog).getByText(/Saves/)).toHaveTextContent('Saves $11.88');
    await user.selectOptions(within(dialog).getByRole('combobox', { name: 'Reason' }), 'GOODWILL');
    await user.type(within(dialog).getByRole('textbox', { name: 'Note' }), 'Second visit');
    await user.click(within(dialog).getByRole('button', { name: 'Apply' }));

    expect(apiClient.post).toHaveBeenCalledWith('/financial/quotes/q-1/adjustments', {
      version: 7, lineId: 'f1', kind: 'PERCENT', value: 0.125, reasonCode: 'GOODWILL', reasonNote: 'Second visit',
    });
  });

  it('starts a fee line on Waive, saving the whole fee', async () => {
    const user = userEvent.setup();
    const trip = {
      id: 't1', sortOrder: 2, type: 'FEE' as const, description: 'Trip charge', quantity: 1, unitPrice: 89, lineTotal: 89,
      adjustmentAmount: 0, netAmount: 89, taxClass: 'FEE' as const, taxable: false, unitCost: null, feeRole: 'TRIP' as const,
    };
    mockApi({ ...draft, lineItems: [freeform, part, trip] });
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Adjust Trip charge' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('radio', { name: 'Waive' })).toBeChecked();
    expect(within(dialog).getByText(/Saves/)).toHaveTextContent('Saves $89.00');
  });

  it('adds a document discount and removes an existing one', async () => {
    const user = userEvent.setup();
    const existing = {
      id: 'd1', lineId: null, kind: 'AMOUNT' as const, value: 20, reasonCode: 'PROMOTION' as const, reasonNote: null, computedAmount: 20,
      sourceType: 'MANUAL' as const, createdByUserId: null, createdAt: '2026-10-07T15:00:00Z',
    };
    mockApi({ ...draft, adjustments: [existing] });
    vi.mocked(apiClient.delete).mockResolvedValue({ data: { ...draft, version: 8 } });
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Document discounts' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByRole('radio', { name: 'Waive' })).not.toBeInTheDocument();
    expect(dialog).toHaveTextContent('Spread over the 2 lines before tax');
    // Worked out on the $143.00 the lines come to; the existing $20 leaves room for it.
    await user.type(within(dialog).getByRole('textbox', { name: 'Percent' }), '10');
    expect(within(dialog).getByText(/Saves/)).toHaveTextContent('Saves $14.30');
    expect(within(dialog).getByRole('button', { name: 'Remove −$20.00 · Promotion' })).toHaveTextContent('Remove (correction)');
    await user.click(within(dialog).getByRole('button', { name: 'Remove −$20.00 · Promotion' }));

    expect(apiClient.delete).toHaveBeenCalledWith('/financial/quotes/q-1/adjustments/d1', { params: { version: 7 } });
  });

  it('reorders lines by dragging from the handle', async () => {
    vi.mocked(apiClient.put).mockResolvedValue({ data: { ...draft, version: 8 } });
    renderPage();
    await screen.findByText('Q-1882');

    const [h1] = screen.getAllByRole('img', { name: 'Drag to reorder line' });
    const rows = screen.getAllByRole('row').slice(1);
    fireEvent.mouseDown(h1);
    const dataTransfer = { effectAllowed: '', dropEffect: '' };
    fireEvent.dragStart(rows[0], { dataTransfer });
    fireEvent.dragOver(rows[1], { dataTransfer });
    fireEvent.drop(rows[1], { dataTransfer });

    await vi.waitFor(() =>
      expect(apiClient.put).toHaveBeenCalledWith('/financial/quotes/q-1/lines/order', { version: 7, lineIds: ['p1', 'f1'] }),
    );
  });

  it('edits the header, keeping the work order’s location', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.put).mockResolvedValue({ data: { ...draft, version: 8 } });
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Edit details' }));
    const dialog = await screen.findByRole('dialog');
    const po = within(dialog).getByRole('textbox', { name: 'Customer PO #' });
    await user.clear(po);
    await user.type(po, 'PO-88');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(apiClient.put).toHaveBeenCalledWith('/financial/quotes/q-1/header', {
      version: 7, title: null, quoteDate: '2026-10-07', expirationDate: '2026-11-06', serviceLocationId: 'loc-1',
      customerPoNumber: 'PO-88', notes: 'Upstairs unit only.',
    });
  });

  it('records an office acceptance through the status endpoint', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.patch).mockResolvedValue({ data: { ...draft, status: 'ACCEPTED', version: 8 } });
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'More actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Mark accepted' }));
    await user.click(await screen.findByRole('button', { name: 'Mark accepted' }));
    expect(apiClient.patch).toHaveBeenCalledWith('/financial/quotes/q-1/status', { status: 'ACCEPTED' });
  });

  it('keeps a sent quote read-only until the CSR confirms a new revision', async () => {
    const user = userEvent.setup();
    mockApi({ ...draft, status: 'SENT', firstSentAt: '2026-10-08T16:00:00Z', lastSentAt: '2026-10-08T16:00:00Z' });
    renderPage();

    await screen.findByText('Q-1882');
    expect(screen.queryByRole('textbox', { name: 'Quantity' })).not.toBeInTheDocument();
    expect(screen.getByText(/Editing moves it back to Draft as Rev 2/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Edit quote' }));
    await user.click(await screen.findByRole('button', { name: 'Edit as Rev 2' }));
    expect(await screen.findAllByRole('textbox', { name: 'Quantity' })).toHaveLength(2);
    expect(screen.getByText(/Your first change moves it back to Draft as Rev 2/)).toBeInTheDocument();
  });

  it('flags an unsent revision and offers to re-send it', async () => {
    mockApi({ ...draft, revision: 2, firstSentAt: '2026-10-08T16:00:00Z', lastSentAt: '2026-10-08T16:00:00Z' });
    renderPage();

    expect(await screen.findByText(/Rev 2 draft\. The customer’s link shows/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Re-send · Rev 2' })).toBeInTheDocument();
  });

  it('offers only Duplicate on an accepted quote, and opens the copy', async () => {
    const user = userEvent.setup();
    mockApi({ ...draft, status: 'ACCEPTED' });
    vi.mocked(apiClient.post).mockResolvedValue({ data: { ...draft, id: 'q-2', quoteNumber: 'Q-1990' } });
    renderPage();

    await screen.findByText('Q-1882');
    expect(screen.queryByRole('textbox', { name: 'Quantity' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Send/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Duplicate' }));
    expect(apiClient.post).toHaveBeenCalledWith('/financial/quotes/q-1/duplicate');
  });
});

describe('QuoteDetailPage billing', () => {
  beforeEach(() => vi.clearAllMocks());

  it('offers to invoice an accepted quote until it is fully invoiced', async () => {
    const accepted: Quote = { ...quote, status: 'ACCEPTED', decidedAt: '2026-10-09T16:00:00Z' };
    const left = (remaining: number) => ({
      quoteId: 'q-1',
      status: 'ACCEPTED',
      lines: [
        { quoteLineId: 'l2', sortOrder: 1, description: 'Regular', type: 'LABOR', unit: 'hr', unitPrice: 125, quantity: 2, invoicedQuantity: 2 - remaining, remainingQuantity: remaining },
      ],
    });
    vi.mocked(apiClient.get).mockImplementation((url: string) => {
      if (url === '/financial/quotes/q-1') return Promise.resolve({ data: accepted });
      if (url === '/financial/quotes/q-1/invoiceable') return Promise.resolve({ data: left(1) });
      if (url === '/customers/cust-1') return Promise.resolve({ data: customer });
      if (url === '/work-orders/wo-1') return Promise.resolve({ data: workOrder });
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });
    renderPage();

    expect(await screen.findByRole('button', { name: 'Create invoice' })).toBeInTheDocument();
    expect(screen.getByText(/50% invoiced so far/)).toBeInTheDocument();
  });
});

