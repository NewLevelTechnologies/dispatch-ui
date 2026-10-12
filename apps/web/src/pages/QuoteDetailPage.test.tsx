/* eslint-disable i18next/no-literal-string -- route placeholders + assertion strings in a test fixture. */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, within } from '@testing-library/react';
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
