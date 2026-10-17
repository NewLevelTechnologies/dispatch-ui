import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../../test/utils';
import { PublicProposal } from './PublicProposal';
import type { PublicPricedSelection, PublicQuoteResponse } from '../../api/setup';

const api = vi.hoisted(() => ({ saveQuoteSelection: vi.fn(), approveProposal: vi.fn() }));

vi.mock('../../api/setup', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/setup')>();
  return { ...actual, publicFinancialApi: { ...actual.publicFinancialApi, ...api } };
});

const totals = (list: number, save: number, rebate: number | null = null) => ({
  listPrice: list,
  youSave: save,
  subtotal: list - save,
  taxAmount: 0,
  totalAmount: list - save,
  rebateAmount: rebate,
  afterRebate: rebate == null ? null : list - save - rebate,
});

function priced(over: Partial<PublicPricedSelection> = {}): PublicPricedSelection {
  return {
    selection: { optionIds: ['o-2'], addOnLineIds: [] },
    lines: [
      { id: 'l-2', description: '3-ton 17 SEER2 two-stage system', optionId: 'o-2', quantity: 1, unitPrice: 15580, lineTotal: 15580, adjustmentAmount: 500, netAmount: 15080, taxAmount: 0, included: false },
      { id: 'l-tstat', description: 'Smart Wi-Fi thermostat', optionId: 'o-2', quantity: 1, unitPrice: 0, lineTotal: 0, adjustmentAmount: 0, netAmount: 0, taxAmount: 0, included: true },
    ],
    savings: [{ adjustmentId: 'a-1', lineId: null, kind: 'AMOUNT', reasonCode: 'PROMOTION', label: null, amount: 500 }],
    totals: totals(15580, 500, 400),
    options: [
      { optionId: 'o-1', groupId: 'g-1', name: 'Essential', selected: false, savings: [], totals: totals(11480, 0) },
      { optionId: 'o-2', groupId: 'g-1', name: 'Comfort', selected: true, savings: [], totals: totals(15580, 500, 400) },
    ],
    priceRange: { low: 11480, high: 15080 },
    ...over,
  };
}

function page(quote: Partial<PublicQuoteResponse['quote']> = {}, over: Partial<PublicQuoteResponse> = {}): PublicQuoteResponse {
  return {
    tenant: {
      displayName: 'Coolfront Heating & Air', companySlogan: null, supportEmail: null, supportPhone: '(602) 555-0100',
      logoUrl: null, streetAddress: null, city: null, state: null, zipCode: null,
    },
    customer: { id: 'c-1', name: 'Tanya Reyes' },
    quote: {
      quoteNumber: 'Q-1907', status: 'SENT', quoteDate: '2026-10-11', expirationDate: '2026-10-31', revision: 2,
      subtotal: '15080', taxRate: '0', taxAmount: '0', totalAmount: '15080', notes: null, lineItems: [],
      presentation: 'PROPOSAL',
      coverNote: 'Thanks for walking me through the house today.',
      advisor: { name: 'Danny Ortiz', phone: '(602) 555-0147' },
      expired: false,
      proposal: {
        groups: [{
          id: 'g-1', name: 'Options', options: [
            { id: 'o-1', name: 'Essential', tagline: 'Dependable cooling', recommended: false, specs: ['15.2 SEER2'], highlights: ['10-yr parts'], photos: [], lines: [] },
            { id: 'o-2', name: 'Comfort', tagline: 'Quieter, steadier', recommended: true, specs: ['17 SEER2'], highlights: [], photos: [], rebateAmount: 400, lines: [] },
          ],
        }],
        addOns: [
          { lineId: 'l-ducts', description: 'Duct sealing', quantity: 1, lineTotal: 1850, recommended: true, recommendationNote: 'Your ducts leak 27%.', modes: {} },
          { lineId: 'l-tstat', description: 'Smart Wi-Fi thermostat', quantity: 1, lineTotal: 420, recommended: false, modes: { 'o-2': 'INCLUDED' } },
          { lineId: 'l-blanket', description: 'Sound blanket', quantity: 1, lineTotal: 260, recommended: false, modes: { 'o-2': 'HIDDEN' } },
        ],
      },
      selection: priced(),
      approval: null,
      ...quote,
    },
    ...over,
  };
}

const onReplace = vi.fn();
const onReload = vi.fn();
const renderPage = (data = page()) => renderWithProviders(<PublicProposal data={data} token="tok" onReplace={onReplace} onReload={onReload} />);

beforeEach(() => {
  vi.clearAllMocks();
  api.saveQuoteSelection.mockResolvedValue(priced());
  // jsdom can't draw: stand in for a signature.
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
    scale: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(), clearRect: vi.fn(),
  })) as unknown as typeof HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.toDataURL = vi.fn(() => 'data:image/png;base64,SIG');
});

describe('PublicProposal', () => {
  it('opens on the options, side by side, priced by the server, the saved one selected', () => {
    renderPage();

    expect(screen.getByText('Thanks for walking me through the house today.')).toBeInTheDocument();
    const [essential, comfort] = screen.getAllByTestId('pp-option');
    expect(essential).toHaveTextContent('$11,480');
    expect(within(comfort).getByText('public.proposal.popular')).toBeInTheDocument();
    expect(comfort).toHaveTextContent('$15,080');
    expect(within(comfort).getByRole('button', { name: /public.proposal.selected/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getAllByTestId('pp-cart')[0]).toHaveTextContent('$15,080');
  });

  it('saves a new choice and shows what the server prices it at', async () => {
    api.saveQuoteSelection.mockResolvedValue(priced({ selection: { optionIds: ['o-1'], addOnLineIds: [] }, totals: totals(11480, 0) }));
    const user = userEvent.setup();
    renderPage();

    const [essential] = screen.getAllByTestId('pp-option');
    await user.click(within(essential).getByRole('button', { name: 'public.proposal.select' }));
    await waitFor(() => expect(api.saveQuoteSelection).toHaveBeenCalledWith('tok', { optionIds: ['o-1'], addOnLineIds: [] }), { timeout: 2000 });
    await waitFor(() => expect(screen.getAllByTestId('pp-cart')[0]).toHaveTextContent('$11,480'));
  });

  it('offers the add-ons the chosen option offers: included ones say so, hidden ones are gone', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: /public.proposal.steps.addons/ }));
    const addOns = screen.getAllByTestId('pp-addon');
    expect(addOns).toHaveLength(2);
    expect(addOns[0]).toHaveTextContent('“Your ducts leak 27%.”');
    expect(addOns[1]).toHaveTextContent('public.proposal.addons.included');
    await user.click(within(addOns[0]).getByRole('button', { name: 'public.proposal.addons.addLabel' }));
    await waitFor(() => expect(api.saveQuoteSelection).toHaveBeenCalledWith('tok', { optionIds: ['o-2'], addOnLineIds: ['l-ducts'] }), { timeout: 2000 });
  });

  it('signs: the choice, the total shown, the signature and consent', async () => {
    api.approveProposal.mockResolvedValue(page({ status: 'ACCEPTED' }));
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: /public.proposal.steps.review/ }));
    expect(screen.getByTestId('pp-total')).toHaveTextContent('$15,080.00');
    const approve = screen.getAllByRole('button', { name: 'public.proposal.approve' })[0];
    expect(approve).toBeDisabled();

    const pad = screen.getByLabelText('public.proposal.review.signatureLabel');
    fireEvent.pointerDown(pad, { clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(pad, { clientX: 40, clientY: 20, pointerId: 1 });
    fireEvent.pointerUp(pad, { pointerId: 1 });
    await user.click(screen.getByRole('checkbox'));
    expect(screen.getByLabelText('public.proposal.review.name')).toHaveValue('Tanya Reyes');
    await user.click(approve);

    expect(api.approveProposal).toHaveBeenCalledWith('tok', {
      revision: 2,
      signerName: 'Tanya Reyes',
      signature: 'data:image/png;base64,SIG',
      consent: true,
      selection: { optionIds: ['o-2'], addOnLineIds: [] },
      totalAmount: 15080,
    });
    await waitFor(() => expect(onReplace).toHaveBeenCalled());
  });

  it('asks to sign again when the total changed, and reloads', async () => {
    api.approveProposal.mockRejectedValue(
      Object.assign(new Error('409'), { isAxiosError: true, response: { status: 409, data: { code: 'QUOTE_TOTAL_CHANGED' } } }),
    );
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: /public.proposal.steps.review/ }));
    const pad = screen.getByLabelText('public.proposal.review.signatureLabel');
    fireEvent.pointerDown(pad, { clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerUp(pad, { pointerId: 1 });
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getAllByRole('button', { name: 'public.proposal.approve' })[0]);

    expect(await screen.findByText('public.proposal.notice.totalChanged')).toBeInTheDocument();
    expect(onReload).toHaveBeenCalled();
  });

  it('shows the signed copy once approved', () => {
    renderPage(
      page({
        status: 'ACCEPTED',
        approval: {
          signerName: 'Tanya Reyes', signedAt: '2026-10-13T15:11:00Z', signatureImage: 'data:image/png;base64,SIG',
          consent: true, revision: 2, selection: { optionIds: ['o-2'], addOnLineIds: [] },
          lines: priced().lines, savings: priced().savings, totals: totals(15580, 500, 400),
        },
      }),
    );

    const copy = screen.getByTestId('pp-signed-copy');
    expect(copy).toHaveTextContent('3-ton 17 SEER2 two-stage system');
    expect(copy).toHaveTextContent('$15,080.00');
    expect(within(copy).getByRole('img')).toHaveAttribute('src', 'data:image/png;base64,SIG');
    expect(screen.queryAllByTestId('pp-option')).toHaveLength(0);
  });

  it('says an expired proposal needs refreshing, with no choosing', () => {
    renderPage(page({ expired: true, selection: null }));
    expect(screen.getByText('public.proposal.expired.title')).toBeInTheDocument();
    expect(screen.queryAllByTestId('pp-option')).toHaveLength(0);
  });

  it('lets the office’s preview look but not choose or sign', async () => {
    const user = userEvent.setup();
    renderPage(page({ status: 'DRAFT' }, { preview: true }));

    const [essential] = screen.getAllByTestId('pp-option');
    expect(within(essential).getByRole('button', { name: 'public.proposal.select' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: /public.proposal.steps.review/ }));
    expect(screen.queryByLabelText('public.proposal.review.signatureLabel')).not.toBeInTheDocument();
    expect(screen.getAllByText('public.proposal.previewHint').length).toBeGreaterThan(0);
  });

  it('shows the offers that end in a banner: a promotion by name, decide-today with its date', () => {
    const deal = priced({
      savings: [
        { adjustmentId: 'p-1', lineId: null, kind: 'AMOUNT', reasonCode: 'PROMOTION', label: 'Fall Comfort Event', amount: 500, sourceType: 'PROMOTION', validThrough: '2026-10-31' },
        { adjustmentId: 'a-9', lineId: null, kind: 'AMOUNT', reasonCode: 'INCENTIVE', label: null, amount: 350, sourceType: 'MANUAL', validThrough: '2099-10-12' },
      ],
    });
    renderPage(page({ selection: deal }));

    const banner = screen.getByTestId('pp-deals');
    expect(banner).toHaveTextContent('Fall Comfort Event · public.proposal.deals.ends');
    expect(banner).toHaveTextContent('public.proposal.decideToday · $350 public.proposal.deals.off · public.proposal.deals.approveBy');
  });

  it('offers the membership in its own step: what it costs, what it saves, and joining prices it', async () => {
    const club = {
      planId: 'plan-1', name: 'Comfort Club', amount: 19, cadenceUnit: 'MONTH', cadenceInterval: 1,
      laborDiscountPct: 0.15, partsDiscountPct: null, tripFeeWaived: true,
    };
    const base = priced();
    const offered = priced({
      membership: club,
      totals: { ...totals(15580, 500, 400), joinSaves: 239 },
      options: base.options.map((o) => ({ ...o, totals: { ...o.totals, joinSaves: 239 } })),
    });
    api.saveQuoteSelection.mockResolvedValue({ ...offered, selection: { ...offered.selection, joinMembership: true } });
    const user = userEvent.setup();
    renderPage(page({ selection: offered }));

    // The cards say what members save before anyone joins.
    expect(screen.getAllByTestId('pp-option')[1]).toHaveTextContent('public.proposal.club.cardSaves');
    await user.click(screen.getByRole('button', { name: /public.proposal.steps.protect/ }));
    const card = screen.getByTestId('pp-club');
    expect(card).toHaveTextContent('Comfort Club');
    expect(card).toHaveTextContent('public.proposal.club.saves');
    expect(card).toHaveTextContent('public.proposal.club.benefit.labor');
    expect(card).toHaveTextContent('public.proposal.club.benefit.trip');
    expect(card).not.toHaveTextContent('public.proposal.club.benefit.parts');
    await user.click(within(card).getByRole('button', { name: 'public.proposal.club.add' }));
    await waitFor(
      () => expect(api.saveQuoteSelection).toHaveBeenCalledWith('tok', { optionIds: ['o-2'], addOnLineIds: [], joinMembership: true }),
      { timeout: 2000 },
    );
    await waitFor(() => expect(screen.getAllByTestId('pp-cart')[0]).toHaveTextContent('Comfort Club'));
  });
});
